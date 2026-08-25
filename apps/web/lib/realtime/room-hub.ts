import { Room, connectDb, type RoomDoc } from '@xox/db'

/**
 * ADR-0002 · Instance başına **EN FAZLA BİR** change stream.
 *
 * Bu, tasarımın en sert değişmezi ve bir tercih değil bir kısıt: MongoDB'nin
 * kendi dokümanına göre her açık change stream havuzdan bir bağlantıyı
 * `getMore` ile tutar; `packages/db` `maxPoolSize: 10` kullanıyor. "Her WS
 * bağlantısı kendi odasına abone olsun" tasarımı 5 oyuncuda havuzun yarısını,
 * 10 oyuncuda tamamını kilitlerdi.
 *
 * Bu dosya bu yüzden bir **kayıt defteri**dir: bir stream, çok abone. Oda
 * filtresi sunucuda değil süreç içinde (`subscribers.get(code)`), çünkü
 * (1) abone oda kümesi dinamiktir ve her `join`de stream'i yeniden açmak olay
 * kaybı + resume token riski doğurur, (2) `fullDocument.*` üzerinde `$match`
 * + `updateLookup` birleşimi "Resume Token Not Found" hata sınıfına girer.
 */

/** Change stream'in bu modülün ihtiyaç duyduğu kadarı — test sahte sürücü verir. */
export interface ChangeStreamLike {
  on(event: string, listener: (payload: unknown) => void): unknown
  close(): Promise<void>
}

export interface RoomSubscriber {
  /** Hangi odayı dinlediği. Abonelik defterinin anahtarı budur. */
  readonly roomCode: string
  /** Odanın yeni hâli geldi (insert/update/replace). */
  onRoomChange(room: RoomDoc): void
  /** Oda silindi (TTL ya da reset) — `delete` olayı `fullDocument` taşımaz. */
  onRoomDeleted(): void
  /**
   * Stream koptu ve yeniden açıldı: kaçırılan olaylar YENİDEN OYNATILMAZ,
   * bunun yerine taze oda dokümanı zorla yayınlanır (§3.10 "sessizce sağır
   * kalmak yasak"). Oda artık yoksa `null` gelir.
   */
  onForcedState(room: RoomDoc | null): void
}

export interface RoomHubDeps {
  connect: () => Promise<void>
  watch: (pipeline: Record<string, unknown>[], options: Record<string, unknown>) => ChangeStreamLike
  findRoom: (code: string) => Promise<RoomDoc | null>
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  logError: (message: string, error: unknown) => void
}

export interface RoomHubStats {
  /** Ömrü boyunca kaç kez `watch` çağrıldı — tek-stream sondasının ölçtüğü sayı. */
  watchCalls: number
  /** Şu an açık stream sayısı: yalnız 0 ya da 1 olabilir. */
  openStreams: number
  rooms: number
  subscribers: number
  reopenAttempts: number
  hasResumeToken: boolean
}

export interface RoomHub {
  subscribe(subscriber: RoomSubscriber): Promise<void>
  unsubscribe(subscriber: RoomSubscriber): Promise<void>
  stats(): RoomHubStats
}

/** ADR-0002: pipeline YALNIZ `operationType` üzerinde filtreler. */
const PIPELINE: Record<string, unknown>[] = [
  { $match: { operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } },
]

/** ADR-0002: 500 ms → 10 sn üstel geri çekilme. Çıplak sayı bilerek. */
const REOPEN_BASE_MS = 500
const REOPEN_MAX_MS = 10_000
/** Bu kadar ardışık başarısız yeniden açılıştan sonra `resumeToken` düşürülür. */
const MAX_ATTEMPTS_BEFORE_TOKEN_DROP = 3

interface ChangePayload {
  operationType: string
  code: string | null
  id: string | null
  room: RoomDoc | null
}

/**
 * `_id` bir `ObjectId` olabilir; `String(objectId)` `[object Object]` üretmez
 * ama tip düzeyinde bunu garanti edemeyiz. Yalnız güvenli iki biçim
 * (string ve `toHexString()` taşıyan nesne) kabul edilir — geri kalanı
 * anahtar olarak kullanılmaz, çünkü çakışan bir anahtar YANLIŞ odaya
 * `delete` yayınlardı.
 */
