import { randomUUID } from 'node:crypto'
import type { TransportStatus } from '@xox/shared'
import {
  ELO_MIN_MOVES,
  ELO_PAIR_MAX_RATED,
  ELO_PAIR_WINDOW_HOURS,
  ELO_START,
  forfeitStatus,
} from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { eloDelta } from '../elo'
import { Game } from '../models/game'
import type { GameDoc } from '../models/game'
import type { RoomDoc, RoomMove } from '../models/room'
import { User } from '../models/user'
import type { UserDoc } from '../models/user'
import { buildPairKey, deriveParticipants } from '../pair'
import { finishGame } from './finish'

const CODE = 'FIN001'

interface Fixture {
  gameId: string
  xId: string
  oId: string
  room: RoomDoc
}

const createdUserIds: string[] = []
const createdGameIds: string[] = []

async function makeUser(): Promise<string> {
  const id = randomUUID()
  await User.create({
    _id: id,
    name: 'Oyuncu',
    email: `${id}@xox.test`,
    passwordHash: 'x',
  })
  createdUserIds.push(id)
  return id
}

/** `X` üç hamle, `O` iki hamle oynamış bir tahta — hamle sayısı 5. */
const BOARD = ['X', 'O', 'X', 'O', 'X', null, null, null, null] as RoomDoc['board']
const MOVES: RoomMove[] = [
  { index: 0, by: 'X', at: new Date(1_700_000_000_000) },
  { index: 1, by: 'O', at: new Date(1_700_000_001_000) },
  { index: 2, by: 'X', at: new Date(1_700_000_002_000) },
  { index: 3, by: 'O', at: new Date(1_700_000_003_000) },
  { index: 4, by: 'X', at: new Date(1_700_000_004_000) },
]

