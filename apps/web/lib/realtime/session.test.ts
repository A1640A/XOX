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
    result: null,
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
  hubState: { openStreams: number }
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
  /** `true` ise sahte zamanlayıcı ENJEKTE EDİLMEZ — gerçek kablolama koşar. */
  useRealTimer = false,
): Fixture {
  const sent: ServerMessage[] = []
  const closes: Fixture['closes'] = []
  const timers: Fixture['timers'] = []
  const subscribed: RoomSubscriber[] = []
  const unsubscribed: RoomSubscriber[] = []
  const room = makeRoom()

  const order: string[] = []
  const hubState = { openStreams: 1 }
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
    // Sağlıklı varsayılan: hub'ın açık bir stream'i var. `openStreams: 0`
    // "instance SAĞIR" demektir ve ayrı bir testin konusu.
    stats: (): RoomHubStats => ({
      watchCalls: 1,
      openStreams: hubState.openStreams,
      rooms: 1,
      subscribers: subscribed.length - unsubscribed.length,
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
    ...(useRealTimer ? {} : { settlementTimer }),
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
    hubState,
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

    // DB-BOARD-001/CTR-BOARD-001: `cellIndexSchema` 11×11'i desteklemek için
    // 0..120'ye genişledi (SB-04) — 99 artık PROTOKOL seviyesinde geçerlidir
    // (oda başına gerçek sınır `move:rejected{reason:'out-of-range'}` ile
    // kural motorundan gelir, şemadan değil). Şema dışılığı sınamak için
    // aralığın GENİŞLEMİŞ üst sınırının da DIŞINA (121) çıkan bir değer gerekir.
    await f.session.handleMessage(JSON.stringify({ type: 'move', index: 121 }))
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

describe('session · ZOMBİ BAĞLANTI regresyonu (BLOCKER 1)', () => {
  it('join SERVER_ERROR dönerse TEK yeniden deneme yapılır ve başarılıysa oturum kurulur', async () => {
    let call = 0
    const f = fixture({
      joinRoom: () => {
        call += 1
        // İki sekme yarışı: ilk CAS kaybedildi, ikinci okuma yeni version'ı görür.
        if (call === 1) return Promise.resolve({ ok: false as const, code: 'SERVER_ERROR' })
        return Promise.resolve({ ok: true as const, room: makeRoom(), events: [] })
      },
    })
    await f.session.start()

    expect(call).toBe(2)
    expect(f.session.connection.seat()).toBe('X')
    // İstemciye SAHTE bir hata gösterilmez: yalnız tam durum gider.
    expect(f.sent.map((m) => m.type)).toStrictEqual(['state'])
    expect(f.closes).toStrictEqual([])
  })

  it('yeniden deneme de başarısızsa bağlantı KAPANIR — sessiz zombi bırakılmaz', async () => {
    const f = fixture({
      joinRoom: () => Promise.resolve({ ok: false, code: 'SERVER_ERROR' }),
    })
    await f.session.start()

    expect(f.session.connection.seat()).toBeNull()
    expect(f.sent.filter((m) => m.type === 'error')).toHaveLength(2)
    // 1011: sınıflandırılmamış → istemci üstel geri çekilmeyle YENİDEN BAĞLANIR.
    // 4403/4404 olsaydı kalıcı sayılır ve geçici bir CAS yarışı kilide dönerdi.
    expect(f.closes).toStrictEqual([{ code: 1011, reason: 'join-failed' }])
    expect(f.unsubscribed).toHaveLength(1)
  })

  it('koltuksuz kalan bağlantı gelen olayları SESSİZCE YUTMAZ (kapanmış olur)', async () => {
    const f = fixture({
      joinRoom: () => Promise.resolve({ ok: false, code: 'SERVER_ERROR' }),
    })
    await f.session.start()
    f.sent.length = 0

    f.subscribed[0]?.onRoomChange(makeRoom({ version: 11 }))
    // Kapalı bağlantı: ne mesaj gider ne de olay yutulup birikir.
    expect(f.sent).toStrictEqual([])
    expect(f.session.connection.isClosed()).toBe(true)
  })
})

describe('session · doStart FIRLATIRSA (BLOCKER 2)', () => {
  it('geçici Atlas hatası sessizce yutulmaz: error + close + unsubscribe', async () => {
    const logs: string[] = []
    const f = fixture(
      { joinRoom: () => Promise.reject(new Error('Atlas erişilemedi')) },
      { logError: (message) => logs.push(message) },
    )

    await expect(f.session.start()).resolves.toBeUndefined()

    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'SERVER_ERROR' })
    expect(f.closes).toStrictEqual([{ code: 1011, reason: 'start-failed' }])
    expect(f.unsubscribed).toHaveLength(1)
    expect(logs).toContain('bağlantı kurulamadı')
  })

  it('hub.subscribe fırlatsa bile bağlantı kapatılır (abonelik hiç kurulmadı)', async () => {
    const failingHub: RoomHub = {
      subscribe: () => Promise.reject(new Error('havuz tükendi')),
      unsubscribe: () => Promise.resolve(),
      stats: (): RoomHubStats => ({
        watchCalls: 0,
        openStreams: 0,
        rooms: 0,
        subscribers: 0,
        reopenAttempts: 0,
        hasResumeToken: false,
      }),
    }
    const f = fixture({}, { hub: failingHub })

    await expect(f.session.start()).resolves.toBeUndefined()
    expect(f.closes).toStrictEqual([{ code: 1011, reason: 'start-failed' }])
  })

  it('enqueue reddi SESSİZCE yutulmaz — logError çağrılır', async () => {
    // `doHandle`ın hiçbir try/catch'inin sarmadığı bir yol gerekiyor: soketin
    // KENDİSİ patlarsa (kapanmış bir yazma ucu) rejection kuyruğa düşer.
    // Eski `queue = next.catch(() => undefined)` bunu tamamen yutuyordu;
    // `unhandledRejection` bile oluşmuyordu, yani hiçbir teşhis sinyali yoktu.
    const logs: string[] = []
    const f = fixture(
      {},
      {
        logError: (message) => logs.push(message),
        socket: {
          send: () => {
            throw new Error('soket koptu')
          },
          close: () => undefined,
        },
      },
    )

    await expect(f.session.handleMessage('{bozuk')).rejects.toThrow('soket koptu')
    await vi.waitFor(() => {
      expect(logs).toContain('kuyruk görevi reddedildi')
    })
  })
})

describe('session · hız sınırı (güvenlik denetimi HIGH)', () => {
  it('pencere içinde 20 çerçeve geçer, 21. RATE_LIMITED alır ama bağlantı AÇIK kalır', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0

    for (let i = 0; i < 20; i += 1) {
      await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    }
    expect(f.sent.filter((m) => m.type === 'pong')).toHaveLength(20)
    expect(f.sent.filter((m) => m.type === 'error')).toHaveLength(0)

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.sent.at(-1)).toMatchObject({ type: 'error', code: 'RATE_LIMITED' })
    expect(f.closes).toStrictEqual([])
  })

  it('ısrar eden istemci 4400 ile kapatılır (MAX_CONSECUTIVE_VIOLATIONS bunu kapatmıyordu)', async () => {
    const f = fixture()
    await f.session.start()

    for (let i = 0; i < 41; i += 1) {
      await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    }
    expect(f.closes).toStrictEqual([{ code: 4400, reason: 'rate-limit' }])
  })

  it('sel, join yazmasını da durdurur — change stream tek olduğu için asıl kazanç bu', async () => {
    const joinRoom = vi.fn(() =>
      Promise.resolve({ ok: true as const, room: makeRoom(), events: [] }),
    )
    const f = fixture({ joinRoom })
    await f.session.start()
    const afterStart = joinRoom.mock.calls.length

    for (let i = 0; i < 60; i += 1) {
      await f.session.handleMessage(JSON.stringify({ type: 'join', roomCode: CODE }))
    }
    // 20'lik bütçe dolunca yazma yolu tamamen kapanıyor.
    expect(joinRoom.mock.calls.length - afterStart).toBeLessThanOrEqual(20)
  })

  it('pencere kayınca bütçe tazelenir', async () => {
    let clock = NOW
    const f = fixture({}, { now: () => clock })
    await f.session.start()
    for (let i = 0; i < 21; i += 1) {
      await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    }
    f.sent.length = 0

    clock += 10_001
    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(f.sent).toStrictEqual([{ type: 'pong' }])
  })
})

