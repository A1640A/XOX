import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RoomCode, SocketLike, StateMessage } from '@xox/shared'
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
    ...overrides,
  }
}

function setup() {
  let socket!: FakeSocket
  const hook = renderHook(() =>
    useRoom(ROOM_CODE, {
      createSocket: () => {
        socket = new FakeSocket()
        return socket
      },
      now: () => 1_000,
      rng: () => 0.5,
    }),
  )
  return { socket, hook }
}

describe('useRoom', () => {
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
