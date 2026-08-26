import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  nextReconnectDelay,
  WS_CLOSE,
  type RoomCode,
  type SocketLike,
  type StateMessage,
} from '@xox/shared'
import { useRoom } from './use-room'

/**
 * `SocketLike`'ın elle yazılmış sahte uygulaması. Gerçek `roomClientReducer`
 * ve `createRoomWsClient` burada MOCK'LANMAZ — yalnız G/Ç sınırı (soket) sahte.
 * Bu yüzden bu test `useRoom`'un kendi mock'unu değil, gerçek reducer'a doğru
 * olay yolladığını doğrular (gotchas.md).
 */
class FakeSocket implements SocketLike {
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  closed = false
  closeCode: number | undefined

  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number): void {
    this.closed = true
    this.closeCode = code
  }
}

const ROOM_CODE = 'ABC234' as RoomCode

function stateMessage(overrides: Partial<StateMessage> = {}): StateMessage {
  return {
    type: 'state',
    roomCode: ROOM_CODE,
    board: [null, null, null, null, null, null, null, null, null],
    status: { kind: 'playing', turn: 'X' },
    players: {
      X: { userId: 'u1', name: 'Ayşe' },
      O: { userId: 'u2', name: 'Deniz' },
    },
    you: 'X',
    version: 3,
    turnDeadline: null,
    graceEndsAt: null,
    rematch: null,
    serverTime: 1_000,
    size: 3,
    winLength: 3,
    lastMove: null,
    ...overrides,
  }
}

function setup() {
  let socket!: FakeSocket
  // İnceleme minor bulgusu: `reactStrictMode: true` (next.config.ts) hiçbir
  // testte koşulmuyordu. StrictMode geliştirme modunda mount efektini
  // (kurulum → temizlik → kurulum) İKİ KEZ çalıştırır; `wrapper` bunu gerçek
  // bir teste dönüştürür — daha önce yalnız reviewer'ın elle doğruladığı
  // "tek soket açılıyor" iddiası artık mekanik olarak kilitli.
  const hook = renderHook(
    () =>
      useRoom(ROOM_CODE, {
        createSocket: () => {
          socket = new FakeSocket()
          return socket
        },
        now: () => 1_000,
        rng: () => 0.5,
      }),
    { wrapper: StrictMode },
  )
  return { socket, hook }
}

describe('useRoom', () => {
  it('StrictMode altında mount çift çalışsa da TEK soket açık kalır', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
    })

    expect(hook.result.current.state.connection).toBe('bagli')
    expect(socket.closed).toBe(false)
  })

  it('bağlanınca connection bagli olur ve gelen state mesajını uygular', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
    })
    expect(hook.result.current.state.connection).toBe('bagli')

    act(() => {
      socket.onmessage?.({ data: JSON.stringify(stateMessage()) })
    })

    expect(hook.result.current.state.you).toBe('X')
    expect(hook.result.current.state.version).toBe(3)
    expect(hook.result.current.state.players.O?.name).toBe('Deniz')
  })

  it('actions.move gerçek reducer üzerinden doğru move çerçevesini gönderir', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
      socket.onmessage?.({ data: JSON.stringify(stateMessage()) })
    })

    act(() => {
      hook.result.current.actions.move(4)
    })

    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0] ?? '{}')).toStrictEqual({ type: 'move', index: 4 })
    expect(hook.result.current.state.pending).toStrictEqual({ index: 4, by: 'X' })
  })

  it('sıra rakipteyken actions.move hiçbir şey göndermez (KK-041)', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
      socket.onmessage?.({
        data: JSON.stringify(stateMessage({ status: { kind: 'playing', turn: 'O' } })),
      })
    })

    act(() => {
      hook.result.current.actions.move(0)
    })

    expect(socket.sent).toHaveLength(0)
    expect(hook.result.current.state.pending).toBeNull()
  })

  it('actions.resign yalnız oyun sürerken resign çerçevesi gönderir', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
      socket.onmessage?.({ data: JSON.stringify(stateMessage()) })
    })

    act(() => {
      hook.result.current.actions.resign()
    })

    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0] ?? '{}')).toStrictEqual({ type: 'resign' })
  })

  it('actions.offerRematch ve acceptRematch doğru çerçeveleri üretir', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
      socket.onmessage?.({
        data: JSON.stringify(stateMessage({ status: { kind: 'draw' } })),
      })
    })

    act(() => {
      hook.result.current.actions.offerRematch()
    })
    expect(JSON.parse(socket.sent[0] ?? '{}')).toStrictEqual({ type: 'rematch:offer' })

    act(() => {
      socket.onmessage?.({
        data: JSON.stringify({ type: 'rematch:offered', by: 'O', expiresAt: 5_000 }),
      })
    })
    act(() => {
      hook.result.current.actions.acceptRematch()
    })
    expect(JSON.parse(socket.sent[1] ?? '{}')).toStrictEqual({ type: 'rematch:accept' })
  })

  it('actions.sendEmoji doğru emoji çerçevesini gönderir', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
      socket.onmessage?.({ data: JSON.stringify(stateMessage()) })
    })

    act(() => {
      hook.result.current.actions.sendEmoji('🔥')
    })

    expect(JSON.parse(socket.sent[0] ?? '{}')).toStrictEqual({ type: 'chat:emoji', emoji: '🔥' })
  })

  it('unmount olunca soketi kapatır', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
    })
    hook.unmount()

    expect(socket.closed).toBe(true)
  })

  it('actions.reconnect yeni bir bağlantı açar', () => {
    const { socket, hook } = setup()

    act(() => {
      socket.onopen?.()
    })
    const firstSocket = socket

    act(() => {
      hook.result.current.actions.reconnect()
    })

    expect(firstSocket.closed).toBe(true)
  })
})