describe('session · koltuk kapısı', () => {
  it('koltuksuz bir bağlantıda join DIŞINDAKİ mesajlar reddedilir', async () => {
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: false, code: 'ROOM_FULL' }) })
    await f.session.start()
    // 4403 ile kapandı; kapalı bağlantıda kapı zaten devrede. Kapıyı yalıtmak
    // için doğrudan koltuksuz ama AÇIK bir oturum kurulur:
    const g = fixture()
    g.settle.mockClear()
    await g.session.handleMessage(JSON.stringify({ type: 'move', index: 0 }))

    expect(g.sent).toHaveLength(1)
    expect(g.sent[0]).toMatchObject({ type: 'error', code: 'ROOM_FULL' })
    // Koltuk yoksa `settleDeadlines` de çağrılmaz — okuma harcanmaz.
    expect(g.settle).not.toHaveBeenCalled()
    expect(f.closes).toStrictEqual([{ code: 4403, reason: 'room-full' }])
  })

  it('join koltuk kapısından MUAF — koltuk almanın tek yolu odur', async () => {
    const f = fixture()
    await f.session.handleMessage(JSON.stringify({ type: 'join', roomCode: CODE }))
    expect(f.sent.map((m) => m.type)).toStrictEqual(['state'])
  })
})

describe('session · SAĞIR instance kurtarma', () => {
  it('stream kapalıyken her temasta taze durum zorlanır', async () => {
    const f = fixture()
    await f.session.start()
    f.sent.length = 0

    f.hubState.openStreams = 0
    const findRoom = vi.spyOn(f.db, 'findRoom')
    findRoom.mockResolvedValue(makeRoom({ version: 30 }))

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))

    expect(f.sent.map((m) => m.type)).toStrictEqual(['pong', 'state'])
    expect(f.sent.at(-1)).toMatchObject({ type: 'state', version: 30 })
  })

  it('stream AÇIKKEN fazladan okuma YAPILMAZ', async () => {
    const f = fixture()
    await f.session.start()
    const findRoom = vi.spyOn(f.db, 'findRoom')

    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    expect(findRoom).not.toHaveBeenCalled()
  })

  it('sağır kurtarma okuması patlarsa bağlantı düşmez', async () => {
    const f = fixture()
    await f.session.start()
    f.hubState.openStreams = 0
    vi.spyOn(f.db, 'findRoom').mockRejectedValue(new Error('atlas yok'))

    await expect(f.session.handleMessage(JSON.stringify({ type: 'ping' }))).resolves.toBeUndefined()
    expect(f.closes).toStrictEqual([])
  })
})

