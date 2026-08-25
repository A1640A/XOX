import type { RoomDoc } from '@xox/db'
import {
  WS_CLOSE,
  WS_RECONNECT_BASE_MS,
  createRoomWsClient,
  type Cell,
  type RoomWsClient,
  type SocketLike,
} from '@xox/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomTransitions } from './context'
import type { RoomHub, RoomHubStats } from './room-hub'
import { scheduleRotation, type RotationDeps } from './rotate'
import { createRoomSession } from './session'

const NOW = 1_700_000_000_000

interface Spy {
  timers: { callback: () => void; ms: number }[]
  cleared: unknown[]
  closes: { code: number; reason: string }[]
  deps: RotationDeps
}

function spy(overrides: Partial<RotationDeps> = {}): Spy {
  const timers: Spy['timers'] = []
  const cleared: unknown[] = []
  const closes: Spy['closes'] = []
  return {
    timers,
    cleared,
    closes,
    deps: {
      getDeadline: () => new Date(NOW + 800_000),
      now: () => NOW,
      setTimer: (callback, ms) => {
        timers.push({ callback, ms })
        return timers.length - 1
      },
      clearTimer: (handle) => cleared.push(handle),
      close: (code, reason) => closes.push({ code, reason }),
      ...overrides,
    },
  }
}

describe('scheduleRotation (ADR-0007)', () => {
  it('deadline yoksa zamanlayıcı KURULMAZ (yerel geliştirme)', () => {
    const s = spy({ getDeadline: () => undefined })
    const rotation = scheduleRotation(s.deps)
    expect(s.timers).toHaveLength(0)
    expect(rotation.inMs()).toBeNull()
  })

  it('deadline`dan 10 saniye önceye kurulur — Pro planında 800 sn → 790_000 ms', () => {
    const s = spy()
    expect(scheduleRotation(s.deps).inMs()).toBe(790_000)
    expect(s.timers[0]?.ms).toBe(790_000)
  })

  it('Hobby planı (300 sn) için aynı kod 290_000 ms verir — süre KODA GÖMÜLÜ DEĞİL', () => {
    const s = spy({ getDeadline: () => new Date(NOW + 300_000) })
    expect(scheduleRotation(s.deps).inMs()).toBe(290_000)
  })

  it('deadline paydan yakınsa gecikme 0 olur, negatife düşmez', () => {
    const s = spy({ getDeadline: () => new Date(NOW + 3_000) })
    expect(scheduleRotation(s.deps).inMs()).toBe(0)
  })

  it('deadline geçmişte kalsa bile gecikme 0 olur', () => {
    const s = spy({ getDeadline: () => new Date(NOW - 60_000) })
    expect(scheduleRotation(s.deps).inMs()).toBe(0)
  })

  it('süre dolunca 4499 ile kapatır', () => {
    const s = spy()
    scheduleRotation(s.deps)
    s.timers[0]?.callback()
    expect(s.closes).toStrictEqual([{ code: 4499, reason: 'rotate' }])
  })

  it('marginMs ezilebilir — 5 saniyede rotasyon (ADR-0007 ölçüm notu)', () => {
    const s = spy({ getDeadline: () => new Date(NOW + 6_000), marginMs: 1_000 })
    expect(scheduleRotation(s.deps).inMs()).toBe(5_000)
  })

  it('cancel zamanlayıcıyı temizler ve ikinci kez temizlemez', () => {
    const s = spy()
    const rotation = scheduleRotation(s.deps)
    rotation.cancel()
    rotation.cancel()
    expect(s.cleared).toStrictEqual([0])
    expect(rotation.inMs()).toBeNull()
  })

  it('iptal edilmiş rotasyon artık kapatmaz', () => {
    const s = spy()
    const rotation = scheduleRotation(s.deps)
    rotation.cancel()
    expect(s.closes).toStrictEqual([])
  })

  it('getDeadline YALNIZ bir kez okunur — kurulum anında', () => {
    const getDeadline = vi.fn(() => new Date(NOW + 800_000))
    const s = spy({ getDeadline })
    scheduleRotation(s.deps)
    expect(getDeadline).toHaveBeenCalledTimes(1)
  })
})

// ─── Üretim kablosu + istemci tarafı: SAHTE SAAT, gerçek setTimeout ────────
//
// Yukarıdaki testler `scheduleRotation`ı tek başına ölçüyor. Ama ADR-0007'nin
// asıl iddiası bir ZİNCİR: fonksiyon süresi dolmadan sunucu 4499 ile kapatır →
// istemci bunu ayırt eder → backoff'a girmeden ANINDA yeniden bağlanır → tam
// `state` gelir. Zincirin tek bir halkası kopsa (ör. `session.ts` rotasyonu
// hiç kurmasa) yukarıdaki birim testler YİNE yeşil kalırdı — "mekanizma var
// ama kimse çağırmıyor" örüntüsü (gotchas #4).
//
// Bu blok zinciri uçtan uca koşturur: GERÇEK `createRoomSession`, GERÇEK
// `scheduleRotation`, GERÇEK `createRoomWsClient` ve GERÇEK `roomClientReducer`.
// Saat `vi.useFakeTimers()` ile sahte; hiçbir yerde gerçek bekleme YOK.
//
// Otorite (`packages/db` geçişleri) burada sahte: bu testin konusu zamanlama ve
// taşıma. Geçişlerin kendisi `presence.test.ts`te GERÇEK Atlas'a karşı koşuyor.

