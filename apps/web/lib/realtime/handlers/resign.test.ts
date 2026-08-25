import type { RoomDoc } from '@xox/db'
import { type Cell, type ServerMessage, serverMessageSchema } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { createRoomConnection } from '../connection'
import type { HandlerContext, RoomTransitions } from '../context'
import { handleResign } from './resign'

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
    gameId: 'g1',
    version: 10,
    startedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  }
}

interface Fixture {
  context: HandlerContext
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
}

function fixture(overrides: Partial<RoomTransitions> = {}): Fixture {
  const sent: ServerMessage[] = []
  const closes: Fixture['closes'] = []
  const room = makeRoom()
  const ok = { ok: true as const, room, events: [] }

  const db: RoomTransitions = {
    findRoom: () => Promise.resolve(room),
    joinRoom: () => Promise.resolve(ok),
    applyMove: () => Promise.resolve(ok),
    resign: () => Promise.resolve(ok),
    offerRematch: () => Promise.resolve(ok),
    acceptRematch: () => Promise.resolve(ok),
    pushEmoji: () => Promise.resolve(ok),
    settleDeadlines: () => Promise.resolve(null),
    detachConnection: () => Promise.resolve(),
    ...overrides,
  }

  const connection = createRoomConnection({
    roomCode: CODE,
    connId: 'c1',
    userId: 'u1',
    now: () => NOW,
    socket: {
      send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
      close: (code, reason) => closes.push({ code, reason: reason ?? '' }),
    },
  })

  return {
    sent,
    closes,
    context: {
      roomCode: CODE,
      connId: 'c1',
      identity: { userId: 'u1', name: 'Ada' },
      connection,
      db,
      now: () => NOW,
    },
  }
}

describe('resign handler`ı (KK-054)', () => {
  it('otoriteye doğru argümanlarla delege eder', async () => {
    const resign = vi.fn(() => Promise.resolve({ ok: true as const, room: makeRoom(), events: [] }))
    const f = fixture({ resign })

    await handleResign(f.context)

    expect(resign).toHaveBeenCalledWith(CODE, 'u1')
  })

  it('R1: BAŞARILI pes etmede tek bayt bile gitmez — sonuç change stream`den gelir', async () => {
    const f = fixture()
    f.context.connection.primeState(makeRoom())
    f.sent.length = 0

    await handleResign(f.context)

    expect(f.sent).toStrictEqual([])
    expect(f.closes).toStrictEqual([])
  })

  it('oyun zaten bittiyse GAME_OVER hatası yazar ve bağlantıyı KAPATMAZ', async () => {
    const f = fixture({ resign: () => Promise.resolve({ ok: false, code: 'GAME_OVER' }) })

    await handleResign(f.context)

    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'GAME_OVER', message: 'Oyun zaten bitti.' },
    ])
    expect(f.closes).toStrictEqual([])
  })

  it('oda bulunamazsa ROOM_NOT_FOUND yazar', async () => {
    const f = fixture({ resign: () => Promise.resolve({ ok: false, code: 'ROOM_NOT_FOUND' }) })

    await handleResign(f.context)

    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'ROOM_NOT_FOUND' })
  })

  it('protokol dışı bir kod SERVER_ERROR`a daraltılır (ham kod tele KONMAZ)', async () => {
    // `not-your-turn` bir `MoveRejectionReason`dır, `ErrorCode` DEĞİLDİR.
    const f = fixture({ resign: () => Promise.resolve({ ok: false, code: 'not-your-turn' }) })

    await handleResign(f.context)

    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'SERVER_ERROR', message: 'Pes etme uygulanamadı.' },
    ])
  })
})