function readDocumentId(documentKey: unknown): string | null {
  if (typeof documentKey !== 'object' || documentKey === null) return null
  const rawId = (documentKey as Record<string, unknown>)['_id']
  if (typeof rawId === 'string') return rawId
  if (typeof rawId !== 'object' || rawId === null) return null
  const toHex = (rawId as { toHexString?: unknown }).toHexString
  if (typeof toHex !== 'function') return null
  const hex: unknown = (toHex as () => unknown).call(rawId)
  return typeof hex === 'string' ? hex : null
}

/** Sürücüden gelen olay `unknown`dır: `delete` fullDocument taşımaz, `updateLookup` null dönebilir. */
function readChange(change: unknown): ChangePayload | null {
  if (typeof change !== 'object' || change === null) return null
  const event = change as Record<string, unknown>
  const operationType = event['operationType']
  if (typeof operationType !== 'string') return null

  const id = readDocumentId(event['documentKey'])

  const doc = event['fullDocument']
  if (typeof doc !== 'object' || doc === null) {
    return { operationType, code: null, id, room: null }
  }
  const code = (doc as Record<string, unknown>)['code']
  if (typeof code !== 'string') return { operationType, code: null, id, room: null }
  return { operationType, code, id, room: doc as RoomDoc }
}

export function createRoomHub(deps: RoomHubDeps): RoomHub {
  const subscribers = new Map<string, Set<RoomSubscriber>>()
  /** `delete` olayı yalnız `_id` taşır; kodu buradan buluruz. */
  const codeById = new Map<string, string>()

  let stream: ChangeStreamLike | null = null
  let watchCalls = 0
  let opening: Promise<void> | null = null
  let resumeToken: unknown = undefined
  let reopenAttempts = 0
  let reopenTimer: unknown = null
  /** Bilerek kapatıyoruz: `close` olayı yeniden açılışı TETİKLEMEMELİ. */
  let closingOnPurpose = false

  function totalSubscribers(): number {
    let total = 0
    for (const set of subscribers.values()) total += set.size
    return total
  }

  function closeQuietly(target: ChangeStreamLike): void {
    target.close().catch((error: unknown) => {
      deps.logError('change stream kapatılamadı', error)
    })
  }

  function dispatch(payload: ChangePayload): void {
    // Eşleme yalnız ABONESİ OLAN odalar için tutulur. Koşulsuz yazsaydık bu
    // instance'ın gördüğü HER odanın `_id → code` kaydı birikir ve uzun ömürlü
    // bir Fluid instance'ında sınırsız büyürdü — abonesi olmayan bir odanın
    // `delete` olayını zaten kimseye iletmiyoruz.
    if (payload.id !== null && payload.code !== null && subscribers.has(payload.code)) {
      codeById.set(payload.id, payload.code)
    }

    if (payload.operationType === 'delete') {
      if (payload.id === null) return
      const code = codeById.get(payload.id)
      if (code === undefined) return
      codeById.delete(payload.id)
      for (const subscriber of subscribers.get(code) ?? []) subscriber.onRoomDeleted()
      return
    }

    if (payload.code === null || payload.room === null) return
    for (const subscriber of subscribers.get(payload.code) ?? []) {
      subscriber.onRoomChange(payload.room)
    }
  }

  /**
   * Oplog penceresi aşıldığında (Atlas election, uzun kopma) sürücü
   * `ChangeStreamHistoryLost` (286) / `ChangeStreamFatalError` (280) atar.
   * Bu hatalar TOKEN'IN KENDİSİNDEN kaynaklanır: aynı `startAfter` ile
   * yeniden denemek sonsuza dek aynı hatayı üretir.
   */
  function isFatalResumeError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    const candidate = error as { code?: unknown; codeName?: unknown; message?: unknown }
    if (candidate.code === 286 || candidate.code === 280) return true
    const label = typeof candidate.codeName === 'string' ? candidate.codeName : ''
    if (label === 'ChangeStreamHistoryLost' || label === 'ChangeStreamFatalError') return true
    const message = typeof candidate.message === 'string' ? candidate.message : ''
    return /ChangeStreamHistoryLost|ChangeStreamFatalError|resume token/i.test(message)
  }

  /**
   * ⚠️ **ZEHİRLİ TOKEN.** `resumeToken` yalnız `closeStream()`te temizlenseydi,
   * dolu bir odada (yani `closeStream` hiç çağrılmazken) geçersizleşen bir
   * token o instance'ı KALICI OLARAK SAĞIR bırakırdı: her yeniden açılış aynı
   * `startAfter` ile aynı hatayı alır, `reopenAttempts` 10 sn tavanına yapışır.
   * Belirti tam da R1'in bedelidir — oyuncular hamle yazabilir (`applyMove`
   * başarılı, `version` artar) ama YAZAN DÂHİL kimse hiçbir şey görmez.
   *
   * Doğruluk kaybı yok: taze açılıştan sonra `forceStateToAll` kaçırılan
   * olayların yerine tam `state` yayınlıyor.
   */
  function dropPoisonedToken(reason: string): void {
    if (resumeToken === undefined) return
    resumeToken = undefined
    deps.logError(`resume token düşürüldü (${reason}) — taze stream açılacak`, null)
  }

  function attach(current: ChangeStreamLike): void {
    // Her dinleyici "hâlâ GÜNCEL stream miyim" diye sorar: kapanan bir
    // stream'in geç gelen `close`/`error` olayı ikinci bir yeniden açılış
    // zinciri başlatmasın.
    const isCurrent = (): boolean => stream === current

    current.on('resumeTokenChanged', (token: unknown) => {
      if (!isCurrent()) return
      // ⚠️ `stream.resumeToken` mongoose sarmalayıcısında YOKTUR (tipte var,
      // çalışma anında undefined). Tek güvenilir kaynak bu olaydır.
      resumeToken = token
      reopenAttempts = 0
    })

    current.on('change', (change: unknown) => {
      if (!isCurrent()) return
      // Yaşam kanıtı: gerçekten olay taşıyan bir stream sayacı sıfırlar.
      // "Açıldı" demek yetmez — açılır açılmaz ölen stream geri çekilmeyi
      // öldürürdü (CTR-002 dersi).
      reopenAttempts = 0
      const payload = readChange(change)
      if (payload === null) return
      dispatch(payload)
    })

    current.on('error', (error: unknown) => {
      if (!isCurrent()) return
      deps.logError('change stream hatası', error)
      if (isFatalResumeError(error)) dropPoisonedToken('ölümcül resume hatası')
      failCurrent(current)
    })

    current.on('close', () => {
      if (!isCurrent()) return
      failCurrent(current)
    })
  }

  function failCurrent(current: ChangeStreamLike): void {
    if (closingOnPurpose) return
    stream = null
    closeQuietly(current)
    scheduleReopen()
  }

  function scheduleReopen(): void {
    if (reopenTimer !== null) return
    const delay = Math.min(REOPEN_BASE_MS * 2 ** reopenAttempts, REOPEN_MAX_MS)
    reopenAttempts += 1
    // Hata sınıfı tanınmasa bile: art arda bu kadar başarısızlıktan sonra
    // token'dan şüphelen ve taze aç. Sürücüler hata kodunu her sürümde aynı
    // yerde taşımıyor; sınıf tanıma tek savunma hattı olamaz.
    if (reopenAttempts >= MAX_ATTEMPTS_BEFORE_TOKEN_DROP) {
      dropPoisonedToken(`${String(reopenAttempts)} ardışık başarısızlık`)
    }
    reopenTimer = deps.setTimer(() => {
      reopenTimer = null
      void reopen()
    }, delay)
  }

  async function reopen(): Promise<void> {
    if (totalSubscribers() === 0) return
    await ensureStream()
    if (stream === null) return
    await forceStateToAll()
  }

  /**
   * Yeniden açılıştan sonra tüm yerel abonelere taze `state`. Okuma **oda
   * başına** yapılır, bağlantı başına değil: aynı odadaki iki oyuncu tek
   * sorguyla eşitlenir.
   */
  async function forceStateToAll(): Promise<void> {
    const codes = [...subscribers.keys()]
    for (const code of codes) {
      const set = subscribers.get(code)
      if (set === undefined || set.size === 0) continue
      let room: RoomDoc | null
      try {
        room = await deps.findRoom(code)
      } catch (error) {
        deps.logError('yeniden açılış sonrası oda okunamadı', error)
        continue
      }
      for (const subscriber of set) subscriber.onForcedState(room)
    }
  }

  async function openStream(): Promise<void> {
    // Tek-stream değişmezinin TEK bekçisi `ensureStream`tir. Burada ikinci bir
    // `if (stream !== null) return` vardı; tek çağıran `ensureStream` aynı
    // senkron tikte aynı koşulu zaten kontrol ettiği için ULAŞILAMAZ dal
    // oluyordu ve mutasyon sondasını yanıltıyordu (inceleme bulgusu).
    try {
      await deps.connect()
      if (totalSubscribers() === 0) return
      const options: Record<string, unknown> = { fullDocument: 'updateLookup' }
      // `resumeAfter` DEĞİL `startAfter`: `invalidate` sonrası yalnız bu çalışır.
      if (resumeToken !== undefined) options['startAfter'] = resumeToken
      const opened = deps.watch(PIPELINE, options)
      watchCalls += 1
      stream = opened
      attach(opened)
    } catch (error) {
      deps.logError('change stream açılamadı', error)
      stream = null
      scheduleReopen()
    }
  }

  function ensureStream(): Promise<void> {
    if (stream !== null) return Promise.resolve()
    opening ??= openStream().finally(() => {
      opening = null
    })
    return opening
  }

  async function closeStream(): Promise<void> {
    if (reopenTimer !== null) {
      deps.clearTimer(reopenTimer)
      reopenTimer = null
    }
    reopenAttempts = 0
    // Bayat bir token `Resume Token Not Found` üretir; aboneler zaten yeni
    // bağlantıda tam `state` alacağı için token'ı taşımanın değeri yok.
    resumeToken = undefined
    codeById.clear()
    const current = stream
    if (current === null) return
    closingOnPurpose = true
    stream = null
    try {
      await current.close()
    } catch (error) {
      deps.logError('change stream kapatılamadı', error)
    } finally {
      closingOnPurpose = false
    }
  }

  return {
    async subscribe(subscriber: RoomSubscriber): Promise<void> {
      const set = subscribers.get(subscriber.roomCode) ?? new Set<RoomSubscriber>()
      set.add(subscriber)
      subscribers.set(subscriber.roomCode, set)
      await ensureStream()
    },

    async unsubscribe(subscriber: RoomSubscriber): Promise<void> {
      const set = subscribers.get(subscriber.roomCode)
      if (set !== undefined) {
        set.delete(subscriber)
        if (set.size === 0) subscribers.delete(subscriber.roomCode)
      }
      if (totalSubscribers() > 0) return
      await closeStream()
    },

    stats(): RoomHubStats {
      return {
        watchCalls,
        openStreams: stream === null ? 0 : 1,
        rooms: subscribers.size,
        subscribers: totalSubscribers(),
        reopenAttempts,
        hasResumeToken: resumeToken !== undefined,
      }
    },
  }
}