const CODE = 'ABC234'
const EMPTY: Cell[] = [null, null, null, null, null, null, null, null, null]
/** Rotasyon 20_000 ms'de: ilk nabızdan (25_000) ÖNCE, testi tek olaya indirger. */
const DEADLINE_MS = 30_000

function makeRoom(board: Cell[], version: number): RoomDoc {
  return {
    code: CODE,
    state: 'playing',
    seats: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
    presence: { X: null, O: null },
    board: [...board],
    moves: [],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    lastEmoji: null,
    gameId: null,
    version,
    startedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  }
}

const idleHub: RoomHub = {
  subscribe: () => Promise.resolve(),
  unsubscribe: () => Promise.resolve(),
  stats: (): RoomHubStats => ({
    watchCalls: 1,
    // > 0: "sağır instance" kurtarma yolu bu testin konusu değil.
    openStreams: 1,
    rooms: 1,
    subscribers: 1,
    reopenAttempts: 0,
    hasResumeToken: false,
  }),
}

interface RoomState {
  room: RoomDoc
}

function stubDb(state: RoomState): RoomTransitions {
  const ok = (): Promise<{ ok: true; room: RoomDoc; events: [] }> =>
    Promise.resolve({ ok: true, room: state.room, events: [] })
  return {
    findRoom: () => Promise.resolve(state.room),
    joinRoom: ok,
    applyMove: ok,
    resign: ok,
    offerRematch: ok,
    acceptRematch: ok,
    pushEmoji: ok,
    settleDeadlines: () => Promise.resolve(null),
    detachConnection: () => Promise.resolve(),
  }
}

interface Link {
  socket: SocketLike
  /** Sunucu tarafını başlatır: WS el sıkışması + `session.start()`. */
  open(): Promise<void>
}

function createLink(state: RoomState, connId: string): Link {
  const socket: SocketLike = {
    send: () => undefined,
    close: () => undefined,
    onopen: null,
    onmessage: null,
    onclose: null,
  }

  const session = createRoomSession({
    roomCode: CODE,
    connId,
    identity: { userId: 'u1', name: 'Ada' },
    socket: {
      send: (data) => socket.onmessage?.({ data }),
      close: (code) => socket.onclose?.({ code }),
    },
    hub: idleHub,
    db: stubDb(state),
    now: () => Date.now(),
    // Sunucu da SAHTE saati kullanır: `vi.advanceTimersByTime` iki tarafı
    // birden ilerletir, elle `callback()` çağrılmaz.
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
    getDeadline: () => new Date(Date.now() + DEADLINE_MS),
    logError: () => undefined,
  })

  socket.send = (data): void => {
    void session.handleMessage(data)
  }
  socket.close = (): void => {
    void session.end()
  }

  return {
    socket,
    open: async (): Promise<void> => {
      socket.onopen?.()
      await session.start()
    },
  }
}

interface Pair {
  client: RoomWsClient
  links: Link[]
  state: RoomState
  /** İstemcinin kurduğu HER zamanlayıcının gecikmesi — backoff kanıtı. */
  clientDelays: number[]
  /** En son açılan soket bağlantısı. */
  last(): Link
}

function pair(board: Cell[] = EMPTY): Pair {
  const state: RoomState = { room: makeRoom(board, 10) }
  const links: Link[] = []
  const clientDelays: number[] = []
  const client = createRoomWsClient({
    url: `wss://ornek/api/rooms/${CODE}/ws`,
    roomCode: CODE,
    createSocket: () => {
      const link = createLink(state, `conn-${String(links.length)}`)
      links.push(link)
      return link.socket
    },
    now: () => Date.now(),
    // 0.5 jitter → `nextReconnectDelay(0)` tam olarak WS_RECONNECT_BASE_MS.
    rng: () => 0.5,
    setTimer: (callback, ms) => {
      clientDelays.push(ms)
      return setTimeout(callback, ms)
    },
    clearTimer: (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
    onChange: () => undefined,
    onReauth: () => undefined,
  })
  return {
    client,
    links,
    state,
    clientDelays,
    last: () => {
      const link = links[links.length - 1]
      if (link === undefined) throw new Error('hiç soket açılmadı')
      return link
    },
  }
}

/**
 * Sahte saati **1 ms** ilerletir. `0` KULLANILMAZ: `@sinonjs/fake-timers` bir
 * tick'in İÇİNDE kurulan 0 gecikmeli zamanlayıcıyı aynı `tickAsync(0)`
 * çağrısında çalıştırmıyor — CANLI doğrulandı, `advanceTimersByTimeAsync(0)`
 * ile soket hiç açılmıyordu. Bu bir sahte-saat artefaktı olduğu için
 * "gecikmesiz" iddiası soket sayımına DEĞİL, istemcinin zamanlayıcıya verdiği
 * gecikmeye (`clientDelays`) dayandırılıyor.
 */
async function tick(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1)
}

