import { randomUUID } from 'node:crypto'
import { MOVE_TIMEOUT_SECONDS, REMATCH_OFFER_TTL_SECONDS } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Game } from '../models/game'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'
import { User } from '../models/user'
import { buildPairKey, deriveParticipants } from '../pair'
import { generateRoomCode } from '../room-code'
import { acceptRematch, offerRematch } from './rematch'

const createdCodes: string[] = []
const createdGameIds: string[] = []
const createdUserIds: string[] = []

async function makeUser(name: string): Promise<string> {
  const id = randomUUID()
  await User.create({ _id: id, name, email: `${id}@xox.test`, passwordHash: 'x' })
  createdUserIds.push(id)
  return id
}

interface Finished {
  code: string
  xId: string
  oId: string
  oldGameId: string
}

/** X kazanmış, `finished` durumda bir oda — rövanşın başlangıç zemini. */
async function finishedRoom(
  options: {
    version?: number
    rematch?: RoomDoc['rematch']
    size?: number
    winLength?: number
    board?: RoomDoc['board']
  } = {},
) {
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
    winner: 'X',
    endReason: 'line',
    winLine: [0, 1, 2],
    finishedAt: new Date(),
    settledAt: new Date(),
  })
  createdGameIds.push(game._id)
  await Room.create({
    code,
    state: 'finished',
    size: options.size,
    winLength: options.winLength,
    seats: { X: { userId: xId, name: 'Ada' }, O: { userId: oId, name: 'Kaan' } },
    presence: {
      X: { connId: 'conn-ada', since: new Date() },
      O: { connId: 'conn-kaan', since: new Date() },
    },
    board: options.board ?? ['X', 'X', 'X', 'O', 'O', null, null, null, null],
    moves: [
      { index: 0, by: 'X', at: new Date() },
      { index: 3, by: 'O', at: new Date() },
      { index: 1, by: 'X', at: new Date() },
      { index: 4, by: 'O', at: new Date() },
      { index: 2, by: 'X', at: new Date() },
    ],
    result: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
    rematch: options.rematch ?? null,
    gameId: game._id,
    version: options.version ?? 30,
    startedAt: new Date(),
  })
  const finished: Finished = { code, xId, oId, oldGameId: game._id }
  return finished
}

async function readRoom(code: string): Promise<RoomDoc> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) throw new Error(`oda bulunamadı: ${code}`)
  return room
}

