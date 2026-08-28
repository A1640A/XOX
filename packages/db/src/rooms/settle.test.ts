import { DISCONNECT_GRACE_SECONDS, MOVE_TIMEOUT_SECONDS } from '@xox/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connectDb } from '../client'
import { Game } from '../models/game'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'
import { User } from '../models/user'
import { buildPairKey, deriveParticipants } from '../pair'
import { settleDeadlines } from './settle'

const CODE = 'STL001'
const UX = 'stl-user-x'
const UO = 'stl-user-o'

/**
 * Sahte saat. `Date.now()` ÇAĞRILMAZ — bu dosyadaki hiçbir iddia duvar saatine
 * bağlı değil; `settleDeadlines(code, NOW)` zamanı dışarıdan alıyor ve odanın
 * son tarihleri de `NOW`a göre kuruluyor. CI'da kararsızlık için yer yok.
 *
 * Çıplak sayı bilerek (2026-01-01T00:00:00Z civarı).
 */
const NOW = 1_767_225_600_000

interface SeedOptions {
  turnDeadline?: Date | null
  disconnected?: RoomDoc['disconnected']
  presence?: RoomDoc['presence']
  state?: RoomDoc['state']
  board?: RoomDoc['board']
  withGame?: boolean
}

const CONNECTED: RoomDoc['presence'] = {
  X: { connId: 'conn-x', since: new Date(NOW - 60_000) },
  O: { connId: 'conn-o', since: new Date(NOW - 60_000) },
}

async function seed(options: SeedOptions = {}): Promise<string | null> {
  let gameId: string | null = null
  if (options.withGame === true) {
    const game = await Game.create({
      roomCode: CODE,
      players: { X: UX, O: UO },
      participants: deriveParticipants({ X: UX, O: UO }),
      pairKey: buildPairKey(UX, UO),
    })
    gameId = game._id
  }

  await Room.create({
    code: CODE,
    state: options.state ?? 'playing',
    seats: { X: { userId: UX, name: 'Ada' }, O: { userId: UO, name: 'Kaan' } },
    presence: options.presence ?? CONNECTED,
    board: options.board ?? Array<null>(9).fill(null),
    turnDeadline: options.turnDeadline ?? null,
    disconnected: options.disconnected ?? null,
    gameId,
    version: 7,
  })
  return gameId
}

async function cleanup(): Promise<void> {
  await Room.deleteOne({ code: CODE })
  await Game.deleteMany({ roomCode: CODE })
  await User.deleteMany({ _id: { $in: [UX, UO] } })
}

