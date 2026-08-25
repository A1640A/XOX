import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Game } from '../models/game'
import { Room } from '../models/room'
import { User } from '../models/user'
import { buildPairKey, deriveParticipants } from '../pair'
import { generateRoomCode } from '../room-code'
import { resign } from './resign'

const createdCodes: string[] = []
const createdGameIds: string[] = []
const createdUserIds: string[] = []

async function makeUser(name: string): Promise<string> {
  const id = randomUUID()
  await User.create({ _id: id, name, email: `${id}@xox.test`, passwordHash: 'x' })
  createdUserIds.push(id)
  return id
}

interface Playing {
  code: string
  xId: string
  oId: string
  gameId: string
}

/** İki hamle oynanmış, sürmekte olan bir oyun. */
async function playingRoom(): Promise<Playing> {
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
    board: ['X', 'O', null, null, null, null, null, null, null],
    moves: [
      { index: 0, by: 'X', at: new Date() },
      { index: 1, by: 'O', at: new Date() },
    ],
    gameId: game._id,
    version: 5,
    startedAt: new Date(),
  })
  return { code, xId, oId, gameId: game._id }
}

describe('resign — KK-054 (tasarım §3.7)', () => {
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

  it('olmayan oda ROOM_NOT_FOUND döner (fırlatmaz)', async () => {
    await expect(resign('ZZZZZZ', 'kimse')).resolves.toStrictEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    })
  })

  it('odada koltuğu olmayan kullanıcı ROOM_FULL alır ve HİÇBİR ŞEY yazılmaz', async () => {
    const p = await playingRoom()

    const result = await resign(p.code, 'yabanci')

    expect(result).toStrictEqual({ ok: false, code: 'ROOM_FULL' })
    const room = await Room.findOne({ code: p.code }).lean()
    expect(room?.version).toBe(5)
    expect(room?.state).toBe('playing')
  })

  it('oyun anında biter: state finished, kazanan RAKİP, endReason resign', async () => {
    const p = await playingRoom()

    const result = await resign(p.code, p.xId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
    expect(result.room.state).toBe('finished')
    expect(result.room.version).toBe(6)
    expect(result.events).toStrictEqual([
      { kind: 'resigned', by: 'X' },
      { kind: 'finished', status: { kind: 'won', winner: 'O', line: null, reason: 'resign' } },
    ])
  })

  it('taşıma durumu forfeitStatus ile üretilir ve `line` NULL yazılır (ADR-0001)', async () => {
    const p = await playingRoom()

    await resign(p.code, p.oId)

    const room = await Room.findOne({ code: p.code }).lean()
    expect(room?.result).toStrictEqual({
      kind: 'won',
      winner: 'X',
      line: null,
      reason: 'resign',
    })
  })

  it('pes eden kaybeder, rakibi kazanır — games ve stats bir kez yazılır', async () => {
    const p = await playingRoom()

    await resign(p.code, p.xId)

    const game = await Game.findById(p.gameId).lean()
    expect(game?.winner).toBe('O')
    expect(game?.endReason).toBe('resign')
    expect(game?.winLine).toBeNull()
    expect(game?.finishedAt).toBeInstanceOf(Date)
    expect(game?.settledAt).toBeInstanceOf(Date)
    // Pes anındaki tahta ve hamleler taşınır (kriter 3).
    expect(game?.moves).toHaveLength(2)

    const users = await User.find({ _id: { $in: [p.xId, p.oId] } }).lean()
    const byId = Object.fromEntries(users.map((u) => [u._id, u.stats]))
    expect(byId[p.oId]).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    expect(byId[p.xId]).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
  })

  it('İKİNCİ pes GAME_OVER alır ve sayaçları İKİNCİ KEZ ARTIRMAZ', async () => {
    const p = await playingRoom()

    await resign(p.code, p.xId)
    const second = await resign(p.code, p.oId)

    expect(second).toStrictEqual({ ok: false, code: 'GAME_OVER' })
    const room = await Room.findOne({ code: p.code }).lean()
    expect(room?.version).toBe(6)
    const users = await User.find({ _id: { $in: [p.xId, p.oId] } }).lean()
    const byId = Object.fromEntries(users.map((u) => [u._id, u.stats]))
    expect(byId[p.oId]).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    expect(byId[p.xId]).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
  })

  it('bekleyen bir rövanş teklifi varsa pes onu TEMİZLEMEZ — oyun zaten bitiyor', async () => {
    const p = await playingRoom()

    const result = await resign(p.code, p.xId)

    expect(result.ok).toBe(true)
    const room = await Room.findOne({ code: p.code }).lean()
    // Yeni bitişte teklif olamaz; alan `null` kalır (rövanş bundan SONRA gelir).
    expect(room?.rematch).toBeNull()
  })
})
