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

  // ADR-0014 §3 — İKİNCİ KEMER: `Model.create` yolunda `9..121` aralığına
  // genişledi (KK-B69). Oda BAŞINA gerçek sınır (`size²`) burada DAYATILMAZ,
  // onu kural motoru (`isValidMove`) ve `casUpdateRoom`'un `board` kanalı
  // sağlar — bu yüzden 8 ve 122 SINIR DEĞERLERİ sınanır, 9 ve 121 DEĞİL.
  it('board 8 hücreyle (alt sınırın altı) REDDEDİLİR', async () => {
    const code = freshCode()
    await expect(
      Room.create({ code, board: Array.from({ length: 8 }, () => null) }),
    ).rejects.toThrow()
  })

  it('board 122 hücreyle (üst sınırın üstü, KK-B69) REDDEDİLİR', async () => {
    const code = freshCode()
    await expect(
      Room.create({ code, board: Array.from({ length: 122 }, () => null) }),
    ).rejects.toThrow()
  })

  it('board TAM 121 hücreyle (11×11 üst sınır) KABUL EDİLİR', async () => {
    const code = freshCode()
    await Room.create({
      code,
      size: 11,
      winLength: 5,
      board: Array.from({ length: 121 }, () => null),
    })
    const room = await Room.findOne({ code }).lean()
    expect(room?.board).toHaveLength(121)
    expect(room?.size).toBe(11)
    expect(room?.winLength).toBe(5)
  })

  it('boş board dizisi reddedilir — nextPlayer(board) tanımsız davranmasın', async () => {
    const code = freshCode()
    await expect(Room.create({ code, board: [] })).rejects.toThrow()
  })

  it('121 hamleden fazlası (KK-B69 üst sınır) REDDEDİLİR', async () => {
    const code = freshCode()
    const extra: RoomMove[] = Array.from({ length: 122 }, (_, i) => ({
      index: i % 121,
      by: i % 2 === 0 ? 'X' : 'O',
      at: new Date(),
    }))
    await expect(
      Room.create({
        code,
        size: 11,
        winLength: 5,
        board: Array.from({ length: 121 }, () => null),
        moves: extra,
      }),
    ).rejects.toThrow()
  })

  it('hamle index alanı 120e kadar (11×11 üst sınır, KK-B69) KABUL EDİLİR, 121 REDDEDİLİR', async () => {
    const accepted = freshCode()
    await Room.create({
      code: accepted,
      size: 11,
      winLength: 5,
      board: Array.from({ length: 121 }, () => null),
      moves: [{ index: 120, by: 'X', at: new Date() }],
    })
    const room = await Room.findOne({ code: accepted }).lean()
    expect(room?.moves[0]).toMatchObject({ index: 120 })

    await expect(
      Room.create({
        code: freshCode(),
        size: 11,
        winLength: 5,
        board: Array.from({ length: 121 }, () => null),
        moves: [{ index: 121, by: 'X', at: new Date() }],
      }),
    ).rejects.toThrow()
  })

  it('size/winLength verilmezse dokümanda ALAN OLARAK bile bulunmaz (ADR-0014 kural 1 — default YOK)', async () => {
    const code = freshCode()
    await Room.create({ code })
    const raw = await Room.collection.findOne({ code })
    expect(raw).not.toBeNull()
    expect(Object.hasOwn(raw ?? {}, 'size')).toBe(false)
    expect(Object.hasOwn(raw ?? {}, 'winLength')).toBe(false)
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