describe('offerRematch / acceptRematch — KK-055…058 (spec §3.8)', () => {
  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      const rooms = await Room.find({ code: { $in: createdCodes } }).lean()
      for (const room of rooms) if (room.gameId !== null) createdGameIds.push(room.gameId)
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

  it('olmayan oda ROOM_NOT_FOUND döner (iki uç da fırlatmaz)', async () => {
    await expect(offerRematch('ZZZZZZ', 'kimse')).resolves.toStrictEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    })
    await expect(acceptRematch('ZZZZZZ', 'kimse')).resolves.toStrictEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    })
  })

  it('koltuğu olmayan kullanıcı ROOM_FULL alır', async () => {
    const f = await finishedRoom()
    await expect(offerRematch(f.code, 'yabanci')).resolves.toStrictEqual({
      ok: false,
      code: 'ROOM_FULL',
    })
  })

  it('oyun sürerken rövanş teklifi INVALID_MESSAGE ile reddedilir', async () => {
    const f = await finishedRoom()
    await Room.updateOne({ code: f.code }, { $set: { state: 'playing' } })

    await expect(offerRematch(f.code, f.xId)).resolves.toStrictEqual({
      ok: false,
      code: 'INVALID_MESSAGE',
    })
  })

  it('teklif oda dokümanına {by, expiresAt} olarak yazılır ve version 1 artar', async () => {
    const f = await finishedRoom({ version: 30 })
    const before = Date.now()

    const result = await offerRematch(f.code, f.oId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
    expect(result.events).toStrictEqual([{ kind: 'rematch-offered', by: 'O' }])
    expect(result.room.version).toBe(31)

    const room = await readRoom(f.code)
    expect(room.rematch?.by).toBe('O')
    const ttlMs = (room.rematch?.expiresAt.getTime() ?? 0) - before
    // Çıplak sayı bilerek: 60 sn (REMATCH_OFFER_TTL_SECONDS) — sabitten
    // türetilmiş beklenti, sabit değişince kör kalırdı.
    expect(ttlMs).toBeGreaterThan(55_000)
    expect(ttlMs).toBeLessThanOrEqual(60_000 + 5_000)
    expect(REMATCH_OFFER_TTL_SECONDS).toBe(60)
  })

  it('aynı oyuncu teklifini TEKRARLARSA ikinci çağrı hiçbir şey yazmaz', async () => {
    const f = await finishedRoom({ version: 30 })

    await offerRematch(f.code, f.xId)
    const second = await offerRematch(f.code, f.xId)

    expect(second.ok).toBe(true)
    expect((await readRoom(f.code)).version).toBe(31)
  })

  it('KARŞILIKLI teklif = mutabakat: ikinci rematch:offer doğrudan yeni oyunu başlatır', async () => {
    const f = await finishedRoom({ version: 30 })

    await offerRematch(f.code, f.xId)
    const result = await offerRematch(f.code, f.oId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
    expect(result.events).toStrictEqual([{ kind: 'rematch-accepted' }])
    expect(result.room.state).toBe('playing')
    expect(result.room.seats.X?.userId).toBe(f.oId)
    expect(result.room.seats.O?.userId).toBe(f.xId)
  })

  it('kabul: tahta boşalır, moves boşalır, yeni gameId açılır, state playing olur', async () => {
    const f = await finishedRoom({ version: 30 })
    await offerRematch(f.code, f.xId)

    const result = await acceptRematch(f.code, f.oId)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
    expect(result.room.state).toBe('playing')
    expect(result.room.board).toStrictEqual([null, null, null, null, null, null, null, null, null])
    expect(result.room.moves).toStrictEqual([])
    expect(result.room.result).toBeNull()
    expect(result.room.rematch).toBeNull()
    expect(result.room.gameId).not.toBe(f.oldGameId)
    expect(result.room.gameId).not.toBeNull()
    expect(result.events).toStrictEqual([{ kind: 'rematch-accepted' }])
  })

  it('KOLTUKLAR TAKAS EDİLİR: önce X olan artık O (KK-058)', async () => {
    const f = await finishedRoom()
    await offerRematch(f.code, f.xId)

    await acceptRematch(f.code, f.oId)

    const room = await readRoom(f.code)
    expect(room.seats.X).toMatchObject({ userId: f.oId, name: 'Kaan' })
    expect(room.seats.O).toMatchObject({ userId: f.xId, name: 'Ada' })
  })

  it('presence de koltukla BİRLİKTE taşınır — bağlantı kendi koltuğunu kaybetmez', async () => {
    const f = await finishedRoom()
    await offerRematch(f.code, f.xId)

    await acceptRematch(f.code, f.oId)

    const room = await readRoom(f.code)
    // Ada (eski X, conn-ada) artık O koltuğunda; presence.O onun bağlantısı
    // olmalı. Aksi hâlde canlı katman `detectTakeover` ile 4409 atardı.
    expect(room.presence.O?.connId).toBe('conn-ada')
    expect(room.presence.X?.connId).toBe('conn-kaan')
  })

  it('yeni oyun koltuk takasını `games.players` alanına da yansıtır', async () => {
    const f = await finishedRoom()
    await offerRematch(f.code, f.xId)

    await acceptRematch(f.code, f.oId)

    const room = await readRoom(f.code)
    const game = await Game.findById(room.gameId).lean()
    expect(game?.players).toStrictEqual({ X: f.oId, O: f.xId })
    expect(game?.finishedAt).toBeNull()
    expect(game?.pairKey).toBe(buildPairKey(f.xId, f.oId))
  })

  it('version rövanşta SIFIRLANMAZ — monotonik artmaya devam eder (KK-058)', async () => {
    const f = await finishedRoom({ version: 30 })

    await offerRematch(f.code, f.xId)
    await acceptRematch(f.code, f.oId)

    // Çıplak sayılar: 30 → teklif 31 → kabul 32.
    const room = await readRoom(f.code)
    expect(room.version).toBe(32)
  })

  it('eski oyunun sonucu rövanştan ETKİLENMEZ', async () => {
    const f = await finishedRoom()
    await offerRematch(f.code, f.xId)
    await acceptRematch(f.code, f.oId)

    const old = await Game.findById(f.oldGameId).lean()
    expect(old?.winner).toBe('X')
    expect(old?.finishedAt).toBeInstanceOf(Date)
  })

  it('teklif yokken kabul REMATCH_EXPIRED alır', async () => {
    const f = await finishedRoom()

    await expect(acceptRematch(f.code, f.oId)).resolves.toStrictEqual({
      ok: false,
      code: 'REMATCH_EXPIRED',
    })
  })

  it('TEMBEL düşme: süresi geçmiş teklif için rematch:null YAZILIR ve accept REMATCH_EXPIRED alır', async () => {
    const f = await finishedRoom({
      version: 30,
      rematch: { by: 'X', expiresAt: new Date(Date.now() - 1_000) },
    })

    const result = await acceptRematch(f.code, f.oId)

    expect(result).toStrictEqual({ ok: false, code: 'REMATCH_EXPIRED' })
    const room = await readRoom(f.code)
    expect(room.rematch).toBeNull()
    // Düşme bir YAZMADIR: karşı taraf bunu change stream'den öğrenir.
    expect(room.version).toBe(31)
    expect(room.state).toBe('finished')
  })

  it('süresi geçmiş teklifin üzerine YENİ teklif verilebilir', async () => {
    const f = await finishedRoom({
      version: 30,
      rematch: { by: 'X', expiresAt: new Date(Date.now() - 1_000) },
    })

    const result = await offerRematch(f.code, f.oId)

    expect(result.ok).toBe(true)
    const room = await readRoom(f.code)
    expect(room.rematch?.by).toBe('O')
    expect(room.rematch?.expiresAt.getTime()).toBeGreaterThan(Date.now())
    // 30 → düşme 31 → yeni teklif 32.
    expect(room.version).toBe(32)
  })

  it('süresi geçmiş kendi teklifi mutabakat SAYILMAZ — yeni oyun başlamaz', async () => {
    const f = await finishedRoom({
      version: 30,
      rematch: { by: 'X', expiresAt: new Date(Date.now() - 1_000) },
    })

    await offerRematch(f.code, f.oId)

    expect((await readRoom(f.code)).state).toBe('finished')
  })

  it(
    'CORE-CFG-001 borcu kapandı: rövanş tahtayı odanın KENDİ konfigürasyonundan ' +
      'sıfırlar — 11×11 odada 9 hücrelik yerel EMPTY_BOARD DEĞİL, 121 hücre',
    async () => {
      const f = await finishedRoom({
        version: 30,
        size: 11,
        winLength: 5,
        board: Array.from({ length: 121 }, () => 'X'),
      })
      await offerRematch(f.code, f.xId)

      const result = await acceptRematch(f.code, f.oId)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
      expect(result.room.board).toHaveLength(121)
      expect(result.room.board.every((cell) => cell === null)).toBe(true)
      // size/winLength DEĞİŞMEZ (ADR-0014 §4) — rövanş yalnız tahtayı temizler.
      expect(result.room.size).toBe(11)
      expect(result.room.winLength).toBe(5)
    },
  )

  it(
    'W2-01 DEVRİ KAPANDI: rövanşın İLK hamlesi artık SÜRESİZ DEĞİL — kabul ' +
      'sonrası turnDeadline nowMs + MOVE_TIMEOUT_SECONDS olarak yazılır',
    async () => {
      const f = await finishedRoom({ version: 30 })
      const nowMs = 1_800_000_000_000
      await offerRematch(f.code, f.xId, nowMs)

      const result = await acceptRematch(f.code, f.oId, nowMs)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
      expect(result.room.turnDeadline).not.toBeNull()
      // Çıplak sayı bilerek: `joinRoom`daki AYNI hesap — sabitten türetilmiş
      // tek bir beklenti bu kaymayı fark etmezdi.
      expect(result.room.turnDeadline?.getTime()).toBe(nowMs + MOVE_TIMEOUT_SECONDS * 1_000)

      const room = await readRoom(f.code)
      expect(room.turnDeadline?.getTime()).toBe(nowMs + MOVE_TIMEOUT_SECONDS * 1_000)
    },
  )

  it(
    'KARŞILIKLI teklif yoluyla başlayan rövanşta da turnDeadline kurulur ' +
      '(startRematch iki çağrı yerinden de aynı davranır)',
    async () => {
      const f = await finishedRoom({ version: 30 })
      const nowMs = 1_900_000_000_000
      await offerRematch(f.code, f.xId, nowMs)

      const result = await offerRematch(f.code, f.oId, nowMs)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`beklenmeyen red: ${result.code}`)
      expect(result.room.turnDeadline?.getTime()).toBe(nowMs + MOVE_TIMEOUT_SECONDS * 1_000)
    },
  )

  it('kendi teklifini kabul etmek hiçbir şey yazmaz (oyun başlamaz)', async () => {
    const f = await finishedRoom({ version: 30 })
    await offerRematch(f.code, f.xId)

    const result = await acceptRematch(f.code, f.xId)

    expect(result.ok).toBe(true)
    const room = await readRoom(f.code)
    expect(room.state).toBe('finished')
    expect(room.version).toBe(31)
    expect(room.rematch?.by).toBe('X')
  })
})
