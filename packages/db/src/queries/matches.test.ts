import { randomUUID } from 'node:crypto'
import { HISTORY_PAGE_SIZE } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { buildPairKey, deriveParticipants } from '../pair'
import { Game } from '../models/game'
import { User } from '../models/user'
import { getMatchHistory } from './matches'

describe('getMatchHistory (gerçek xox_test)', () => {
  const createdUserIds: string[] = []
  const createdGameIds: string[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
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

  async function createUser(name: string): Promise<string> {
    const id = randomUUID()
    createdUserIds.push(id)
    await User.create({ _id: id, name, email: `${id}@xox.test`, passwordHash: 'x' })
    return id
  }

  interface GameOptions {
    players: { X: string; O: string }
    winner?: 'X' | 'O' | null
    isDraw?: boolean
    endReason?: 'line' | 'resign' | 'timeout' | 'abandon' | null
    rated?: boolean
    eloDelta?: { X: number; O: number }
    finishedAt?: Date | null
    finishedAtOffsetMs?: number
  }

  async function createGame(options: GameOptions): Promise<string> {
    const id = randomUUID()
    createdGameIds.push(id)
    const finishedAt =
      options.finishedAt !== undefined
        ? options.finishedAt
        : new Date(Date.now() + (options.finishedAtOffsetMs ?? 0))
    await Game.create({
      _id: id,
      roomCode: `RC${randomUUID().slice(0, 6).toUpperCase()}`,
      players: options.players,
      participants: deriveParticipants(options.players),
      pairKey: buildPairKey(options.players.X, options.players.O),
      winner: options.winner ?? null,
      isDraw: options.isDraw ?? false,
      endReason: options.endReason ?? null,
      // `endReason:'line'` iken `models/game.ts`'in pre('validate') hook'u
      // `winLine`in dolu olmasını ZORUNLU kılar (§3.3 çapraz tutarlılık).
      winLine: options.endReason === 'line' ? [0, 1, 2] : null,
      rated: options.rated ?? false,
      eloDelta: options.eloDelta ?? { X: 0, O: 0 },
      finishedAt,
    })
    return id
  }

  it('KK-117: sorgu şekli find({participants,finishedAt:{$ne:null}}).sort({finishedAt:-1}).limit(N) — COLLSCAN YOK', async () => {
    // Üretim kodunun (`getMatchHistory`) KULLANDIĞI TAM sorgu şekli —
    // `games`'in `{participants:1, finishedAt:-1}` bileşik indeksiyle
    // (`models/game.ts`) BİREBİR eşleşiyor; plan veri hacminden BAĞIMSIZ
    // (sorgu şekline bakar, veriye değil).
    const plan = await Game.find(
      { participants: 'sonda-kullanici', finishedAt: { $ne: null } },
      'players',
    )
      .sort({ finishedAt: -1 })
      .limit(HISTORY_PAGE_SIZE)
      .explain('executionStats')

    const planText = JSON.stringify(plan)
    expect(planText).not.toContain('COLLSCAN')
  })

  it('KK-116: bitmiş oyunları en yeniden en eskiye sıralar', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    const older = await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
      finishedAtOffsetMs: -60_000,
    })
    const newer = await createGame({
      players: { X: rakip, O: me },
      winner: 'X',
      endReason: 'resign',
      finishedAtOffsetMs: -1_000,
    })

    const matches = await getMatchHistory(me)

    expect(matches.map((m) => m.gameId)).toStrictEqual([newer, older])
  })

  it('KK-116: rakip adı, sonuç (galibiyet/mağlubiyet/beraberlik) doğru hesaplanır', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    const wonGameId = await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
    })
    const lostGameId = await createGame({
      players: { X: rakip, O: me },
      winner: 'X',
      endReason: 'resign',
      finishedAtOffsetMs: -1_000,
    })
    const drawGameId = await createGame({
      players: { X: me, O: rakip },
      isDraw: true,
      endReason: null,
      finishedAtOffsetMs: -2_000,
    })

    const matches = await getMatchHistory(me)
    const byId = new Map(matches.map((m) => [m.gameId, m]))

    expect(byId.get(wonGameId)?.result).toBe('win')
    expect(byId.get(wonGameId)?.opponent).toStrictEqual({ userId: rakip, name: 'Rakip' })
    expect(byId.get(lostGameId)?.result).toBe('loss')
    expect(byId.get(drawGameId)?.result).toBe('draw')
  })

  it('endReason "timeout" ve "abandon" DOĞRU taşınır — bilinmeyen sonuca düşmez', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    const timeoutGameId = await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'timeout',
    })
    const abandonGameId = await createGame({
      players: { X: rakip, O: me },
      winner: 'X',
      endReason: 'abandon',
      finishedAtOffsetMs: -1_000,
    })

    const matches = await getMatchHistory(me)
    const byId = new Map(matches.map((m) => [m.gameId, m]))

    expect(byId.get(timeoutGameId)?.endReason).toBe('timeout')
    expect(byId.get(timeoutGameId)?.result).toBe('win')
    expect(byId.get(abandonGameId)?.endReason).toBe('abandon')
    expect(byId.get(abandonGameId)?.result).toBe('loss')
  })

  it('puanlı oyunda eloDelta KENDİ koltuğundan okunur; puansızda null döner', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    const ratedGameId = await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
      rated: true,
      eloDelta: { X: 12, O: -12 },
    })
    const unratedGameId = await createGame({
      players: { X: me, O: rakip },
      winner: 'O',
      endReason: 'resign',
      rated: false,
      eloDelta: { X: 0, O: 0 },
      finishedAtOffsetMs: -1_000,
    })

    const matches = await getMatchHistory(me)
    const byId = new Map(matches.map((m) => [m.gameId, m]))

    expect(byId.get(ratedGameId)?.eloDelta).toBe(12)
    expect(byId.get(ratedGameId)?.rated).toBe(true)
    expect(byId.get(unratedGameId)?.eloDelta).toBeNull()
    expect(byId.get(unratedGameId)?.rated).toBe(false)
  })

  it('KK-077 regresyonu: finishedAt:null (sürmekte olan) oyun listede HİÇ görünmez', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    const finished = await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
    })
    // Sürmekte olan oyun: finishedAt=null (games şemasının varsayılanı).
    await createGame({ players: { X: me, O: rakip }, finishedAt: null })

    const matches = await getMatchHistory(me)

    expect(matches.map((m) => m.gameId)).toStrictEqual([finished])
  })

  it('katılımcı OLMAYAN bir kullanıcının oyunu listesinde görünmez', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    const yabanci = await createUser('Yabancı')
    await createGame({ players: { X: rakip, O: yabanci }, winner: 'X', endReason: 'line' })

    const matches = await getMatchHistory(me)

    expect(matches).toStrictEqual([])
  })

  it('limit parametresi çıplak sayı: limit(2) TAM 2 satır döner', async () => {
    const me = await createUser('Ben')
    const rakip = await createUser('Rakip')
    await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
      finishedAtOffsetMs: -1,
    })
    await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
      finishedAtOffsetMs: -2,
    })
    await createGame({
      players: { X: me, O: rakip },
      winner: 'X',
      endReason: 'line',
      finishedAtOffsetMs: -3,
    })

    const matches = await getMatchHistory(me, 2)

    expect(matches).toHaveLength(2)
  })

  it('hiç bitmiş oyunu olmayan kullanıcı için boş dizi döner (istisna fırlatmaz)', async () => {
    const me = await createUser('Ben')

    await expect(getMatchHistory(me)).resolves.toStrictEqual([])
  })
})
