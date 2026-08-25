// @vitest-environment node
import {
  Room,
  acceptRematch,
  applyMove,
  connectDb,
  detachConnection,
  disconnectDb,
  generateRoomCode,
  joinRoom,
  loadEnvLocal,
  offerRematch,
  pushEmoji,
  resign,
  settleDeadlines,
  type RoomDoc,
} from '@xox/db'
import { serverMessageSchema, type ServerMessage } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { RoomTransitions } from './context'
import type { RoomHub, RoomHubStats, RoomSubscriber } from './room-hub'
import { createRoomSession, type RoomSession } from './session'

// `packages/db`'nin kendi `vitest.setup.ts`'i bu paketten koşmuyor; ortam
// yüklemesi ve `xox_test` zorlaması burada AÇIKÇA yapılır. `xox_prod`/`xox_dev`
// bu dosyadan ASLA açılmaz — zorlama koşulsuz.
loadEnvLocal()
process.env['MONGODB_DB'] = 'xox_test'

/**
 * Presence / takeover / grace uçtan uca — **GERÇEK** otoriteye karşı.
 *
 * Burada `packages/db`'nin geçişleri MOCK'LANMAZ: `joinRoom`,
 * `detachConnection`, `applyMove` gerçek Atlas'a (`xox_test`) yazar. Sebep
 * `gotchas.md`'nin 2. örüntüsü: bağımlılığını tamamen mock'larsan testin kendi
 * mock'unu doğrular — ve bu kartın kalbi olan "takeover sırasında rakip
 * `opponent:left` GÖRMEZ" iddiası tam olarak koşullu yazma ile change stream
 * yayınının BİRLEŞİMİNDEN doğar; iki taraftan biri sahte olursa iddia
 * boşalır.
 *
 * Sahte olan tek şey **taşıma**: change stream yerine `deliver()` odayı
 * yeniden okuyup her aboneye dağıtır. Bu, ADR-0002'nin "olay HER instance'a
 * gider" davranışının deterministik ikizidir; testin gözlediği tüm kararlar
 * (kim `4409` yer, kime `opponent:left` gider) gerçek koddan çıkar.
 */
const transitions: RoomTransitions = {
  findRoom: (code) => Room.findOne({ code }).lean(),
  joinRoom,
  applyMove,
  resign,
  offerRematch,
  acceptRematch,
  pushEmoji,
  settleDeadlines,
  detachConnection,
}

interface FanoutHub {
  hub: RoomHub
  /** Change stream olayının ikizi: odayı oku, HER aboneye ver. */
  deliver(code: string): Promise<void>
  /** Stream yeniden açıldı: zorunlu tam durum (§3.10). */
  force(code: string): Promise<void>
  subscriberCount(): number
}

function createFanoutHub(): FanoutHub {
  const subscribers: RoomSubscriber[] = []

  const hub: RoomHub = {
    subscribe: (subscriber) => {
      subscribers.push(subscriber)
      return Promise.resolve()
    },
    unsubscribe: (subscriber) => {
      const at = subscribers.indexOf(subscriber)
      if (at >= 0) subscribers.splice(at, 1)
      return Promise.resolve()
    },
    stats: (): RoomHubStats => ({
      watchCalls: 1,
      openStreams: 1,
      rooms: 1,
      subscribers: subscribers.length,
      reopenAttempts: 0,
      hasResumeToken: false,
    }),
  }

  async function read(code: string): Promise<RoomDoc | null> {
    return await Room.findOne({ code }).lean()
  }

  return {
    hub,
    async deliver(code: string): Promise<void> {
      const room = await read(code)
      // Kopya üzerinde dönülür: bir abone kapanıp `unsubscribe` çağırırsa
      // (takeover!) dizi dağıtım sırasında kısalır ve bir abone atlanırdı.
      for (const subscriber of [...subscribers]) {
        if (room === null) subscriber.onRoomDeleted()
        else subscriber.onRoomChange(room)
      }
    },
    async force(code: string): Promise<void> {
      const room = await read(code)
      for (const subscriber of [...subscribers]) subscriber.onForcedState(room)
    },
    subscriberCount: () => subscribers.length,
  }
}

interface Seat {
  session: RoomSession
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
  types(): string[]
}

function openSeat(hub: RoomHub, code: string, userId: string, name: string, connId: string): Seat {
  const sent: ServerMessage[] = []
  const closes: Seat['closes'] = []
  const session = createRoomSession({
    roomCode: code,
    connId,
    identity: { userId, name },
    socket: {
      // Giden her mesaj protokole uymak ZORUNDA — sözleşme dışı bir mesaj
      // istemcide sessizce düşerdi.
      send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
      close: (closeCode, reason) => closes.push({ code: closeCode, reason: reason ?? '' }),
    },
    hub,
    db: transitions,
    now: () => Date.now(),
    setTimer: () => 0,
    clearTimer: () => undefined,
    getDeadline: () => undefined,
    logError: () => undefined,
  })
  return { session, sent, closes, types: () => sent.map((message) => message.type) }
}

