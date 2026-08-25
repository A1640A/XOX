import type { RoomDoc } from '@xox/db'
import { WS_CLOSE, WS_IDLE_TIMEOUT_MS, clientMessageSchema } from '@xox/shared'
import type { ClientMessage } from '@xox/shared'
import { createRoomConnection, type RoomConnection, type ServerSocket } from './connection'
import type { HandlerContext, HandlerIdentity, RoomTransitions } from './context'
import { dispatchMessage } from './handlers/index'
import type { RoomHub, RoomSubscriber } from './room-hub'
import { scheduleRotation, type ScheduledRotation } from './rotate'
import { createSettlementTimer, type SettlementTimer } from './timers'

export interface RoomSessionDeps {
  readonly roomCode: string
  readonly connId: string
  readonly identity: HandlerIdentity
  readonly socket: ServerSocket
  readonly hub: RoomHub
  readonly db: RoomTransitions
  readonly now: () => number
  readonly setTimer: (callback: () => void, ms: number) => unknown
  readonly clearTimer: (handle: unknown) => void
  /** `@vercel/functions`'ın `getDeadline`'ı; route enjekte eder (ADR-0007). */
  readonly getDeadline: () => Date | undefined
  readonly logError: (message: string, error: unknown) => void
  readonly rotateMarginMs?: number
  readonly idleTimeoutMs?: number
  /** W2-01 gerçek zamanlayıcıyı yazana kadar no-op iskelet; testte gözlenir. */
  readonly settlementTimer?: SettlementTimer
}

export interface RoomSession {
  /** §5.2 adım 4-9: settle → abone ol → join → tam durum → zamanlayıcılar. */
  start(): Promise<void>
  /** Bir WS çerçevesi geldi (metne indirgenmiş). */
  handleMessage(raw: string): Promise<void>
  /** §5.2 adım 10: abonelikten düş, koltuğu koşullu bırak, zamanlayıcıları kapat. */
  end(): Promise<void>
  readonly connection: RoomConnection
}

/**
 * Geçici sunucu hatası. Bilerek 4xxx DEĞİL: `ws-close.ts`in kalıcı kapanış
 * listesi (4400/4403/4404/4409) istemciyi yeniden bağlanmaktan ALIKOYAR ve
 * geçici bir CAS yarışı ya da Atlas hıçkırığı kalıcı bir kilide dönüşürdü.
 * Standart 1011 sınıflandırılmamıştır → istemci üstel geri çekilmeyle döner.
 */
const WS_CLOSE_INTERNAL_ERROR = 1011

function parseClientMessage(raw: string): ClientMessage | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = clientMessageSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/**
 * Bir WS bağlantısının tüm yaşam döngüsü (tasarım §5.2).
 *
 * Route dosyası bilinçli olarak ince: kimliği çözer, oda kodunu okur ve
 * upgrade eder. Buradaki mantığın hiçbiri `next-auth` import etmez, bu yüzden
 * Vitest'te GERÇEKTEN koşturulabilir (repo konvansiyonu: next-auth'a bağlı
 * dosyalar birim testte yüklenemez).
 */