/**
 * Modül kapsamı: bu Fluid instance'ının **tek** hub'ı. `Room.watch` yalnız
 * buradan çağrılır; başka bir yerde `watch` çağıran kod ADR-0002'yi ihlal eder.
 *
 * ⚠️ Mongoose'un `Model.watch()` dönüşü TİPTE `mongodb.ChangeStream`dır ama
 * ÇALIŞMA ANINDA kendi sarmalayıcısıdır: `resumeToken` alanı YOKTUR ve
 * tiplerde görünmeyen bir `ready` olayı yayınlar. Bu yüzden dönüş
 * `ChangeStreamLike`a daraltılıyor — tipin vaat ettiği alanlara değil,
 * gerçekten var olan olaylara bağlıyız.
 */
const globalForHub = globalThis as unknown as { __xoxRoomHub?: RoomHub }

/**
 * `packages/db/src/client.ts`in `__xoxMongoose` kalıbı. Modül kapsamı TEK
 * BAŞINA yetmez: hot-reload, iki ayrı bundle chunk'ı ya da aynı modülün iki
 * yoldan çözülmesi hub'ı **ikizler** ve o anda instance'ta iki `Room.watch`
 * açılır — ADR-0002'nin en sert değişmezi tam da bu şekilde sessizce delinir
 * (havuz `maxPoolSize: 10`). `globalThis` bunu kapatır.
 */
export const roomHub: RoomHub = (globalForHub.__xoxRoomHub ??= createRoomHub({
  connect: async () => {
    await connectDb()
  },
  watch: (pipeline, options) => Room.watch<RoomDoc>(pipeline, options),
  findRoom: (code) => Room.findOne({ code }).lean(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  },
  logError: (message, error) => {
    console.error(`[room-hub] ${message}`, error)
  },
}))