describe('settleDeadlines — çift yürütmenin yazma ucu (ADR-0004)', () => {
  beforeEach(async () => {
    await connectDb()
    await cleanup()
  })

  afterEach(cleanup)

  it('var olmayan oda için fırlatmaz, null döner — WS oturumu her mesajda çağırıyor', async () => {
    await expect(settleDeadlines('YOKYOK', NOW)).resolves.toBeNull()
  })

  it('süresi dolmamış oyunda null döner ve HİÇBİR ŞEY yazmaz', async () => {
    await seed({ turnDeadline: new Date(NOW + 1) })

    await expect(settleDeadlines(CODE, NOW)).resolves.toBeNull()

    const after = await Room.findOne({ code: CODE }).lean()
    // Çıplak sayı bilerek: sabitten türetilmiş beklenti bu dalı göremez.
    expect(after?.version).toBe(7)
    expect(after?.state).toBe('playing')
  })

  it('turnDeadline dolunca sırası gelen oyuncu KAYBEDER — reason timeout, oda finished', async () => {
    await seed({ turnDeadline: new Date(NOW - 1) })

    const result = await settleDeadlines(CODE, NOW)

    expect(result?.ok).toBe(true)
    expect(result?.ok === true ? result.events : []).toStrictEqual([
      { kind: 'settled', reason: 'timeout' },
      { kind: 'finished', status: { kind: 'won', winner: 'O', line: null, reason: 'timeout' } },
    ])
    const after = await Room.findOne({ code: CODE }).lean()
    expect(after?.state).toBe('finished')
    expect(after?.version).toBe(8)
    expect(after?.result).toMatchObject({ kind: 'won', winner: 'O', reason: 'timeout' })
    // Bitmiş oyunda saat DURUR (bayat son tarih başka bir okuyucuyu yanıltmasın).
    expect(after?.turnDeadline).toBeNull()
    expect(after?.disconnected).toBeNull()
  })

  it('grace dolunca KOPAN oyuncu kaybeder — reason abandon (KK-072)', async () => {
    await seed({
      presence: { X: CONNECTED.X, O: null },
      disconnected: {
        seat: 'O',
        at: new Date(NOW - DISCONNECT_GRACE_SECONDS * 1000),
        graceEndsAt: new Date(NOW),
      },
    })

    const result = await settleDeadlines(CODE, NOW)

    expect(result?.ok === true ? result.events[0] : null).toStrictEqual({
      kind: 'settled',
      reason: 'abandon',
    })
    const after = await Room.findOne({ code: CODE }).lean()
    expect(after?.result).toMatchObject({ kind: 'won', winner: 'X', reason: 'abandon' })
  })

  it('grace SÜRERKEN hiçbir şey yazmaz — DISCONNECT_GRACE_SECONDS sabitinden okunur', async () => {
    // Kopma anı `NOW`; grace sabiti kadar sürüyor. Sabit 30 sn iken 29. saniyede
    // hâlâ yazılmamalı, 30. saniyede yazılmalı: aşağıdaki İKİ iddia birlikte
    // sabitin GERÇEKTEN kullanıldığını gösterir (tek yönlü iddia kör kalırdı).
    const graceEndsAt = new Date(NOW + DISCONNECT_GRACE_SECONDS * 1000)
    await seed({
      presence: { X: CONNECTED.X, O: null },
      disconnected: { seat: 'O', at: new Date(NOW), graceEndsAt },
    })

    await expect(settleDeadlines(CODE, graceEndsAt.getTime() - 1)).resolves.toBeNull()
    expect((await Room.findOne({ code: CODE }).lean())?.version).toBe(7)

    await expect(settleDeadlines(CODE, graceEndsAt.getTime())).resolves.not.toBeNull()
    expect((await Room.findOne({ code: CODE }).lean())?.state).toBe('finished')
  })

  it('KK-076: iki oyuncu da bağlı DEĞİLKEN hiçbir sonuç yazılmaz, oyun finishedAt:null kalır', async () => {
    const gameId = await seed({
      presence: { X: null, O: null },
      turnDeadline: new Date(NOW - 60_000),
      disconnected: { seat: 'O', at: new Date(NOW - 90_000), graceEndsAt: new Date(NOW - 60_000) },
      withGame: true,
    })

    await expect(settleDeadlines(CODE, NOW)).resolves.toBeNull()

    const after = await Room.findOne({ code: CODE }).lean()
    expect(after?.state).toBe('playing')
    expect(after?.version).toBe(7)
    const game = await Game.findById(gameId).lean()
    expect(game?.finishedAt).toBeNull()
  })

  it('bitmiş oyun bir daha bitmez — geçmiş deadline OLSA BİLE', async () => {
    await seed({ state: 'finished', turnDeadline: new Date(NOW - 60_000) })

    await expect(settleDeadlines(CODE, NOW)).resolves.toBeNull()
    expect((await Room.findOne({ code: CODE }).lean())?.version).toBe(7)
  })

  it('KK-074: games.endReason timeout olur ve stats bir kez artar', async () => {
    await User.create([
      { _id: UX, email: 'stlx@example.test', name: 'Ada', passwordHash: 'x' },
      { _id: UO, email: 'stlo@example.test', name: 'Kaan', passwordHash: 'x' },
    ])
    const gameId = await seed({ turnDeadline: new Date(NOW - 1), withGame: true })

    await settleDeadlines(CODE, NOW)

    const game = await Game.findById(gameId).lean()
    expect(game?.endReason).toBe('timeout')
    expect(game?.winner).toBe('O')
    expect(game?.finishedAt).not.toBeNull()
    expect((await User.findById(UX).lean())?.stats.losses).toBe(1)
    expect((await User.findById(UO).lean())?.stats.wins).toBe(1)
  })

  it('SIRALI ikinci çağrı yazmaz — ilk kesinleştirmeden sonra konu kalmaz', async () => {
    await seed({ turnDeadline: new Date(NOW - 1) })

    const first = await settleDeadlines(CODE, NOW)
    const second = await settleDeadlines(CODE, NOW)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect((await Room.findOne({ code: CODE }).lean())?.version).toBe(8)
  })

  it(
    'YARIŞ ÇEKİRDEĞİ (çift yürütme): zamanlayıcı ve tembel yol GERÇEKTEN eşzamanlı ' +
      '(Promise.all) sonlandırmaya çalışınca TAM OLARAK BİRİ yazar, diğeri null alır — ' +
      'sıralı iki çağrı bu kriteri SINAMAZ',
    async () => {
      await User.create([
        { _id: UX, email: 'stlx@example.test', name: 'Ada', passwordHash: 'x' },
        { _id: UO, email: 'stlo@example.test', name: 'Kaan', passwordHash: 'x' },
      ])
      const gameId = await seed({ turnDeadline: new Date(NOW - 1), withGame: true })

      // İki yürütme yolu da AYNI imzayı çağırır (`session.ts`: `onDue` ve
      // tembel kontrol ikisi de `db.settleDeadlines(code, now())`). Yarışı
      // birebir bu şekilde kuruyoruz.
      const [timerPath, lazyPath] = await Promise.all([
        settleDeadlines(CODE, NOW),
        settleDeadlines(CODE, NOW),
      ])

      const settled = [timerPath, lazyPath].filter((r) => r !== null)
      const skipped = [timerPath, lazyPath].filter((r) => r === null)
      expect(settled).toHaveLength(1)
      expect(skipped).toHaveLength(1)

      // Oyun BİR KEZ bitti: version tam 1 arttı, sayaçlar tam 1.
      const after = await Room.findOne({ code: CODE }).lean()
      expect(after?.version).toBe(8)
      expect(after?.state).toBe('finished')
      const game = await Game.findById(gameId).lean()
      expect(game?.endReason).toBe('timeout')
      expect((await User.findById(UO).lean())?.stats.wins).toBe(1)
      expect((await User.findById(UX).lean())?.stats.losses).toBe(1)
    },
  )

  it('YARIŞ, BEŞ EŞZAMANLI YOL: yine tam olarak biri yazar (version tam 1 artar)', async () => {
    await seed({ turnDeadline: new Date(NOW - 1) })

    const results = await Promise.all(Array.from({ length: 5 }, () => settleDeadlines(CODE, NOW)))

    expect(results.filter((r) => r !== null)).toHaveLength(1)
    expect((await Room.findOne({ code: CODE }).lean())?.version).toBe(8)
  })

  it('turnDeadline MOVE_TIMEOUT_SECONDS kadar ileridiyse konu yoktur (sabit sondası)', async () => {
    await seed({ turnDeadline: new Date(NOW + MOVE_TIMEOUT_SECONDS * 1000) })

    await expect(settleDeadlines(CODE, NOW)).resolves.toBeNull()
  })
})