export function createRoomSession(deps: RoomSessionDeps): RoomSession {
  const connection = createRoomConnection({
    roomCode: deps.roomCode,
    connId: deps.connId,
    userId: deps.identity.userId,
    socket: deps.socket,
    now: deps.now,
  })

  const settlementTimer: SettlementTimer =
    deps.settlementTimer ??
    createSettlementTimer({
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer,
      now: deps.now,
      onDue: () => {
        void settle()
      },
    })

  const context: HandlerContext = {
    roomCode: deps.roomCode,
    connId: deps.connId,
    identity: deps.identity,
    connection,
    db: deps.db,
    now: deps.now,
  }

  /**
   * Hub ile bağlantı arasındaki tel. Her olaydan sonra süre zamanlayıcısı
   * tazelenir — W2-01 gövdeyi doldurduğunda kablolama zaten yerinde olsun.
   */
  const subscriber: RoomSubscriber = {
    roomCode: deps.roomCode,
    onRoomChange(room: RoomDoc): void {
      connection.onRoomChange(room)
      settlementTimer.schedule(room)
    },
    onForcedState(room: RoomDoc | null): void {
      connection.onForcedState(room)
      if (room !== null) settlementTimer.schedule(room)
    },
    onRoomDeleted(): void {
      connection.onRoomDeleted()
    },
  }

  let rotation: ScheduledRotation | null = null
  let idleHandle: unknown = null
  let subscribed = false
  let ended = false

  /**
   * KK-075 — **tembel kesinleştirme**. Ölü bir instance'ın zamanlayıcısı
   * kaybolsa bile sonuç bir sonraki temasta (rakibin hamlesi, yeniden
   * bağlanma, hatta `ping`) kesinleşir.
   *
   * Hata YUTULUR ve bağlantıyı düşürmez: `settleDeadlines` şu an
   * `packages/db`'de fırlatan bir iskelet (W2-01 doldurur) ve dolduktan sonra
   * da bir Atlas hatası bütün oyunu koparmamalı — kesinleştirme bir sonraki
   * temasta yeniden denenir.
   */
  async function settle(): Promise<void> {
    try {
      await deps.db.settleDeadlines(deps.roomCode, deps.now())
    } catch (error) {
      deps.logError('settleDeadlines uygulanamadı', error)
    }
  }

  function armIdle(): void {
    if (idleHandle !== null) deps.clearTimer(idleHandle)
    idleHandle = deps.setTimer(() => {
      idleHandle = null
      connection.close(WS_CLOSE.IDLE_TIMEOUT, 'idle')
    }, deps.idleTimeoutMs ?? WS_IDLE_TIMEOUT_MS)
  }

  function cancelTimers(): void {
    rotation?.cancel()
    rotation = null
    if (idleHandle !== null) {
      deps.clearTimer(idleHandle)
      idleHandle = null
    }
    settlementTimer.cancel()
  }

  /**
   * Gelen çerçeveler **sırayla** işlenir. `ws.on('message')` dinleyicileri
   * sırayla ateşlenir ama gövdeleri asenkrondur: iki hamle art arda gelirse
   * ikincisinin `applyMove`ı birincisinin CAS'ından ÖNCE okuma yapabilir ve
   * sırası gelen oyuncu haksız yere `not-your-turn` yer. Kuyruk, `start()`
   * bitmeden gelen bir mesajın koltuksuz işlenmesini de engeller.
   */
  let queue: Promise<void> = Promise.resolve()
  function enqueue(task: () => Promise<void>): Promise<void> {
    const next = queue.then(task)
    // Kuyruğun devam edebilmesi için reddi yutmak ZORUNDAYIZ, ama SESSİZCE
    // yutmak teşhisin ölmesi demek: `unhandledRejection` bile oluşmuyordu.
    queue = next.catch((error: unknown) => {
      deps.logError('kuyruk görevi reddedildi', error)
    })
    return next
  }

  /**
   * §5.2 adım 5+8. `join`in ölümcül OLMAYAN hatası (`SERVER_ERROR`) soketi
   * kapatmıyor — kurulumda bu bir **zombi bağlantı** üretirdi: koltuksuz,
   * `state` almamış, hub'a abone, kalıcı sessiz. `snapshot === null` olduğu
   * için gelen HER olay yutulur; istemci `ping` attığı için 4408 hiç
   * ateşlenmez ve `pong` döndüğü için istemcinin nabız kontrolü de tetiklenmez:
   * kullanıcı boş tahtayla rotasyona kadar kilitli kalırdı.
   *
   * Geçici CAS yarışının kendisini `handlers/join.ts` tek yeniden denemeyle
   * çözüyor (istemciye sahte hata göstermeden). Buradaki kontrol SONUCA
   * bakıyor: koltuk yoksa oturum kurulmamıştır.
   *
   * Ayrım YALNIZ kurulumda: `join` resync olarak geldiğinde (`doHandle` yolu)
   * bağlantının açık kalması DOĞRUDUR, bu yüzden kontrol handler'da değil
   * burada.
   */
  async function joinAndVerifySeat(): Promise<boolean> {
    await dispatchMessage(context, { type: 'join', roomCode: deps.roomCode })
    return !connection.isClosed() && connection.seat() !== null
  }

  async function doStart(): Promise<void> {
    try {
      await runStart()
    } catch (error) {
      // `doHandle` sarılıydı, `doStart` DEĞİLDİ — asimetri kasıtsızdı.
      // `join.ts`teki `Room.findOne` geçici bir Atlas hatasında fırlatıyor ve
      // istemciye ne `state`, ne `error`, ne `close` gidiyordu; `subscribed`
      // true kalıyordu. Zombi bağlantının aynısı, üstelik teşhis sinyalsiz.
      deps.logError('bağlantı kurulamadı', error)
      connection.sendError('SERVER_ERROR', 'Bağlantı kurulamadı, yeniden deneyin.')
      connection.close(WS_CLOSE_INTERNAL_ERROR, 'start-failed')
      await doEnd()
    }
  }

  async function runStart(): Promise<void> {
    rotation = scheduleRotation({
      getDeadline: deps.getDeadline,
      now: deps.now,
      setTimer: deps.setTimer,
      clearTimer: deps.clearTimer,
      close: (code, reason) => {
        connection.close(code, reason)
      },
      ...(deps.rotateMarginMs === undefined ? {} : { marginMs: deps.rotateMarginMs }),
    })
    armIdle()

    await settle()

    // Abonelik `join` yazımından ÖNCE (spec §5.2'nin 5→7 sırasından bilinçli
    // sapma): aradaki pencerede rakibin olayı kaybolur ve gönderdiğimiz tam
    // durum bayat kalırdı. Anlık görüntü kurulmadan gelen olay
    // `connection.primeState` içinde uzlaştırılıyor.
    await deps.hub.subscribe(subscriber)
    subscribed = true

    const seated = await joinAndVerifySeat()

    if (connection.isClosed()) {
      await doEnd()
      return
    }

    if (!seated) {
      // Koltuk alınamadı ve kimse kapatmadı: ZOMBİ üretme.
      connection.sendError('SERVER_ERROR', 'Odaya katılınamadı, yeniden bağlanın.')
      connection.close(WS_CLOSE_INTERNAL_ERROR, 'join-failed')
      await doEnd()
      return
    }

    const room = connection.lastRoom()
    if (room !== null) settlementTimer.schedule(room)
  }

  async function doHandle(raw: string): Promise<void> {
    if (connection.isClosed() || ended) return

    // 1) HIZ KAPISI en başta: reddedilen çerçeve ne ayrıştırma ne okuma
    //    maliyeti doğursun. Boşta kalma sayacı yalnız KABUL EDİLEN çerçevede
    //    tazelenir — yoksa bir selci 4408'i sonsuza dek erteler.
    const verdict = connection.checkRate(deps.now())
    if (verdict !== 'ok') {
      connection.sendError('RATE_LIMITED', 'Çok fazla istek gönderdiniz.')
      if (verdict === 'abusive') connection.close(WS_CLOSE.PROTOCOL_VIOLATION, 'rate-limit')
      return
    }
    armIdle()

    // Sıra spec §5.2'den: zod → settleDeadlines → handler. Şema önce
    // geliyor ki bozuk çerçeveler her seferinde bir okuma tetiklemesin.
    const message = parseClientMessage(raw)
    if (message === null) {
      connection.sendError('INVALID_MESSAGE', 'Mesaj protokole uymuyor.')
      if (connection.noteProtocolViolation()) {
        connection.close(WS_CLOSE.PROTOCOL_VIOLATION, 'protocol-violation')
      }
      return
    }
    connection.noteValidMessage()

    // KOLTUK KAPISI. Blocker düzeltmesinden sonra koltuksuz bir bağlantı
    // kurulum aşamasını geçemiyor; bu İKİNCİ savunma hattı ileriye dönük:
    // W1-02/W3-03 `resign`/`rematch`/`chat:emoji` gövdelerini yazarken
    // koltuğun varlığını VARSAYARSA (`pushEmoji(code, seat, …)` bir `Player`
    // bekliyor, `connection.seat()` `null` dönebiliyor) koltuksuz durum bir
    // yetki açığına dönüşürdü. `join` bilerek muaf: koltuk almanın tek yolu.
    if (message.type !== 'join' && connection.seat() === null) {
      connection.sendError('ROOM_FULL', 'Bu odada bir koltuğunuz yok.')
      return
    }

    await settle()

    try {
      await dispatchMessage(context, message)
    } catch (error) {
      deps.logError(`handler hatası (${message.type})`, error)
      connection.sendError('SERVER_ERROR', 'İstek işlenemedi.')
    }

    await resyncIfDeaf()
  }

  /**
   * ⚠️ **SAĞIR INSTANCE KURTARMA.** Change stream düşükken hiçbir istemci
   * uyarılmıyor ve `ping`/`pong` çalışmaya devam ettiği için sezme yolu yok:
   * oyuncular hamle yazabiliyor (`applyMove` başarılı, `version` artıyor) ama
   * YAZAN DÂHİL kimse hiçbir şey görmüyor — R1'in bedeli tam burada çıkıyor.
   * En ucuz çare: stream kapalıyken her temasta odayı taze oku ve tam durumu
   * zorla. `onForcedState` daha eski sürümü zaten yok sayıyor.
   */
  async function resyncIfDeaf(): Promise<void> {
    if (connection.isClosed() || ended) return
    if (deps.hub.stats().openStreams > 0) return
    try {
      connection.onForcedState(await deps.db.findRoom(deps.roomCode))
    } catch (error) {
      deps.logError('sağır instance resync okuması başarısız', error)
    }
  }

  async function doEnd(): Promise<void> {
    if (ended) return
    ended = true
    cancelTimers()

    if (subscribed) {
      subscribed = false
      try {
        await deps.hub.unsubscribe(subscriber)
      } catch (error) {
        deps.logError('hub aboneliği bırakılamadı', error)
      }
    }

    const seat = connection.seat()
    if (seat === null) return
    try {
      // KOŞULLU yazma: yalnız `presence[seat].connId` hâlâ bizsek
      // `disconnected` damgalanır (§5.4). Devredilmiş eski bağlantının
      // kapanışı hiçbir şey yazmaz.
      await deps.db.detachConnection(deps.roomCode, seat, deps.connId)
    } catch (error) {
      deps.logError('detachConnection başarısız', error)
    }
  }

  return {
    connection,
    start: () => enqueue(doStart),
    handleMessage: (raw: string) => enqueue(() => doHandle(raw)),
    end: () => enqueue(doEnd),
  }
}