const ADA = { userId: 'u-ada', name: 'Ada' }
const KAAN = { userId: 'u-kaan', name: 'Kaan' }
const ZEYNEP = { userId: 'u-zeynep', name: 'Zeynep' }

describe('presence · takeover · yeniden bağlanma (gerçek @xox/db)', () => {
  const createdCodes: string[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      await Room.deleteMany({ code: { $in: createdCodes } })
      createdCodes.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  async function playingRoom(): Promise<string> {
    const code = generateRoomCode()
    createdCodes.push(code)
    await Room.create({
      code,
      state: 'playing',
      seats: { X: ADA, O: KAAN },
      presence: { X: null, O: null },
      startedAt: new Date(),
      version: 1,
    })
    return code
  }

  async function roomOf(code: string): Promise<RoomDoc> {
    const room = await Room.findOne({ code }).lean()
    if (room === null) throw new Error('oda kayboldu')
    return room
  }

  it(
    'AC2+AC3 — takeover: eski bağlantı 4409 alır, RAKİBİN mesajlarında ' +
      'opponent:left OLUŞMAZ, disconnected damgalanmaz',
    async () => {
      const code = await playingRoom()
      const hub = createFanoutHub()

      const ada = openSeat(hub.hub, code, ADA.userId, ADA.name, 'conn-ada')
      const kaanEski = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-ESKI')
      await ada.session.start()
      await kaanEski.session.start()
      await hub.deliver(code)
      ada.sent.length = 0
      kaanEski.sent.length = 0

      // Aynı userId ikinci kez bağlanıyor (ikinci sekme).
      const kaanYeni = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-YENI')
      await kaanYeni.session.start()
      await hub.deliver(code)

      // 1) Eski bağlantı kendi connId'sinin gittiğini CHANGE STREAM'den öğrendi.
      expect(kaanEski.sent).toContainEqual({
        type: 'error',
        code: 'SESSION_TAKEOVER',
        message: expect.any(String) as string,
      })
      expect(kaanEski.closes).toStrictEqual([{ code: 4409, reason: 'takeover' }])

      // 2) ⚠️ KARTIN KALBİ — rakipte o olayın YOKLUĞU iddia ediliyor.
      expect(ada.types()).not.toContain('opponent:left')
      expect(ada.closes).toStrictEqual([])

      // 3) Yeni bağlantı tam durum aldı, oyun kesintisiz.
      expect(kaanYeni.types()).toStrictEqual(['state'])
      expect(kaanYeni.closes).toStrictEqual([])

      // 4) Otorite tarafında grace HİÇ başlamadı.
      const room = await roomOf(code)
      expect(room.disconnected).toBeNull()
      expect(room.presence.O).toMatchObject({ connId: 'conn-kaan-YENI' })
    },
  )

  it(
    'İKİ YÖNLÜ — devredilmiş eski bağlantının KAPANIŞI hiçbir şey yazmaz ve ' +
      'rakipte hâlâ opponent:left OLUŞMAZ; ama GERÇEK kopuş onu ÜRETİR',
    async () => {
      const code = await playingRoom()
      const hub = createFanoutHub()

      const ada = openSeat(hub.hub, code, ADA.userId, ADA.name, 'conn-ada')
      const kaanEski = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-ESKI')
      await ada.session.start()
      await kaanEski.session.start()
      const kaanYeni = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-YENI')
      await kaanYeni.session.start()
      await hub.deliver(code)
      ada.sent.length = 0

      // ── YÖN 1: devredilmiş bağlantı kapanıyor ────────────────────────────
      const beforeStale = await roomOf(code)
      await kaanEski.session.end()
      const afterStale = await roomOf(code)

      expect(afterStale.version).toBe(beforeStale.version)
      expect(afterStale.presence.O).toMatchObject({ connId: 'conn-kaan-YENI' })
      expect(afterStale.disconnected).toBeNull()

      await hub.deliver(code)
      expect(ada.types()).not.toContain('opponent:left')

      // ── YÖN 2: AKTİF bağlantı kapanıyor — bu GERÇEK bir kopuş ────────────
      await kaanYeni.session.end()
      const afterReal = await roomOf(code)

      expect(afterReal.version).toBe(beforeStale.version + 1)
      expect(afterReal.presence.O).toBeNull()
      expect(afterReal.disconnected).toMatchObject({ seat: 'O' })

      await hub.deliver(code)
      expect(ada.types()).toContain('opponent:left')
    },
  )

  it('KK-064 — oda DOLUYKEN yeniden bağlanan aynı userId tam state alır, ROOM_FULL DÖNMEZ', async () => {
    const code = await playingRoom()
    const hub = createFanoutHub()

    const ada = openSeat(hub.hub, code, ADA.userId, ADA.name, 'conn-ada')
    const kaan = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-1')
    await ada.session.start()
    await kaan.session.start()
    await kaan.session.end()
    await hub.deliver(code)
    ada.sent.length = 0

    // İki koltuk da SAHİPLİ (oda dolu) ve grace işliyor.
    const disconnected = await roomOf(code)
    expect(disconnected.seats.X).not.toBeNull()
    expect(disconnected.seats.O).not.toBeNull()
    expect(disconnected.disconnected).toMatchObject({ seat: 'O' })

    const kaanDonus = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-2')
    await kaanDonus.session.start()
    await hub.deliver(code)

    expect(kaanDonus.closes).toStrictEqual([])
    expect(kaanDonus.types()).toStrictEqual(['state'])
    const state = kaanDonus.sent[0]
    expect(state?.type === 'state' ? state.you : null).toBe('O')

    // Grace temizlendi ve rakip DÖNÜŞÜ gördü.
    const returned = await roomOf(code)
    expect(returned.disconnected).toBeNull()
    expect(returned.presence.O).toMatchObject({ connId: 'conn-kaan-2' })
    expect(ada.types()).toContain('opponent:returned')
  })

  it('KARŞIT KANIT — ÜÇÜNCÜ bir userId aynı dolu odada 4403 ROOM_FULL alır (test boş değil)', async () => {
    const code = await playingRoom()
    const hub = createFanoutHub()

    const ada = openSeat(hub.hub, code, ADA.userId, ADA.name, 'conn-ada')
    await ada.session.start()

    const yabanci = openSeat(hub.hub, code, ZEYNEP.userId, ZEYNEP.name, 'conn-zeynep')
    await yabanci.session.start()

    expect(yabanci.closes).toStrictEqual([{ code: 4403, reason: 'room-full' }])
    expect(yabanci.types()).not.toContain('state')
  })

  it(
    'AC7 — kopukken rakip hamle yaptı: dönen istemci TEK tam state alır, ' +
      'kaçırılan move:applied TEKRAR OYNATILMAZ',
    async () => {
      const code = await playingRoom()
      const hub = createFanoutHub()

      const ada = openSeat(hub.hub, code, ADA.userId, ADA.name, 'conn-ada')
      const kaan = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-1')
      await ada.session.start()
      await kaan.session.start()

      const beforeGap = await roomOf(code)
      await kaan.session.end()
      await ada.session.handleMessage(JSON.stringify({ type: 'move', index: 4 }))
      await hub.deliver(code)

      const kaanDonus = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-2')
      await kaanDonus.session.start()

      // Kopukken en az iki yazma kaçırıldı (detach + hamle) — yani bu gerçek
      // bir SÜRÜM BOŞLUĞU, tek olaylık bir gecikme değil.
      const state = kaanDonus.sent[0]
      expect(kaanDonus.types()).toStrictEqual(['state'])
      expect(state?.type === 'state' ? state.version : -1).toBeGreaterThan(beforeGap.version + 1)
      expect(state?.type === 'state' ? state.board : null).toStrictEqual([
        null,
        null,
        null,
        null,
        'X',
        null,
        null,
        null,
        null,
      ])
      // Diff/merge yok, yeniden oynatma yok.
      expect(kaanDonus.types()).not.toContain('move:applied')
    },
  )

  it('koltuk BAŞKA bir userId`ye geçerse bağlantı 4403 seat-lost ile kapanır (change stream yolu)', async () => {
    const code = await playingRoom()
    const hub = createFanoutHub()

    const kaan = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan')
    await kaan.session.start()
    kaan.sent.length = 0

    // Rövanş DIŞI bir yeniden yapılandırma: koltuk el değiştirdi.
    await Room.collection.updateOne({ code }, { $inc: { version: 1 }, $set: { 'seats.O': ZEYNEP } })
    await hub.deliver(code)

    expect(kaan.closes).toStrictEqual([{ code: 4403, reason: 'seat-lost' }])
    expect(kaan.sent).toStrictEqual([])
  })

  it('ZORUNLU resync yolu da koltuk kaybını ve takeover`ı yakalar (stream yeniden açıldı)', async () => {
    const code = await playingRoom()
    const hub = createFanoutHub()

    const kaanEski = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-ESKI')
    await kaanEski.session.start()
    kaanEski.sent.length = 0

    // Takeover oldu ama change stream olayı DÜŞTÜ; stream yeniden açılınca
    // zorunlu tam durum geliyor — devralma orada da yakalanmalı.
    const kaanYeni = openSeat(hub.hub, code, KAAN.userId, KAAN.name, 'conn-kaan-YENI')
    await kaanYeni.session.start()
    kaanYeni.sent.length = 0
    await hub.force(code)

    expect(kaanEski.closes).toStrictEqual([{ code: 4409, reason: 'takeover' }])
    expect(kaanYeni.closes).toStrictEqual([])
  })

  it('kapanan oturum hub aboneliğini bırakır — yetim abone kalmaz', async () => {
    const code = await playingRoom()
    const hub = createFanoutHub()

    const ada = openSeat(hub.hub, code, ADA.userId, ADA.name, 'conn-ada')
    await ada.session.start()
    expect(hub.subscriberCount()).toBe(1)

    await ada.session.end()
    expect(hub.subscriberCount()).toBe(0)
  })
})