/**
 * BLOKER düzeltmesi (inceleme #1): 4401 art arda geldiğinde önceki sürüm
 * `attempt`i yok sayıp gecikmesiz `connect()` çağırıyordu. Canlı ölçüm: 21
 * ardışık close → 22 soket, aralarında 0 ms. Bu grup gerçek zamanlayıcıları
 * (`vi.useFakeTimers`) kullanarak backoff'un GERÇEKTEN uygulandığını ve
 * eşik aşılınca yeniden bağlanmanın DURDUĞUNU kilitler.
 */
describe('useRoom — 4401 backoff fırtınası (BLOCKER düzeltmesi)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('her 4401 kapanışında nextReconnectDelay kadar bekler, 5 denemeden sonra pes edip kopuk kalır', () => {
    const sockets: FakeSocket[] = []
    const rng = (): number => 0.5

    const hook = renderHook(() =>
      useRoom(ROOM_CODE, {
        createSocket: () => {
          const created = new FakeSocket()
          sockets.push(created)
          return created
        },
        now: () => 1_000,
        rng,
      }),
    )

    // İlk bağlantı (mount effect) — reauth DEĞİL, doğrudan connect().
    expect(sockets).toHaveLength(1)

    // Sunucu HER bağlantıyı 4401 ile kapatıyor. `attempt` sırasıyla 0..4 —
    // reducer bunu `state.reconnectAttempt`in ÖNCEKİ (artış öncesi) değerinden
    // türetiyor (room-client.ts `closed()`).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = sockets.at(-1)
      expect(current).toBeDefined()

      act(() => {
        current?.onclose?.({ code: WS_CLOSE.UNAUTHENTICATED })
      })

      // Bekleyen bağlantı durumu — gerçek hata bilgisi zaten sette.
      expect(hook.result.current.state.connection).toBe('baglaniyor')
      expect(hook.result.current.state.lastError).toBe('UNAUTHENTICATED')

      const expectedDelay = nextReconnectDelay(attempt, rng)

      // Backoff dolmadan YENİ soket AÇILMAMALI (fırtınanın tam tersi).
      act(() => {
        vi.advanceTimersByTime(expectedDelay - 1)
      })
      expect(sockets).toHaveLength(attempt + 1)

      // Gecikme tam dolunca TEK bir yeni soket açılır.
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(sockets).toHaveLength(attempt + 2)
    }

    // 6. soket de 4401 ile kapanıyor — bu sefer attempt=5, eşiği (5) AŞIYOR.
    expect(sockets).toHaveLength(6)
    const last = sockets.at(-1)
    act(() => {
      last?.onclose?.({ code: WS_CLOSE.UNAUTHENTICATED })
    })

    // Pes edildi: ne kadar zaman geçerse geçsin YENİ soket AÇILMAZ.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(sockets).toHaveLength(6)

    // Kullanıcı donmuş "Bağlanıyor…" yerine GERÇEK bir hata görür.
    expect(hook.result.current.state.connection).toBe('kopuk')
    expect(hook.result.current.state.lastError).toBe('UNAUTHENTICATED')

    hook.unmount()
  })

  it('unmount bekleyen reauth zamanlayıcısını iptal eder — unmount sonrası yeni soket AÇILMAZ', () => {
    const sockets: FakeSocket[] = []
    const rng = (): number => 0.5

    const hook = renderHook(() =>
      useRoom(ROOM_CODE, {
        createSocket: () => {
          const created = new FakeSocket()
          sockets.push(created)
          return created
        },
        now: () => 1_000,
        rng,
      }),
    )

    act(() => {
      sockets.at(-1)?.onclose?.({ code: WS_CLOSE.UNAUTHENTICATED })
    })
    expect(sockets).toHaveLength(1)

    // Backoff zamanlayıcısı bekliyorken bileşen kaldırılıyor.
    hook.unmount()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    // Zamanlayıcı unmount'ta temizlendiği için yetim bir soket AÇILMAZ.
    expect(sockets).toHaveLength(1)
  })
})

