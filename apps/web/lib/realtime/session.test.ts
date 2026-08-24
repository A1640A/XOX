import type { RoomDoc } from '@xox/db'
import { type Cell, type ServerMessage, serverMessageSchema } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import type { RoomTransitions } from './context'
import type { RoomHub, RoomHubStats, RoomSubscriber } from './room-hub'
import { createRoomSession, type RoomSession, type RoomSessionDeps } from './session'
import type { SettlementTimer } from './timers'

const NOW = 1_700_000_000_000
const CODE = 'ABC234'
const EMPTY: Cell[] = [null, null, null, null, null, null, null, null, null]

function makeRoom(overrides: Partial<RoomDoc> = {}): RoomDoc {
  return {
    code: CODE,
    state: 'playing',
    seats: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
    presence: {
      X: { connId: 'c1', since: new Date(NOW) },
      O: { connId: 'c2', since: new Date(NOW) },
    },
    board: [...EMPTY],
    moves: [],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    lastEmoji: null,
    gameId: null,
    version: 10,
    startedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  }
}

interface Fixture {
  session: RoomSession
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
  timers: { callback: () => void; ms: number }[]
  subscribed: RoomSubscriber[]
  unsubscribed: RoomSubscriber[]
  settlementTimer: SettlementTimer & { scheduled: number; cancelled: number }
  db: RoomTransitions
  detach: ReturnType<typeof vi.fn>
  settle: ReturnType<typeof vi.fn>
  /** Kurulum adımlarının GERÇEK sırası — spec §5.2 sırası burada kilitlenir. */
  order: string[]
  runTimer(index: number): void
}

function fixture(
  dbOverrides: Partial<RoomTransitions> = {},
  extra: Partial<RoomSessionDeps> = {},
): Fixture {
  const sent: ServerMessage[] = []
  const closes: Fixture['closes'] = []
  const timers: Fixture['timers'] = []
  const subscribed: RoomSubscriber[] = []
  const unsubscribed: RoomSubscriber[] = []
  const room = makeRoom()

  const order: string[] = []
  const detach = vi.fn(() => Promise.resolve())
  const settle = vi.fn(() => Promise.resolve(null))

  const db: RoomTransitions = {
    findRoom: () => Promise.resolve(room),
    joinRoom: () => {
      order.push('join')
      return Promise.resolve({ ok: true as const, room, events: [] })
    },
    applyMove: () => Promise.resolve({ ok: true, room, events: [] }),
    resign: () => Promise.resolve({ ok: true, room, events: [] }),
    offerRematch: () => Promise.resolve({ ok: true, room, events: [] }),
    acceptRematch: () => Promise.resolve({ ok: true, room, events: [] }),
    pushEmoji: () => Promise.resolve({ ok: true, room, events: [] }),
    settleDeadlines: settle,
    detachConnection: detach,
    ...dbOverrides,
  }

  const hub: RoomHub = {
    subscribe: (subscriber) => {
      order.push('subscribe')
      subscribed.push(subscriber)
      return Promise.resolve()
    },
    unsubscribe: (subscriber) => {
      unsubscribed.push(subscriber)
      return Promise.resolve()
    },
    stats: (): RoomHubStats => ({
      watchCalls: 0,
      openStreams: 0,
      rooms: 0,
      subscribers: 0,
      reopenAttempts: 0,
      hasResumeToken: false,
    }),
  }

  const settlementTimer: Fixture['settlementTimer'] = {
    scheduled: 0,
    cancelled: 0,
    schedule() {
      settlementTimer.scheduled += 1
    },
    cancel() {
      settlementTimer.cancelled += 1
    },
    isArmed: () => false,
  }

  const session = createRoomSession({
    roomCode: CODE,
    connId: 'c1',
    identity: { userId: 'u1', name: 'Ada' },
    socket: {
      send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
      close: (code, reason) => closes.push({ code, reason: reason ?? '' }),
    },
    hub,
    db,
    now: () => NOW,
    setTimer: (callback, ms) => {
      timers.push({ callback, ms })
      return timers.length - 1
    },
    clearTimer: () => undefined,
    getDeadline: () => new Date(NOW + 800_000),
    logError: () => undefined,
    settlementTimer,
    ...extra,
  })

  return {
    session,
    sent,
    closes,
    timers,
    subscribed,
    unsubscribed,
    settlementTimer,
    db,
    detach,
    settle,
    order,
    runTimer: (index) => timers[index]?.callback(),
  }
}

