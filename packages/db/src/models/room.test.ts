import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { generateRoomCode } from '../room-code'
import { Room, type RoomMove } from './room'

/**
 * Gerçek `xox_test` Atlas veritabanına karşı koşar (tasarım §1: "packages/db
 * içinde düz vitest run ile gerçek xox_test'e karşı"). `vitest.setup.ts`
 * `MONGODB_DB`'yi `xox_test`'e sabitler.
 */
describe('Room modeli', () => {
  const createdCodes: string[] = []

  beforeAll(async () => {
    await connectDb()
    await Room.syncIndexes()
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      await Room.deleteMany({ code: { $in: createdCodes } })
      createdCodes.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function freshCode(): string {
    const code = generateRoomCode()
    createdCodes.push(code)
    return code
  }

  it('yalnızca code verildiğinde tasarım §3.2 varsayılanlarıyla oluşur', async () => {
    const code = freshCode()
    await Room.create({ code })
    const room = await Room.findOne({ code }).lean()

    expect(room?.code).toBe(code)
    expect(room?.state).toBe('waiting')
    expect(room?.seats).toStrictEqual({ X: null, O: null })
    expect(room?.presence).toStrictEqual({ X: null, O: null })
    expect(room?.board).toStrictEqual(Array.from({ length: 9 }, () => null))
    expect(room?.moves).toStrictEqual([])
    expect(room?.turnDeadline).toBeNull()
    expect(room?.disconnected).toBeNull()
    expect(room?.rematch).toBeNull()
    expect(room?.lastEmoji).toBeNull()
    expect(room?.gameId).toBeNull()
    expect(room?.version).toBe(0)
    expect(room?.startedAt).toBeNull()
    expect(room?.createdAt).toBeInstanceOf(Date)
    expect(room?.updatedAt).toBeInstanceOf(Date)
  })

  it('seats/presence alt-belgelerini userId+name / connId+since ile saklar', async () => {
    const code = freshCode()
    const since = new Date()
    await Room.create({
      code,
      seats: { X: { userId: 'u1', name: 'Ömer' }, O: null },
      presence: { X: { connId: 'conn-1', since }, O: null },
    })

    const found = await Room.findOne({ code }).lean()
    expect(found?.seats.X).toMatchObject({ userId: 'u1', name: 'Ömer' })
    expect(found?.seats.O).toBeNull()
    expect(found?.presence.X).toMatchObject({ connId: 'conn-1' })
  })

  it('canlı hamle listesini index/by/at ile saklar', async () => {
    const code = freshCode()
    const at = new Date()
    await Room.create({ code, moves: [{ index: 4, by: 'X', at }] })

    const found = await Room.findOne({ code }).lean()
    expect(found?.moves).toHaveLength(1)
    expect(found?.moves[0]).toMatchObject({ index: 4, by: 'X' })
  })

  it('disconnected/rematch/lastEmoji alt-belgelerini saklar', async () => {
    const code = freshCode()
    const now = new Date()
    await Room.create({
      code,
      state: 'playing',
      disconnected: { seat: 'O', at: now, graceEndsAt: now },
      rematch: { by: 'X', expiresAt: now },
      lastEmoji: { from: 'O', emoji: '👋', at: now },
    })

    const found = await Room.findOne({ code }).lean()
    expect(found?.disconnected).toMatchObject({ seat: 'O' })
    expect(found?.rematch).toMatchObject({ by: 'X' })
    expect(found?.lastEmoji).toMatchObject({ from: 'O', emoji: '👋' })
  })

  it('code alanı benzersizdir — ikinci yazma E11000 ile reddedilir', async () => {
    const code = freshCode()
    await Room.create({ code })

    await expect(Room.create({ code })).rejects.toMatchObject({ code: 11000 })
  })

  it('board tam olarak 9 hücreden farklı bir uzunlukta ise reddedilir', async () => {
    const code = freshCode()
    await expect(
      Room.create({ code, board: Array.from({ length: 12 }, () => null) }),
    ).rejects.toThrow()
  })

  it('boş board dizisi reddedilir — nextPlayer(board) tanımsız davranmasın', async () => {
    const code = freshCode()
    await expect(Room.create({ code, board: [] })).rejects.toThrow()
  })

  it('9 hücreden fazla hamle reddedilir', async () => {
    const code = freshCode()
    const extra: RoomMove[] = Array.from({ length: 10 }, (_, i) => ({
      index: i % 9,
      by: i % 2 === 0 ? 'X' : 'O',
      at: new Date(),
    }))
    await expect(Room.create({ code, moves: extra })).rejects.toThrow()
  })

  // `result.line` doğrulayıcısı "tam 3"ten "3..6"ya genişledi (ADR-0011 §4):
  // tip 3..6 indeks derken mongoose'un tam 3 demesi, ancak 6×6 ilk kez
  // oynandığında patlayan bir tutarsızlık olurdu. Sınırlar ÇIPLAK sınanır.
  it('result.line 3..6 indeks kabul eder, dışını reddeder', async () => {
    const accepted = freshCode()
    await Room.create({
      code: accepted,
      state: 'finished',
      result: { kind: 'won', winner: 'X', line: [0, 1, 2, 3, 4, 5], reason: 'line' },
    })
    const room = await Room.findOne({ code: accepted }).lean()
    expect(room?.result?.line).toStrictEqual([0, 1, 2, 3, 4, 5])

    await expect(
      Room.create({
        code: freshCode(),
        state: 'finished',
        result: { kind: 'won', winner: 'X', line: [0, 1], reason: 'line' },
      }),
    ).rejects.toThrow()

    await expect(
      Room.create({
        code: freshCode(),
        state: 'finished',
        result: { kind: 'won', winner: 'X', line: [0, 1, 2, 3, 4, 5, 6], reason: 'line' },
      }),
    ).rejects.toThrow()
  })

  it('result.line null kalabilir — pes/süre/terk galibiyetinde çizgi yoktur', async () => {
    const code = freshCode()
    await Room.create({
      code,
      state: 'finished',
      result: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
    })
    const room = await Room.findOne({ code }).lean()
    expect(room?.result?.line).toBeNull()
  })
})