function roomFor(
  gameId: string | null,
  xId: string,
  oId: string,
  moves: RoomMove[] = MOVES,
): RoomDoc {
  const now = new Date()
  return {
    code: CODE,
    state: 'finished',
    seats: { X: { userId: xId, name: 'Ada' }, O: { userId: oId, name: 'Kaan' } },
    presence: { X: null, O: null },
    board: [...BOARD],
    moves: moves.map((m) => ({ ...m })),
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    result: null,
    lastEmoji: null,
    gameId,
    version: 12,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

async function fixture(options: { moves?: RoomMove[] } = {}): Promise<Fixture> {
  const xId = await makeUser()
  const oId = await makeUser()
  const players = { X: xId, O: oId }
  const game = await Game.create({
    roomCode: CODE,
    players,
    participants: deriveParticipants(players),
    pairKey: buildPairKey(xId, oId),
  })
  createdGameIds.push(game._id)
  return { gameId: game._id, xId, oId, room: roomFor(game._id, xId, oId, options.moves) }
}

async function readUsers(ids: string[]): Promise<Record<string, UserDoc>> {
  const docs = await User.find({ _id: { $in: ids } }).lean()
  const out: Record<string, UserDoc> = {}
  for (const doc of docs) out[doc._id] = doc
  return out
}

async function readGame(id: string): Promise<GameDoc> {
  const doc = await Game.findById(id).lean()
  if (doc === null) throw new Error(`oyun bulunamadı: ${id}`)
  return doc
}

/**
 * İki `users` anlık görüntüsü arasındaki ALAN FARKI. Kriter 2 "doküman farkını
 * karşılaştırır" diyor: sayaç çağrısını mock'layıp "iki kez çağrılmadı" demek
 * bu kriteri karşılamaz — gerçek `xox_test`'e yazıp dokümanı OKUYORUZ.
 */
function docDiff(
  before: Record<string, UserDoc>,
  after: Record<string, UserDoc>,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {}
  for (const [id, a] of Object.entries(before)) {
    const b = after[id]
    if (b === undefined) {
      diff[id] = 'SİLİNDİ'
      continue
    }
    const fields: Record<string, unknown> = {}
    for (const key of Object.keys(a) as (keyof UserDoc)[]) {
      const left = JSON.stringify(a[key])
      const right = JSON.stringify(b[key])
      if (left !== right) fields[key] = { önce: a[key], sonra: b[key] }
    }
    if (Object.keys(fields).length > 0) diff[id] = fields
  }
  return diff
}

describe('finishGame — games CAS + stats (KK-052/053, tasarım §9)', () => {
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

  it('kazanan çizgiyle biten oyunu games dokümanına TAM yazar ve settledAt damgalar', async () => {
    const f = await fixture()
    const status: TransportStatus = {
      kind: 'won',
      winner: 'X',
      line: [0, 2, 4],
      reason: 'line',
    }

    await finishGame(f.room, status)

    const game = await readGame(f.gameId)
    expect(game.finishedAt).toBeInstanceOf(Date)
    expect(game.settledAt).toBeInstanceOf(Date)
    expect(game.winner).toBe('X')
    expect(game.isDraw).toBe(false)
    expect(game.endReason).toBe('line')
    expect(game.winLine).toStrictEqual([0, 2, 4])
    expect(game.board).toStrictEqual(['X', 'O', 'X', 'O', 'X', null, null, null, null])
    // Çıplak sayı bilerek: oynanan hamle sayısı kadar öğe (kriter 3).
    expect(game.moves).toHaveLength(5)
    expect(game.moves.map((m) => m.index)).toStrictEqual([0, 1, 2, 3, 4])
    expect(game.moves.map((m) => m.by)).toStrictEqual(['X', 'O', 'X', 'O', 'X'])
    // ADR-0014 §5/KK-B34: yazılır ama HİÇBİR API okumaz — ileriye dönük alan.
    expect(game.size).toBe(3)
    expect(game.winLength).toBe(3)
  })

  it('kazananın wins, kaybedenin losses alanı TAM 1 artar; draws hiç artmaz', async () => {
    const f = await fixture()

    await finishGame(f.room, { kind: 'won', winner: 'O', line: null, reason: 'resign' })

    const users = await readUsers([f.xId, f.oId])
    expect(users[f.oId]?.stats).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    expect(users[f.xId]?.stats).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
  })

  it('beraberlikte İKİ tarafın draws alanı da TAM 1 artar', async () => {
    const f = await fixture()

    await finishGame(f.room, { kind: 'draw' })

    const users = await readUsers([f.xId, f.oId])
    expect(users[f.xId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 1 })
    expect(users[f.oId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 1 })
  })

  it('pes sonucu winLine=null + endReason=resign ile yazılır (ADR-0001)', async () => {
    const f = await fixture()

    await finishGame(f.room, forfeitStatus('O', 'resign'))

    const game = await readGame(f.gameId)
    expect(game.winner).toBe('O')
    expect(game.winLine).toBeNull()
    expect(game.endReason).toBe('resign')
    expect(game.isDraw).toBe(false)
  })

  it('İDEMPOTANS (KK-053): aynı gameId ikinci kez işlendiğinde users dokümanı DEĞİŞMEZ', async () => {
    const f = await fixture()
    const status: TransportStatus = { kind: 'won', winner: 'X', line: [0, 2, 4], reason: 'line' }

    await finishGame(f.room, status)
    const afterFirst = await readUsers([f.xId, f.oId])
    const gameAfterFirst = await readGame(f.gameId)

    // İkinci işleme: farklı bir SONUÇLA bile gelse CAS kaybeder ve hiçbir şey
    // yapmaz — yoksa geç düşen bir yankı kazananı değiştirebilirdi.
    await finishGame(f.room, { kind: 'draw' })
    const afterSecond = await readUsers([f.xId, f.oId])
    const gameAfterSecond = await readGame(f.gameId)

    expect(docDiff(afterFirst, afterSecond)).toStrictEqual({})
    expect(afterSecond[f.xId]?.stats).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    expect(afterSecond[f.oId]?.stats).toStrictEqual({ wins: 0, losses: 1, draws: 0 })

    // Oyun dokümanı da dokunulmamış olmalı: sonuç, finishedAt ve settledAt aynı.
    expect(gameAfterSecond.winner).toBe('X')
    expect(gameAfterSecond.isDraw).toBe(false)
    expect(gameAfterSecond.finishedAt?.getTime()).toBe(gameAfterFirst.finishedAt?.getTime())
    expect(gameAfterSecond.settledAt?.getTime()).toBe(gameAfterFirst.settledAt?.getTime())
  })

  it('ÜÇ ardışık çağrıdan sonra da sayaçlar tam 1 kalır', async () => {
    const f = await fixture()
    const status: TransportStatus = { kind: 'draw' }

    await finishGame(f.room, status)
    await finishGame(f.room, status)
    await finishGame(f.room, status)

    const users = await readUsers([f.xId, f.oId])
    expect(users[f.xId]?.stats.draws).toBe(1)
    expect(users[f.oId]?.stats.draws).toBe(1)
  })

  it('gameId yoksa hiçbir yazma yapmaz (oyun hiç başlamamış oda)', async () => {
    const xId = await makeUser()
    const oId = await makeUser()

    await finishGame(roomFor(null, xId, oId), { kind: 'draw' })

    const users = await readUsers([xId, oId])
    expect(users[xId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
    expect(users[oId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
  })

  it('status hâlâ playing ise hiçbir şey yazmaz — biten oyun yok', async () => {
    const f = await fixture()

    await finishGame(f.room, { kind: 'playing', turn: 'O' })

    const game = await readGame(f.gameId)
    expect(game.finishedAt).toBeNull()
    expect(game.settledAt).toBeNull()
    const users = await readUsers([f.xId, f.oId])
    expect(users[f.xId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
  })

  it('oyun BAŞKASI tarafından bitirilmişse sayaçlara dokunmaz (CAS kaybı)', async () => {
    const f = await fixture()
    // Yarışın diğer tarafı: `finishedAt` zaten yazılmış.
    await Game.updateOne(
      { _id: f.gameId },
      { $set: { finishedAt: new Date(), winner: 'O', endReason: 'resign' } },
    )

    await finishGame(f.room, { kind: 'won', winner: 'X', line: [0, 2, 4], reason: 'line' })

    const game = await readGame(f.gameId)
    expect(game.winner).toBe('O')
    expect(game.settledAt).toBeNull()
    const users = await readUsers([f.xId, f.oId])
    expect(users[f.xId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
    expect(users[f.oId]?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
  })
})

describe('finishGame — ELO (KK-110…114, tasarım §9, W3-01)', () => {
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

  it('KK-110: her iki taraf da başlangıç ELO_START ile puanlı bir maçta eloDelta ile eşleşir', async () => {
    const f = await fixture()
    const status: TransportStatus = { kind: 'won', winner: 'X', line: [0, 2, 4], reason: 'line' }

    await finishGame(f.room, status)

    const game = await readGame(f.gameId)
    expect(game.rated).toBe(true)
    const expectedX = eloDelta(ELO_START, ELO_START, 1)
    const expectedO = eloDelta(ELO_START, ELO_START, 0)
    // Çıplak sayı bilerek: eşit puanda K=24 formülü tam +12/-12 üretir.
    expect(expectedX).toBe(12)
    expect(expectedO).toBe(-12)
    expect(game.eloDelta).toStrictEqual({ X: expectedX, O: expectedO })

    const users = await readUsers([f.xId, f.oId])
    expect(users[f.xId]?.elo).toBe(ELO_START + expectedX)
    expect(users[f.oId]?.elo).toBe(ELO_START + expectedO)
    expect(users[f.xId]?.ratedGames).toBe(1)
    expect(users[f.oId]?.ratedGames).toBe(1)
  })

  it('KK-111: eşit puanlı BERABERLİKTE eloDelta tam 0, ratedGames yine de 1 artar', async () => {
    const f = await fixture()

    await finishGame(f.room, { kind: 'draw' })

    const game = await readGame(f.gameId)
    expect(game.rated).toBe(true)
    expect(game.eloDelta).toStrictEqual({ X: 0, O: 0 })
    const users = await readUsers([f.xId, f.oId])
    expect(users[f.xId]?.elo).toBe(ELO_START)
    expect(users[f.oId]?.elo).toBe(ELO_START)
    expect(users[f.xId]?.ratedGames).toBe(1)
    expect(users[f.oId]?.ratedGames).toBe(1)
  })

  it(
    `KK-112: toplam hamle ELO_MIN_MOVES(${String(ELO_MIN_MOVES)})'tan AZ ise puansız — ` +
      'stats yine artar, ELO ve ratedGames DEĞİŞMEZ',
    async () => {
      const shortMoves: RoomMove[] = MOVES.slice(0, ELO_MIN_MOVES - 1)
      const f = await fixture({ moves: shortMoves })

      await finishGame(f.room, { kind: 'won', winner: 'X', line: null, reason: 'resign' })

      const game = await readGame(f.gameId)
      expect(game.rated).toBe(false)
      expect(game.eloDelta).toStrictEqual({ X: 0, O: 0 })
      const users = await readUsers([f.xId, f.oId])
      expect(users[f.xId]?.elo).toBe(ELO_START)
      expect(users[f.oId]?.elo).toBe(ELO_START)
      expect(users[f.xId]?.ratedGames).toBe(0)
      expect(users[f.oId]?.ratedGames).toBe(0)
      // KK-112 stats yine de sayılır — yalnız ELO etkisiz kalır.
      expect(users[f.xId]?.stats).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
      expect(users[f.oId]?.stats).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
    },
  )

  it(
    `KK-113: aynı çift ${String(ELO_PAIR_WINDOW_HOURS)} saat içinde ` +
      `${String(ELO_PAIR_MAX_RATED)} puanlı oyun oynamışsa sonraki puansızdır — ` +
      'stats yine de artar',
    async () => {
      const f = await fixture()
      const pairKey = buildPairKey(f.xId, f.oId)
      const nowMs = 1_800_000_000_000
      const recentFinishedAt = new Date(nowMs - 1_000)

      // ELO_PAIR_MAX_RATED (3) adet ÖNCEKİ puanlı oyun — pencere İÇİNDE.
      for (let i = 0; i < ELO_PAIR_MAX_RATED; i += 1) {
        const priorGame = await Game.create({
          roomCode: CODE,
          players: { X: f.xId, O: f.oId },
          participants: deriveParticipants({ X: f.xId, O: f.oId }),
          pairKey,
          rated: true,
          winner: 'X',
          endReason: 'resign',
          finishedAt: recentFinishedAt,
          settledAt: recentFinishedAt,
        })
        createdGameIds.push(priorGame._id)
      }

      await finishGame(f.room, { kind: 'won', winner: 'O', line: null, reason: 'resign' }, nowMs)

      const game = await readGame(f.gameId)
      expect(game.rated).toBe(false)
      expect(game.eloDelta).toStrictEqual({ X: 0, O: 0 })
      const users = await readUsers([f.xId, f.oId])
      expect(users[f.xId]?.elo).toBe(ELO_START)
      expect(users[f.oId]?.elo).toBe(ELO_START)
      expect(users[f.xId]?.ratedGames).toBe(0)
      expect(users[f.oId]?.ratedGames).toBe(0)
      expect(users[f.oId]?.stats).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    },
  )

  it(
    `KK-113 SINIR: pencere İÇİNDE yalnız ${String(ELO_PAIR_MAX_RATED - 1)} puanlı oyun ` +
      'varsa (tavanın BİR ALTI) bu oyun HÂLÂ puanlıdır — eşiğin kendisi yanlış tarafta sınanmasın',
    async () => {
      const f = await fixture()
      const pairKey = buildPairKey(f.xId, f.oId)
      const nowMs = 1_800_000_000_000
      const recentFinishedAt = new Date(nowMs - 1_000)

      for (let i = 0; i < ELO_PAIR_MAX_RATED - 1; i += 1) {
        const priorGame = await Game.create({
          roomCode: CODE,
          players: { X: f.xId, O: f.oId },
          participants: deriveParticipants({ X: f.xId, O: f.oId }),
          pairKey,
          rated: true,
          winner: 'X',
          endReason: 'resign',
          finishedAt: recentFinishedAt,
          settledAt: recentFinishedAt,
        })
        createdGameIds.push(priorGame._id)
      }

      await finishGame(f.room, { kind: 'won', winner: 'O', line: null, reason: 'resign' }, nowMs)

      const game = await readGame(f.gameId)
      expect(game.rated).toBe(true)
    },
  )

  it(`KK-113: pencere DIŞINDAKİ (${String(ELO_PAIR_WINDOW_HOURS)} saatten eski) puanlı oyunlar SAYILMAZ`, async () => {
    const f = await fixture()
    const pairKey = buildPairKey(f.xId, f.oId)
    const nowMs = 1_800_000_000_000
    const staleFinishedAt = new Date(nowMs - (ELO_PAIR_WINDOW_HOURS + 1) * 60 * 60 * 1000)

    for (let i = 0; i < ELO_PAIR_MAX_RATED; i += 1) {
      const priorGame = await Game.create({
        roomCode: CODE,
        players: { X: f.xId, O: f.oId },
        participants: deriveParticipants({ X: f.xId, O: f.oId }),
        pairKey,
        rated: true,
        winner: 'X',
        endReason: 'resign',
        finishedAt: staleFinishedAt,
        settledAt: staleFinishedAt,
      })
      createdGameIds.push(priorGame._id)
    }

    await finishGame(f.room, { kind: 'won', winner: 'O', line: null, reason: 'resign' }, nowMs)

    const game = await readGame(f.gameId)
    expect(game.rated).toBe(true)
  })

  it('İDEMPOTANS: ELO İKİNCİ ÇAĞRIDA TEKRAR UYGULANMAZ (KK-053 regresyonu)', async () => {
    const f = await fixture()
    const status: TransportStatus = { kind: 'won', winner: 'X', line: [0, 2, 4], reason: 'line' }

    await finishGame(f.room, status)
    const afterFirst = await readUsers([f.xId, f.oId])

    // İkinci çağrı farklı bir sonuçla bile gelse (draw) CAS kaybeder.
    await finishGame(f.room, { kind: 'draw' })
    const afterSecond = await readUsers([f.xId, f.oId])

    expect(afterSecond[f.xId]?.elo).toBe(afterFirst[f.xId]?.elo)
    expect(afterSecond[f.oId]?.elo).toBe(afterFirst[f.oId]?.elo)
    expect(afterSecond[f.xId]?.ratedGames).toBe(1)
    expect(afterSecond[f.oId]?.ratedGames).toBe(1)
  })

  it(
    'SONDA (dispatch talebi): İKİ EŞZAMANLI finishGame ÇAĞRISI (Promise.all) AYNI oyunu ' +
      'bitirmeye çalışınca ELO TAM OLARAK BİR KEZ uygulanır — sıralı iki çağrı bunu SINAMAZ',
    async () => {
      const f = await fixture()
      const status: TransportStatus = { kind: 'won', winner: 'X', line: [0, 2, 4], reason: 'line' }

      // Aynı `room` anlık görüntüsü, aynı `status` — gerçek yarış: zamanlayıcı
      // yolu ile tembel yolun AYNI ANDA aynı bitişi kesinleştirmeye çalışması.
      await Promise.all([finishGame(f.room, status), finishGame(f.room, status)])

      const game = await readGame(f.gameId)
      expect(game.rated).toBe(true)
      const expectedX = eloDelta(ELO_START, ELO_START, 1)
      const expectedO = eloDelta(ELO_START, ELO_START, 0)
      expect(game.eloDelta).toStrictEqual({ X: expectedX, O: expectedO })

      const users = await readUsers([f.xId, f.oId])
      // ÇİFT UYGULANSAYDI X +24, O -24 olurdu — TAM BİR KEZ uygulandığının kanıtı budur.
      expect(users[f.xId]?.elo).toBe(ELO_START + expectedX)
      expect(users[f.oId]?.elo).toBe(ELO_START + expectedO)
      expect(users[f.xId]?.ratedGames).toBe(1)
      expect(users[f.oId]?.ratedGames).toBe(1)
      expect(users[f.xId]?.stats).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
      expect(users[f.oId]?.stats).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
    },
  )

  it('BEŞ EŞZAMANLI finishGame çağrısı da ELO/stats/ratedGames TAM BİR KEZ uygular', async () => {
    const f = await fixture()
    const status: TransportStatus = { kind: 'won', winner: 'O', line: [1, 4, 7], reason: 'line' }

    await Promise.all(Array.from({ length: 5 }, () => finishGame(f.room, status)))

    const users = await readUsers([f.xId, f.oId])
    expect(users[f.oId]?.ratedGames).toBe(1)
    expect(users[f.xId]?.ratedGames).toBe(1)
    expect(users[f.oId]?.stats).toStrictEqual({ wins: 1, losses: 0, draws: 0 })
    expect(users[f.xId]?.stats).toStrictEqual({ wins: 0, losses: 1, draws: 0 })
  })
})
