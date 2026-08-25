import { randomUUID } from 'node:crypto'
import type { Cell } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Game } from '../models/game'
import { Room } from '../models/room'
import { User } from '../models/user'
import { buildPairKey, deriveParticipants } from '../pair'
import { generateRoomCode } from '../room-code'
import { applyMove } from './apply-move'

/**
 * `applyMove` kural motorunun gördüğü bitişleri (`line`/`draw`) `games`e ve
 * `users.stats`e kesinleştirir (W1-02). Ayrı dosya: `apply-move.test.ts`
 * bilerek `gameId: null` odalarla çalışıyor ve kural motorunun kendisine
 * odaklanıyor; buradaki testler bitiş-kesinleştirme YOLUNU sınıyor.
 */
describe('applyMove → finishGame kablosu (KK-052)', () => {
  const createdCodes: string[] = []
  const createdGameIds: string[] = []
  const createdUserIds: string[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      await Room.deleteMany({ code: { $in: createdCodes } })
      createdCodes.length = 0
    }
    if (createdGameIds.length > 0) {
      await Game.deleteMany({ _id: { $in: createdGameIds } })
      createdGameIds.length = 0
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } })
      createdUserIds.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  async function makeUser(name: string): Promise<string> {
    const id = randomUUID()
    await User.create({ _id: id, name, email: `${id}@xox.test`, passwordHash: 'x' })
    createdUserIds.push(id)
    return id
  }

  async function roomWithGame(
    board: Cell[],
    moves: { index: number; by: 'X' | 'O' }[],
  ): Promise<{ code: string; xId: string; oId: string; gameId: string }> {
    const code = generateRoomCode()
    createdCodes.push(code)
    const xId = await makeUser('Ada')
    const oId = await makeUser('Kaan')
    const players = { X: xId, O: oId }
    const game = await Game.create({
      roomCode: code,
      players,
      participants: deriveParticipants(players),
      pairKey: buildPairKey(xId, oId),
    })
    createdGameIds.push(game._id)
    await Room.create({
      code,
      state: 'playing',
      seats: { X: { userId: xId, name: 'Ada' }, O: { userId: oId, name: 'Kaan' } },
      board,
      moves: moves.map((m) => ({ ...m, at: new Date() })),
      gameId: game._id,
      version: 4,
      startedAt: new Date(),
    })
    return { code, xId, oId, gameId: game._id }
  }

  it('kazanan çizgi: rooms.result damgalanır, games doldurulur, kazananın wins artar', async () => {
    const setup = await roomWithGame(
      ['X', 'X', null, 'O', 'O', null, null, null, null],
      [
        { index: 0, by: 'X' },
        { index: 3, by: 'O' },
        { index: 1, by: 'X' },
        { index: 4, by: 'O' },
      ],
    )

    const result = await applyMove(setup.code, setup.xId, 2)
    expect(result.ok).toBe(true)

    const room = await Room.findOne({ code: setup.code }).lean()
    expect(room?.state).toBe('finished')
    expect(room?.result).toStrictEqual({
      kind: 'won',
      winner: 'X',
      line: [0, 1, 2],
      reason: 'line',
    })

    const game = await Game.findById(setup.gameId).lean()
    expect(game?.winner).toBe('X')
    expect(game?.endReason).toBe('line')
    expect(game?.winLine).toStrictEqual([0, 1, 2])
    expect(game?.settledAt).toBeInstanceOf(Date)
    // 4 hazır hamle + kazanan hamle = 5 (kriter 3: oynanan hamle kadar öğe).
    expect(game?.moves).toHaveLength(5)

    const users = await User.find({ _id: { $in: [setup.xId, setup.oId] } }).lean()
    const byId = Object.fromEntries(users.map((u) => [u._id, u.stats]))
    expect(byId[setup.xId]).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    expect(byId[setup.oId]).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
  })

  it('beraberlik: iki tarafın draws sayacı da 1 olur', async () => {
    const setup = await roomWithGame(
      ['X', 'X', 'O', 'O', 'O', 'X', 'X', 'O', null],
      [
        { index: 0, by: 'X' },
        { index: 2, by: 'O' },
        { index: 1, by: 'X' },
        { index: 3, by: 'O' },
        { index: 5, by: 'X' },
        { index: 4, by: 'O' },
        { index: 6, by: 'X' },
        { index: 7, by: 'O' },
      ],
    )

    const result = await applyMove(setup.code, setup.xId, 8)
    expect(result.ok).toBe(true)

    const room = await Room.findOne({ code: setup.code }).lean()
    expect(room?.result).toStrictEqual({ kind: 'draw', winner: null, line: null, reason: null })

    const users = await User.find({ _id: { $in: [setup.xId, setup.oId] } }).lean()
    const byId = Object.fromEntries(users.map((u) => [u._id, u.stats]))
    expect(byId[setup.xId]).toStrictEqual({ wins: 0, losses: 0, draws: 1 })
    expect(byId[setup.oId]).toStrictEqual({ wins: 0, losses: 0, draws: 1 })
  })

  it('oyun sürerken result yazılmaz ve games dokunulmamış kalır', async () => {
    const setup = await roomWithGame(
      Array.from({ length: 9 }, () => null),
      [],
    )

    await applyMove(setup.code, setup.xId, 4)

    const room = await Room.findOne({ code: setup.code }).lean()
    expect(room?.state).toBe('playing')
    expect(room?.result).toBeNull()
    const game = await Game.findById(setup.gameId).lean()
    expect(game?.finishedAt).toBeNull()
  })
})
