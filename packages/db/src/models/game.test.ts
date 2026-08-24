import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Game, type MoveDoc } from './game'

describe('Game modeli', () => {
  const createdIds: string[] = []

  beforeAll(async () => {
    await connectDb()
    await Game.syncIndexes()
  })

  afterEach(async () => {
    if (createdIds.length > 0) {
      await Game.deleteMany({ _id: { $in: createdIds } })
      createdIds.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function track(id: string): string {
    createdIds.push(id)
    return id
  }

  function basePayload(id: string, roomCode: string): Record<string, unknown> {
    return {
      _id: id,
      roomCode,
      players: { X: 'u1', O: 'u2' },
      participants: ['u1', 'u2'],
      pairKey: 'u1|u2',
    }
  }

  it('_id kendiliğinden randomUUID ile üretilir', async () => {
    const roomCode = `RC${randomUUID().slice(0, 6)}`
    const game = await Game.create({
      roomCode,
      players: { X: 'u1', O: 'u2' },
      participants: ['u1', 'u2'],
      pairKey: 'u1|u2',
    })
    track(game._id)

    expect(typeof game._id).toBe('string')
    expect(game._id).toHaveLength(36)
  })

  it('tasarım §3.3 varsayılanlarıyla oluşur', async () => {
    const id = track(randomUUID())
    await Game.create({
      _id: id,
      roomCode: 'RCDEF01',
      players: { X: 'u1', O: 'u2' },
      participants: ['u1', 'u2'],
      pairKey: 'u1|u2',
    })

    const game = await Game.findById(id).lean()
    expect(game?.board).toStrictEqual(Array.from({ length: 9 }, () => null))
    expect(game?.moves).toStrictEqual([])
    expect(game?.winner).toBeNull()
    expect(game?.isDraw).toBe(false)
    expect(game?.endReason).toBeNull()
    expect(game?.winLine).toBeNull()
    expect(game?.rated).toBe(false)
    expect(game?.eloDelta).toStrictEqual({ X: 0, O: 0 })
    expect(game?.finishedAt).toBeNull()
    expect(game?.settledAt).toBeNull()
    expect(game?.players).toStrictEqual({ X: 'u1', O: 'u2' })
    expect(game?.participants).toStrictEqual(['u1', 'u2'])
    expect(game?.pairKey).toBe('u1|u2')
  })

  it('bitmiş bir oyunu winLine + endReason + eloDelta ile saklar', async () => {
    const id = track(randomUUID())
    const now = new Date()
    await Game.create({
      _id: id,
      roomCode: 'RCFIN01',
      players: { X: 'u1', O: 'u2' },
      participants: ['u1', 'u2'],
      pairKey: 'u1|u2',
      winner: 'X',
      endReason: 'line',
      winLine: [0, 1, 2],
      rated: true,
      eloDelta: { X: 12, O: -12 },
      finishedAt: now,
      settledAt: now,
    })

    const game = await Game.findById(id).lean()
    expect(game?.winner).toBe('X')
    expect(game?.endReason).toBe('line')
    expect(game?.winLine).toStrictEqual([0, 1, 2])
    expect(game?.rated).toBe(true)
    expect(game?.eloDelta).toStrictEqual({ X: 12, O: -12 })
    expect(game?.finishedAt).toBeInstanceOf(Date)
    expect(game?.settledAt).toBeInstanceOf(Date)
  })

  it('winLine 3 indeksten farklı bir uzunlukta ise reddedilir', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        _id: id,
        roomCode: 'RCBAD01',
        players: { X: 'u1', O: 'u2' },
        participants: ['u1', 'u2'],
        pairKey: 'u1|u2',
        winLine: [0, 1],
      }),
    ).rejects.toThrow()
  })

  it('board tam olarak 9 hücreden farklı bir uzunlukta ise reddedilir', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        _id: id,
        roomCode: 'RCBAD02',
        players: { X: 'u1', O: 'u2' },
        participants: ['u1', 'u2'],
        pairKey: 'u1|u2',
        board: Array.from({ length: 5 }, () => null),
      }),
    ).rejects.toThrow()
  })

  it('9 hücreden fazla hamle reddedilir', async () => {
    const id = track(randomUUID())
    const extra: MoveDoc[] = Array.from({ length: 10 }, (_, i) => ({
      index: i % 9,
      by: i % 2 === 0 ? 'X' : 'O',
      at: new Date(),
    }))
    await expect(
      Game.create({
        _id: id,
        roomCode: 'RCBAD03',
        players: { X: 'u1', O: 'u2' },
        participants: ['u1', 'u2'],
        pairKey: 'u1|u2',
        moves: extra,
      }),
    ).rejects.toThrow()
  })

  it('çapraz tutarsızlık: isDraw=true iken bir kazanan atanamaz', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({ ...basePayload(id, 'RCBAD04'), isDraw: true, winner: 'X' }),
    ).rejects.toThrow()
  })

  it("çapraz tutarsızlık: endReason='line' iken winner null olamaz", async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        ...basePayload(id, 'RCBAD05'),
        endReason: 'line',
        winner: null,
        winLine: [0, 1, 2],
      }),
    ).rejects.toThrow()
  })

  it("çapraz tutarsızlık: endReason='line' iken winLine null olamaz", async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        ...basePayload(id, 'RCBAD06'),
        endReason: 'line',
        winner: 'X',
        winLine: null,
      }),
    ).rejects.toThrow()
  })

  it('çapraz tutarsızlık: finishedAt=null iken bir kazanan atanamaz (oyun sürüyor)', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({ ...basePayload(id, 'RCBAD07'), winner: 'X', finishedAt: null }),
    ).rejects.toThrow()
  })

  // DB-002/AC12: `participants`/`pairKey` `players`'tan türetilenle eşleşmek ZORUNDADIR.
  it('participants players sırasıyla eşleşmiyorsa reddedilir', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        ...basePayload(id, 'RCBAD08'),
        players: { X: 'u1', O: 'u2' },
        participants: ['u2', 'u1'], // ters sıra — players'tan türetilenle eşleşmiyor
      }),
    ).rejects.toThrow(/participants/)
  })

  it('participants players ile tamamen ilgisiz bir kullanıcı içeriyorsa reddedilir', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        ...basePayload(id, 'RCBAD09'),
        players: { X: 'u1', O: 'u2' },
        participants: ['u1', 'baska-biri'],
      }),
    ).rejects.toThrow(/participants/)
  })

  it('pairKey players alanından türetilenle eşleşmiyorsa reddedilir', async () => {
    const id = track(randomUUID())
    await expect(
      Game.create({
        ...basePayload(id, 'RCBAD10'),
        players: { X: 'u1', O: 'u2' },
        participants: ['u1', 'u2'],
        pairKey: 'u2|u1', // yanlış sıra — buildPairKey('u1','u2') === 'u1|u2' üretir
      }),
    ).rejects.toThrow(/pairKey/)
  })

  it('players tersine çevrilse bile (O küçük id, X büyük id) doğru türetilen değerlerle kabul edilir', async () => {
    const id = track(randomUUID())
    await Game.create({
      _id: id,
      roomCode: 'RCOK01',
      players: { X: 'z-buyuk', O: 'a-kucuk' },
      participants: ['z-buyuk', 'a-kucuk'],
      pairKey: 'a-kucuk|z-buyuk',
    })
    const game = await Game.findById(id).lean()
    expect(game?.pairKey).toBe('a-kucuk|z-buyuk')
  })
})