describe('rotasyon TAM TURU — sunucu 4499 → istemci gecikmesiz döner (sahte saat)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('üretim kablosu bağlı: session rotasyonu KURAR ve süresi dolunca 4499 gönderir', async () => {
    const p = pair()
    p.client.connect()
    await p.last().open()
    expect(p.client.getState().connection).toBe('bagli')

    const kapanislar: number[] = []
    const acikSoket = p.last().socket
    const oncekiOnClose = acikSoket.onclose
    acikSoket.onclose = (event): void => {
      kapanislar.push(event.code)
      oncekiOnClose?.(event)
    }

    // Rotasyondan 1 ms önce: hâlâ bağlı, hiçbir kapanış yok.
    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 10_000 - 1)
    expect(kapanislar).toStrictEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(kapanislar).toStrictEqual([WS_CLOSE.ROTATE])
  })

  it('4499 sonrası yeniden bağlanma GECİKMESİ 0 ms olur ve tam state ile oyun sürer', async () => {
    const p = pair()
    p.client.connect()
    await p.last().open()
    expect(p.links).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 10_000)

    // İstemci yeniden bağlanmayı 0 ms'ye kurdu: geri çekilme YOK ve sayaç
    // sıfırlandı. (Aşağıdaki karşıt kanıtta aynı yer 500 ms gösteriyor.)
    expect(p.clientDelays[p.clientDelays.length - 1]).toBe(0)
    expect(p.client.getState().reconnectAttempt).toBe(0)

    await tick()
    expect(p.links).toHaveLength(2)

    await p.last().open()
    expect(p.client.getState().connection).toBe('bagli')
    expect(p.client.getState().version).toBe(10)
  })

  it(
    'KARŞIT KANIT — sınıflandırılmamış 1006 gecikmesiz DEĞİL: ' +
      `${String(WS_RECONNECT_BASE_MS)} ms geri çekilme kurulur (4499 ayrımı gerçek)`,
    async () => {
      const p = pair()
      p.client.connect()
      await p.last().open()

      p.last().socket.onclose?.({ code: 1006 })
      await tick()

      expect(p.clientDelays[p.clientDelays.length - 1]).toBe(WS_RECONNECT_BASE_MS)
      expect(p.client.getState().connection).toBe('kopuk')
      expect(p.links).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(WS_RECONNECT_BASE_MS - 2)
      expect(p.links).toHaveLength(1)

      await tick()
      expect(p.links).toHaveLength(2)
    },
  )

  it('AC8 — sürüm boşluğunda bekleyen hamle gelen state`te VARSA onaylanır (0 ms, hata yok)', async () => {
    const p = pair()
    p.client.connect()
    await p.last().open()

    p.client.dispatch({ type: 'ui:cell', index: 4 })
    expect(p.client.getState().pending).toStrictEqual({ index: 4, by: 'X' })

    // Sunucu hamleyi uyguladı ama yankı KAYBOLDU: istemciye sürümce ileri bir
    // olay düşüyor → resync (KK-047).
    const board = [...EMPTY]
    board[4] = 'X'
    p.state.room = makeRoom(board, 42)
    p.last().socket.onmessage?.({
      data: JSON.stringify({ type: 'move:applied', index: 0, by: 'O', version: 99 }),
    })
    await tick()

    const state = p.client.getState()
    expect(state.pending).toBeNull()
    expect(state.board[4]).toBe('X')
    expect(state.version).toBe(42)
    expect(state.lastError).toBeNull()
  })

  it('AC8 — bekleyen hamle gelen state`te YOKSA SESSİZCE silinir (hata rozeti yanmaz)', async () => {
    const p = pair()
    p.client.connect()
    await p.last().open()

    p.client.dispatch({ type: 'ui:cell', index: 4 })
    expect(p.client.getState().pending).toStrictEqual({ index: 4, by: 'X' })

    // Bu kez sunucu hamleyi HİÇ uygulamamış: tahta boş döner.
    p.state.room = makeRoom(EMPTY, 42)
    p.last().socket.onmessage?.({
      data: JSON.stringify({ type: 'move:applied', index: 0, by: 'O', version: 99 }),
    })
    await tick()

    const state = p.client.getState()
    expect(state.pending).toBeNull()
    expect(state.board).toStrictEqual(EMPTY)
    // KK-065: iptal KULLANICIYA HATA GÖSTERMEZ.
    expect(state.lastError).toBeNull()
  })
})