describe('session · çerçeve sıralaması', () => {
  it('art arda gelen iki hamle ÜST ÜSTE BİNMEDEN sırayla işlenir', async () => {
    const olay: string[] = []
    /** Yalnız BİRİNCİ hamle elde tutulur; ikincisi hemen çözülür. */
    const bekleyen: (() => void)[] = []
    let cagri = 0
    const applyMove = vi.fn((_code: string, _userId: string, index: number) => {
      olay.push(`giris-${String(index)}`)
      cagri += 1
      const tut = cagri === 1
      return new Promise<{ ok: true; room: RoomDoc; events: [] }>((resolve) => {
        const bitir = (): void => {
          olay.push(`cikis-${String(index)}`)
          resolve({ ok: true, room: makeRoom(), events: [] })
        }
        if (tut) bekleyen.push(bitir)
        else bitir()
      })
    })
    const f = fixture({ applyMove })
    await f.session.start()

    const ilk = f.session.handleMessage(JSON.stringify({ type: 'move', index: 0 }))
    const ikinci = f.session.handleMessage(JSON.stringify({ type: 'move', index: 4 }))

    // İlk hamle henüz bitmedi: ikincisi HİÇ başlamamış olmalı.
    await vi.waitFor(() => {
      expect(olay).toStrictEqual(['giris-0'])
    })
    bekleyen[0]?.()
    await Promise.all([ilk, ikinci])

    expect(olay).toStrictEqual(['giris-0', 'cikis-0', 'giris-4', 'cikis-4'])
  })

  it('start bitmeden gelen mesaj, join tamamlandıktan SONRA işlenir', async () => {
    const olay: string[] = []
    const f = fixture({
      joinRoom: () => {
        olay.push('join')
        return Promise.resolve({ ok: true, room: makeRoom(), events: [] })
      },
      applyMove: () => {
        olay.push('move')
        return Promise.resolve({ ok: true, room: makeRoom(), events: [] })
      },
    })

    const started = f.session.start()
    const moved = f.session.handleMessage(JSON.stringify({ type: 'move', index: 0 }))
    await Promise.all([started, moved])

    expect(olay).toStrictEqual(['join', 'move'])
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

describe('session · GERÇEK süre zamanlayıcısı kablolaması (ADR-0004)', () => {
  it('sahte değil GERÇEK createSettlementTimer ile: zamanlayıcı dolunca settleDeadlines koşar', async () => {
    // Diğer testler `settlementTimer`ı enjekte ediyor, yani "kablolama
    // kilitlendi" iddiası yalnız ÇAĞRI SAYISI için geçerliydi; `onDue`
    // kablosu %0 kapsamdaydı. W2-01 kabloyu yanlış bağlarsa ADR-0004'ün çift
    // yürütmesi sessizce TEK yürütmeye düşerdi.
    const disconnected = {
      seat: 'O' as const,
      at: new Date(NOW),
      graceEndsAt: new Date(NOW + 30_000),
    }
    const room = makeRoom({ disconnected })
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: true, room, events: [] }) }, {}, true)

    await f.session.start()
    f.settle.mockClear()

    const graceTimer = f.timers.find((t) => t.ms === 30_000)
    expect(graceTimer, 'grace için gerçek bir zamanlayıcı kurulmalı').toBeDefined()

    graceTimer?.callback()
    await vi.waitFor(() => {
      expect(f.settle).toHaveBeenCalledWith(CODE, NOW)
    })
  })

  it('deadline yoksa gerçek zamanlayıcı da kurulmaz (P0 · AS-08)', async () => {
    const f = fixture({}, {}, true)
    await f.session.start()
    // Yalnız rotasyon (790_000) ve boşta kalma (75_000) zamanlayıcıları var.
    expect(f.timers.map((t) => t.ms).toSorted()).toStrictEqual([75_000, 790_000])
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

    // `turnDeadline` CTR-004 ile ince yola eklendi; bu fixture'ın odasında
    // hedef yok, dolayısıyla `null` gider ("hedef yok", "bilgi yok" DEĞİL).
    expect(f.sent).toStrictEqual([
      { type: 'move:applied', index: 0, by: 'X', version: 11, turnDeadline: null },
    ])
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