/**
 * MAJOR düzeltmesi (inceleme #2): `getServerSnapshot` her çağrıda yeni bir
 * nesne döndürüyordu. RTL'in `render()`'ı hidrasyon YAPMADIĞI için önceki 8
 * test de bunu göremiyordu (gotchas.md #5 — testin köründe kaldığı sınıf).
 * Bu test GERÇEK `renderToString` + `hydrateRoot` kullanır ve React'in
 * "The result of getServerSnapshot should be cached to avoid an infinite
 * loop" uyarısını `console.error` üzerinden yakalar.
 */
describe('useRoom — getServerSnapshot kararlılığı (hydrateRoot sondası)', () => {
  function Host({ roomCode }: { roomCode: RoomCode }): React.ReactElement {
    const { state } = useRoom(roomCode, {
      createSocket: () => new FakeSocket(),
      now: () => 1_000,
      rng: () => 0.5,
    })
    return <div data-testid="conn">{state.connection}</div>
  }

  it('hydrateRoot sırasında "getServerSnapshot should be cached" uyarısı ÜRETMEZ', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = document.createElement('div')
    document.body.appendChild(container)

    try {
      container.innerHTML = renderToString(<Host roomCode={ROOM_CODE} />)

      act(() => {
        hydrateRoot(container, <Host roomCode={ROOM_CODE} />)
      })

      const infiniteLoopWarning = errorSpy.mock.calls.some((args) =>
        args.some(
          (arg) => typeof arg === 'string' && arg.includes('getServerSnapshot should be cached'),
        ),
      )
      expect(infiniteLoopWarning).toBe(false)
    } finally {
      errorSpy.mockRestore()
      document.body.removeChild(container)
    }
  })
})

/**
 * MAJOR düzeltmesi (inceleme #3): efekt bağımlılığı boştu, `roomCode`
 * değişse de aynı soket AÇIK kalıyordu — `/oda/[kod]` aynı dinamik segment
 * içinde istemci-taraflı gezinmede (davet linki, rövanş yönlendirmesi)
 * bileşen remount OLMAYABİLİR, bu durumda hamleler YANLIŞ odaya giderdi.
 */
describe('useRoom — roomCode değişimi (MAJOR düzeltmesi)', () => {
  it('roomCode değiştiğinde eski soketi kapatıp yeni koda bağlı bir soket açar', () => {
    const urls: string[] = []
    const sockets: FakeSocket[] = []

    const { rerender } = renderHook(
      ({ roomCode }: { roomCode: RoomCode }) =>
        useRoom(roomCode, {
          createSocket: (url) => {
            urls.push(url)
            const created = new FakeSocket()
            sockets.push(created)
            return created
          },
          now: () => 1_000,
          rng: () => 0.5,
        }),
      { initialProps: { roomCode: 'ABC234' } },
    )

    expect(sockets).toHaveLength(1)
    expect(urls[0]).toContain('ABC234')
    const firstSocket = sockets[0]

    act(() => {
      rerender({ roomCode: 'XYZ789' })
    })

    expect(firstSocket?.closed).toBe(true)
    expect(sockets).toHaveLength(2)
    expect(urls[1]).toContain('XYZ789')
    expect(urls[1]).not.toContain('ABC234')
  })
})
