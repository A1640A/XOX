import type { RoomCode, ServerMessage, SocketLike, StateMessage } from '@xox/shared'

/** `packages/shared/src/ws-client.test.ts`teki `SahteSoket`in eş biçimi. */
export class FakeSocket implements SocketLike {
  public readonly sent: string[] = []
  public readonly closes: (number | undefined)[] = []
  public onopen: (() => void) | null = null
  public onmessage: ((event: { data: unknown }) => void) | null = null
  public onclose: ((event: { code: number }) => void) | null = null

  public constructor(public readonly url: string) {}

  public send(data: string): void {
    this.sent.push(data)
  }

  public close(code?: number): void {
    this.closes.push(code)
  }

  public open(): void {
    this.onopen?.()
  }

  public receive(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  public serverClosed(code: number): void {
    this.onclose?.({ code })
  }
}

export function fakeStateMessage(
  roomCode: RoomCode,
  patch: Partial<StateMessage> = {},
): StateMessage {
  return {
    type: 'state',
    roomCode,
    board: [null, null, null, null, null, null, null, null, null],
    status: { kind: 'playing', turn: 'X' },
    players: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    you: 'X',
    version: 1,
    turnDeadline: null,
    graceEndsAt: null,
    rematch: null,
    serverTime: 1_000,
    size: 3,
    winLength: 3,
    lastMove: null,
    ...patch,
  }
}

export function fakeTimers(): {
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  flushAll: () => void
} {
  const pending = new Map<number, () => void>()
  let nextId = 1
  return {
    setTimer: (callback) => {
      const id = nextId
      nextId += 1
      pending.set(id, callback)
      return id
    },
    clearTimer: (handle) => {
      pending.delete(handle as number)
    },
    flushAll: () => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback()
    },
  }
}
