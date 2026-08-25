import { randomUUID } from 'node:crypto'
import type { SeatOccupant } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Game } from '../models/game'
import { Room } from '../models/room'
import { buildPairKey, deriveParticipants } from '../pair'
import { generateRoomCode } from '../room-code'
import { joinRoom } from './join'

describe('joinRoom', () => {
  const createdCodes: string[] = []
  const createdGameIds: string[] = []

  function seat(): SeatOccupant {
    return { userId: randomUUID(), name: 'Oyuncu' }
  }

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
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function freshCode(): string {
    const code = generateRoomCode()
    createdCodes.push(code)
    return code
  }

  it('ROOM_NOT_FOUND: olmayan oda kodu', async () => {
    const result = await joinRoom('ZZZZZZ', seat(), 'conn-1')
    expect(result).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' })
  })

  it(
    '2. kullanıcı O koltuğunu doldurunca TEK yazmada seats.O + state:playing + ' +
      'startedAt + gameId + version+1 uygulanır (AC4)',
    async () => {
      const code = freshCode()
      const owner = seat()
      await Room.create({ code, seats: { X: owner, O: null }, version: 1 })

      const joiner = seat()
      const result = await joinRoom(code, joiner, 'conn-o')

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      if (result.room.gameId !== null) createdGameIds.push(result.room.gameId)

      expect(result.room.state).toBe('playing')
      expect(result.room.seats.O).toMatchObject({ userId: joiner.userId, name: joiner.name })
      expect(result.room.startedAt).toBeInstanceOf(Date)
      expect(result.room.version).toBe(2)
      expect(result.room.gameId).not.toBeNull()
      expect(result.events).toEqual([{ kind: 'joined', seat: 'O' }])

      const game = await Game.findOne({ _id: result.room.gameId }).lean()
      expect(game?.players).toStrictEqual({ X: owner.userId, O: joiner.userId })
      expect(game?.participants).toStrictEqual(
        deriveParticipants({ X: owner.userId, O: joiner.userId }),
      )
      expect(game?.pairKey).toBe(buildPairKey(owner.userId, joiner.userId))
      expect(game?.finishedAt).toBeNull()
    },
  )

  it('ROOM_FULL: her iki koltuk da BAŞKA kullanıcılarla doluyken üçüncü bir userId katılamaz', async () => {
    const code = freshCode()
    const x = seat()
    const o = seat()
    await Room.create({ code, state: 'playing', seats: { X: x, O: o }, version: 2 })

    const result = await joinRoom(code, seat(), 'conn-yeni')
    expect(result).toEqual({ ok: false, code: 'ROOM_FULL' })
  })

  it('AC3: aynı userId oda DOLU olsa bile yeniden bağlanır — ROOM_FULL DÖNMEZ', async () => {
    const code = freshCode()
    const x = seat()
    const o = seat()
    await Room.create({
      code,
      state: 'playing',
      seats: { X: x, O: o },
      presence: { X: { connId: 'old-x-conn', since: new Date() }, O: null },
      version: 4,
    })

    const result = await joinRoom(code, x, 'new-x-conn')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.presence.X).toMatchObject({ connId: 'new-x-conn' })
    expect(result.room.version).toBe(5)
    expect(result.events).toEqual([{ kind: 'reconnected', seat: 'X' }])
  })

  it("dönen oyuncunun grace'i temizlenir: disconnected.seat===seat ise null yazılır (§5.4)", async () => {
    const code = freshCode()
    const x = seat()
    const o = seat()
    const now = new Date()
    await Room.create({
      code,
      state: 'playing',
      seats: { X: x, O: o },
      presence: { X: { connId: 'x-conn', since: now }, O: null },
      disconnected: { seat: 'O', at: now, graceEndsAt: now },
      version: 6,
    })

    const result = await joinRoom(code, o, 'o-yeni-conn')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.disconnected).toBeNull()
    expect(result.room.presence.O).toMatchObject({ connId: 'o-yeni-conn' })
  })

  it('her iki koltuk da boşken yalnız çağıranın koltuğu doldurulur, oyun BAŞLAMAZ (savunmacı dal)', async () => {
    const code = freshCode()
    await Room.create({ code, seats: { X: null, O: null }, version: 1 })

    const joiner = seat()
    const result = await joinRoom(code, joiner, 'conn-1')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.seats.X).toMatchObject({ userId: joiner.userId })
    expect(result.room.seats.O).toBeNull()
    expect(result.room.state).toBe('waiting')
    expect(result.room.gameId).toBeNull()
  })

  it(
    'eşzamanlılık sondası: iki FARKLI kullanıcı AYNI ANDA O koltuğuna katılırsa ' +
      'yalnız biri kazanır, diğeri ROOM_FULL alır (CAS)',
    async () => {
      const code = freshCode()
      const owner = seat()
      await Room.create({ code, seats: { X: owner, O: null }, version: 1 })

      const [a, b] = await Promise.all([
        joinRoom(code, seat(), 'conn-a'),
        joinRoom(code, seat(), 'conn-b'),
      ])

      for (const outcome of [a, b]) {
        if (outcome.ok && outcome.room.gameId !== null) createdGameIds.push(outcome.room.gameId)
      }

      const succeeded = [a, b].filter((r) => r.ok)
      const failed = [a, b].filter((r) => !r.ok)
      expect(succeeded).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect(failed[0]).toEqual({ ok: false, code: 'ROOM_FULL' })
    },
  )

  describe('yazma amplifikasyonu kapısı (güvenlik denetimi HIGH)', () => {
    it('AYNI connId ile tekrarlanan join HİÇ yazma yapmaz — version SABİT kalır', async () => {
      const code = freshCode()
      const x = seat()
      await Room.create({
        code,
        state: 'playing',
        seats: { X: x, O: seat() },
        presence: { X: { connId: 'ayni-conn', since: new Date() }, O: null },
        version: 12,
      })

      // 10 kez üst üste: kısa devre yoksa version 12 -> 22 olurdu ve her adım
      // bir change stream olayı + odadaki her bağlantıya tam `state` üretirdi.
      for (let i = 0; i < 10; i += 1) {
        const result = await joinRoom(code, x, 'ayni-conn')
        expect(result.ok).toBe(true)
      }

      const after = await Room.findOne({ code }).lean()
      // Çıplak sayı bilerek (sabitten türetilmiş beklenti bu dalı göremez).
      expect(after?.version).toBe(12)
      expect(after?.presence.X?.connId).toBe('ayni-conn')
    })

    it('FARKLI connId hâlâ yazar — takeover kısa devreye takılmaz', async () => {
      const code = freshCode()
      const x = seat()
      await Room.create({
        code,
        state: 'playing',
        seats: { X: x, O: seat() },
        presence: { X: { connId: 'eski-conn', since: new Date() }, O: null },
        version: 12,
      })

      const result = await joinRoom(code, x, 'yeni-conn')
      expect(result.ok).toBe(true)

      const after = await Room.findOne({ code }).lean()
      expect(after?.version).toBe(13)
      expect(after?.presence.X?.connId).toBe('yeni-conn')
    })

    it('aynı connId olsa BİLE grace temizlenecekse YAZAR (opponent:returned kaybolmasın)', async () => {
      const code = freshCode()
      const x = seat()
      const now = new Date()
      await Room.create({
        code,
        state: 'playing',
        seats: { X: x, O: seat() },
        presence: { X: { connId: 'ayni-conn', since: now }, O: null },
        disconnected: { seat: 'X', at: now, graceEndsAt: new Date(now.getTime() + 30_000) },
        version: 12,
      })

      const result = await joinRoom(code, x, 'ayni-conn')
      expect(result.ok).toBe(true)

      const after = await Room.findOne({ code }).lean()
      expect(after?.version).toBe(13)
      expect(after?.disconnected).toBeNull()
    })
  })

  it('waiting durumunda kurucu dönerse oda waiting kalır, oyun BAŞLAMAZ (§4)', async () => {
    const code = freshCode()
    const x = seat()
    await Room.create({
      code,
      state: 'waiting',
      seats: { X: x, O: null },
      presence: { X: null, O: null },
      version: 1,
    })

    const result = await joinRoom(code, x, 'x-yeniden')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.state).toBe('waiting')
    expect(result.room.seats.O).toBeNull()
    expect(result.room.gameId).toBeNull()
  })
})