describe('session · bağlantı açılışı (§5.2 adım 4-8)', () => {
  it('hub`a abone olur, join yazar ve tam durum gönderir', async () => {
    const f = fixture()
    await f.session.start()

    expect(f.subscribed).toHaveLength(1)
    expect(f.subscribed[0]?.roomCode).toBe(CODE)
    expect(f.sent.map((m) => m.type)).toStrictEqual(['state'])
  })

  it('ABONELİK join`den ÖNCE kurulur — aradaki olay kaybolmasın', async () => {
    // Spec §5.2 adımları join'i (5) abonelikten (7) önce yazıyor; bilinçli
    // sapma: joinRoom yazımı ile abonelik arasındaki pencerede rakibin olayı
    // kaybolur ve tam durum bayat kalırdı. Abonelik önce kurulur; henüz
    // anlık görüntü yokken gelen olay `primeState`te uzlaştırılır.
    const f = fixture()
    await f.session.start()
    expect(f.order).toStrictEqual(['subscribe', 'join'])
  })

  it('abonelikten önce gelen DAHA YENİ olay tam durumda kaybolmaz', async () => {
    const f = fixture({
      joinRoom: () => {
        // joinRoom sürerken rakip hamle yaptı: olay abonelikten geliyor ama
        // henüz anlık görüntü kurulmadı.
        f.subscribed[0]?.onRoomChange(makeRoom({ version: 99 }))
        return Promise.resolve({ ok: true, room: makeRoom({ version: 10 }), events: [] })
      },
    })
    await f.session.start()
    expect(f.sent[0]).toMatchObject({ type: 'state', version: 99 })
  })

  it('settleDeadlines bağlantı kurulurken çağrılır (KK-075)', async () => {
    const f = fixture()
    await f.session.start()
    expect(f.settle).toHaveBeenCalledWith(CODE, NOW)
  })

  it('settleDeadlines FIRLATSA bile bağlantı kurulur — @xox/db iskeleti hâlâ fırlatıyor', async () => {
    const f = fixture({
      settleDeadlines: () => Promise.reject(new Error('henüz uygulanmadı — W2-01 doldurur')),
    })
    await f.session.start()
    expect(f.sent.map((m) => m.type)).toStrictEqual(['state'])
    expect(f.closes).toStrictEqual([])
  })

  it('oda yoksa 4404 ile kapatır ve aboneliği geri alır', async () => {
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: false, code: 'ROOM_NOT_FOUND' }) })
    await f.session.start()
    expect(f.closes).toStrictEqual([{ code: 4404, reason: 'room-not-found' }])
    expect(f.unsubscribed).toHaveLength(1)
  })

  it('planlı rotasyon kurulur — 800 sn deadline, 10 sn pay', async () => {
    const f = fixture()
    await f.session.start()
    const rotation = f.timers.find((t) => t.ms === 790_000)
    expect(rotation).toBeDefined()
    rotation?.callback()
    expect(f.closes).toStrictEqual([{ code: 4499, reason: 'rotate' }])
  })

  it('süre aşımı zamanlayıcısı bağlantı kurulurken KURULUR (kablolama kanıtı)', async () => {
    const f = fixture()
    await f.session.start()
    expect(f.settlementTimer.scheduled).toBeGreaterThanOrEqual(1)
  })
})

describe('session · gelen mesaj', () => {
  it('settleDeadlines HER mesajdan önce çağrılır', async () => {
    const f = fixture()
    await f.session.start()
    expect(f.settle).toHaveBeenCalledTimes(1)

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.settle).toHaveBeenCalledTimes(2)

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.settle).toHaveBeenCalledTimes(3)
  })

  it('ping → pong', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0
    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.sent).toStrictEqual([{ type: 'pong' }])
  })

  it('geçersiz mesaj INVALID_MESSAGE döner ve bağlantıyı KAPATMAZ', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0

    await f.session.handleMessage('{bozuk json')
    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
    expect(f.closes).toStrictEqual([])
  })

  it('şema dışı ama geçerli JSON da INVALID_MESSAGE`dır', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0

    await f.session.handleMessage(JSON.stringify({ type: 'move', index: 99 }))
    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
  })

  it('ÜÇÜNCÜ ardışık ihlalde 4400 ile kapatır', async () => {
    const f = fixture()
    await f.session.start()

    await f.session.handleMessage('bozuk')
    await f.session.handleMessage('bozuk')
    expect(f.closes).toStrictEqual([])
    await f.session.handleMessage('bozuk')
    expect(f.closes).toStrictEqual([{ code: 4400, reason: 'protocol-violation' }])
  })

  it('araya geçerli bir mesaj girerse ihlal sayacı sıfırlanır', async () => {
    const f = fixture()
    await f.session.start()

    await f.session.handleMessage('bozuk')
    await f.session.handleMessage('bozuk')
    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    await f.session.handleMessage('bozuk')
    await f.session.handleMessage('bozuk')
    expect(f.closes).toStrictEqual([])
  })

  it('geçersiz mesaj için settleDeadlines ÇAĞRILMAZ — zod önce (§5.2)', async () => {
    const f = fixture()
    await f.session.start()
    f.settle.mockClear()

    await f.session.handleMessage('bozuk')
    expect(f.settle).not.toHaveBeenCalled()
  })

  it('handler fırlatırsa bağlantı ayakta kalır ve SERVER_ERROR gider', async () => {
    const f = fixture({ applyMove: () => Promise.reject(new Error('atlas düştü')) })
    await f.session.start()
    f.sent.length = 0

    await f.session.handleMessage(JSON.stringify({ type: 'move', index: 4 }))
    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'SERVER_ERROR' })
    expect(f.closes).toStrictEqual([])
  })

  it('kapanmış bağlantıya gelen mesaj işlenmez', async () => {
    const f = fixture()
    await f.session.start()
    await f.session.end()
    f.settle.mockClear()

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.settle).not.toHaveBeenCalled()
  })
})

describe('session · boşta kalma (4408)', () => {
  it('WS_IDLE_TIMEOUT_MS sessizlikten sonra 4408 ile kapanır', async () => {
    const f = fixture()
    await f.session.start()

    const idle = f.timers.find((t) => t.ms === 75_000)
    expect(idle).toBeDefined()
    idle?.callback()
    expect(f.closes).toStrictEqual([{ code: 4408, reason: 'idle' }])
  })

  it('her mesaj boşta kalma sayacını yeniden kurar', async () => {
    const f = fixture()
    await f.session.start()
    const before = f.timers.filter((t) => t.ms === 75_000).length

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.timers.filter((t) => t.ms === 75_000).length).toBe(before + 1)
  })
})

describe('session · kapanış (§5.2 adım 10)', () => {
  it('abonelikten düşer ve koltuğu koşullu olarak bırakır', async () => {
    const f = fixture()
    await f.session.start()
    await f.session.end()

    expect(f.unsubscribed).toHaveLength(1)
    expect(f.detach).toHaveBeenCalledWith(CODE, 'X', 'c1')
    expect(f.settlementTimer.cancelled).toBeGreaterThanOrEqual(1)
  })

  it('koltuk hiç alınmadıysa detachConnection ÇAĞRILMAZ', async () => {
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: false, code: 'ROOM_FULL' }) })
    await f.session.start()
    await f.session.end()
    expect(f.detach).not.toHaveBeenCalled()
  })

  it('iki kez end çağrılırsa ikinci kez hiçbir şey yapmaz', async () => {
    const f = fixture()
    await f.session.start()
    await f.session.end()
    await f.session.end()
    expect(f.unsubscribed).toHaveLength(1)
    expect(f.detach).toHaveBeenCalledTimes(1)
  })

  it('detachConnection fırlatırsa kapanış yine tamamlanır', async () => {
    const f = fixture({ detachConnection: () => Promise.reject(new Error('atlas düştü')) })
    await f.session.start()
    await expect(f.session.end()).resolves.toBeUndefined()
    expect(f.unsubscribed).toHaveLength(1)
  })
})

describe('session · change stream olayları', () => {
  it('abone, olayı bağlantıya taşır ve süre zamanlayıcısını tazeler', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0
    const before = f.settlementTimer.scheduled

    f.subscribed[0]?.onRoomChange(
      makeRoom({
        version: 11,
        board: ['X', null, null, null, null, null, null, null, null],
        moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
      }),
    )

    expect(f.sent).toStrictEqual([{ type: 'move:applied', index: 0, by: 'X', version: 11 }])
    expect(f.settlementTimer.scheduled).toBe(before + 1)
  })

  it('zorunlu resync tam durum gönderir', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0

    f.subscribed[0]?.onForcedState(makeRoom({ version: 40 }))
    expect(f.sent[0]).toMatchObject({ type: 'state', version: 40 })
  })

  it('oda silinirse 4404 ile kapanır', async () => {
    const f = fixture()
    await f.session.start()
    f.subscribed[0]?.onRoomDeleted()
    expect(f.closes).toStrictEqual([{ code: 4404, reason: 'room-deleted' }])
  })
})
