import { randomUUID } from 'node:crypto'
import { LEADERBOARD_MIN_RATED_GAMES, LEADERBOARD_SIZE } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { User } from '../models/user'
import { getLeaderboardSelf, getLeaderboardTop, getLeaderboardView } from './leaderboard'

/**
 * `users` gerçek `xox_test`te PAYLAŞILAN bir koleksiyondur (seed kullanıcıları,
 * başka test dosyalarının verisi). Sıralamayı GERÇEK verilerle karıştırmadan
 * sınamak için test kullanıcıları AŞIRI yüksek ELO alır (>= 500_000) — bu
 * değer hiçbir gerçek oyunla ulaşılamaz, dolayısıyla bu dosyanın oluşturduğu
 * kullanıcılar HER ZAMAN tablonun en tepesinde, aralarındaki SIRA da kendi
 * ELO'larına göre belirleniyor. Bu "kendine-referanslı beklenti" DEĞİL: sıra
 * dıştan (test verisinden) biliniyor, sorgunun kendisinden türetilmiyor.
 */
describe('leaderboard sorguları (gerçek xox_test)', () => {
  const createdUserIds: string[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } })
      createdUserIds.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  async function makeUser(options: {
    elo: number
    ratedGames: number
    stats?: { wins: number; losses: number; draws: number }
    name?: string
  }): Promise<string> {
    const id = randomUUID()
    await User.create({
      _id: id,
      name: options.name ?? `Test-${id.slice(0, 8)}`,
      email: `${id}@xox.test`,
      passwordHash: 'x',
      elo: options.elo,
      ratedGames: options.ratedGames,
      stats: options.stats ?? { wins: 0, losses: 0, draws: 0 },
    })
    createdUserIds.push(id)
    return id
  }

  it('KK-117: sorgu şekli find({ratedGames:{$gte}}).sort({elo:-1}).limit(N) — COLLSCAN YOK, ayrı SORT aşaması YOK', async () => {
    // Üretim kodunun (`getLeaderboardTop`) KULLANDIĞI TAM sorgu şekli — kısmi
    // indeksin (`users.ts`, `{elo:-1}` + `partialFilterExpression`) filtresiyle
    // BİREBİR eşleşiyor, plan bu yüzden veriden BAĞIMSIZ (explain veri hacmine
    // değil, sorgu şekline bakar).
    const plan = await User.find({ ratedGames: { $gte: LEADERBOARD_MIN_RATED_GAMES } }, 'name')
      .sort({ elo: -1 })
      .limit(LEADERBOARD_SIZE)
      .explain('executionStats')

    const planText = JSON.stringify(plan)
    expect(planText).not.toContain('COLLSCAN')
    // Ayrı bir SORT aşaması, planlayıcının indeksten sıralı gelen sonucu
    // KULLANMADIĞI, belleğe alıp yeniden sıraladığı anlamına gelir — kısmi
    // indeks tam bu yüzden `elo:-1` üzerinde kurulu (KK-117 yorum değil, testtir).
    expect(planText).not.toContain('"stage":"SORT"')
  })

  it('getLeaderboardTop en yüksek ELO önce gelecek şekilde sıralar ve rank 1den başlar', async () => {
    const third = await makeUser({ elo: 500_010, ratedGames: 10, name: 'Üçüncü' })
    const first = await makeUser({ elo: 500_030, ratedGames: 10, name: 'Birinci' })
    const second = await makeUser({ elo: 500_020, ratedGames: 10, name: 'İkinci' })

    const top = await getLeaderboardTop()
    // Bu dosyanın kullanıcıları HER ZAMAN ilk 3'te — başka hiçbir gerçek kayıt
    // 500_000 ELO'ya ulaşamaz.
    const topThree = top.slice(0, 3)
    expect(topThree.map((e) => e.userId)).toStrictEqual([first, second, third])
    expect(topThree.map((e) => e.rank)).toStrictEqual([1, 2, 3])
    expect(topThree.map((e) => e.elo)).toStrictEqual([500_030, 500_020, 500_010])
  })

  it(
    'W3-03: getLeaderboardTop dönen her satırda ratedGames sayısını taşır ' +
      '(leaderboardResponseSchema alanı zorunlu kılıyor)',
    async () => {
      const userId = await makeUser({ elo: 500_015, ratedGames: 12 })

      const top = await getLeaderboardTop()

      const entry = top.find((e) => e.userId === userId)
      expect(entry?.ratedGames).toBe(12)
    },
  )

  it(
    `KK-115: ratedGames < LEADERBOARD_MIN_RATED_GAMES (${String(LEADERBOARD_MIN_RATED_GAMES)}) ` +
      'olan kullanıcı listeye HİÇ GİRMEZ',
    async () => {
      const ineligible = await makeUser({
        elo: 500_050,
        ratedGames: LEADERBOARD_MIN_RATED_GAMES - 1,
      })

      const top = await getLeaderboardTop()

      expect(top.some((e) => e.userId === ineligible)).toBe(false)
    },
  )

  it('KK-115 SINIR: tam eşik değerindeki (ratedGames === eşik) kullanıcı listeye GİRER', async () => {
    const eligible = await makeUser({ elo: 500_060, ratedGames: LEADERBOARD_MIN_RATED_GAMES })

    const top = await getLeaderboardTop()

    expect(top.some((e) => e.userId === eligible)).toBe(true)
  })

  it('limit parametresi çıplak sayı: limit(2) TAM 2 satır döner', async () => {
    await makeUser({ elo: 500_100, ratedGames: 10 })
    await makeUser({ elo: 500_101, ratedGames: 10 })
    await makeUser({ elo: 500_102, ratedGames: 10 })

    const top = await getLeaderboardTop(2)

    expect(top).toHaveLength(2)
  })

  it('getLeaderboardSelf: uygun kullanıcının SIRASI kendinden yüksek uygun sayısı + 1', async () => {
    const higher1 = await makeUser({ elo: 500_205, ratedGames: 10 })
    const higher2 = await makeUser({ elo: 500_204, ratedGames: 10 })
    const target = await makeUser({
      elo: 500_203,
      ratedGames: 8,
      stats: { wins: 3, losses: 1, draws: 4 },
    })
    void higher1
    void higher2

    const self = await getLeaderboardSelf(target)

    expect(self).not.toBeNull()
    expect(self?.rank).toBe(3)
    expect(self?.elo).toBe(500_203)
    expect(self?.stats).toStrictEqual({ wins: 3, losses: 1, draws: 4 })
    expect(self?.ratedGames).toBe(8)
  })

  it('getLeaderboardSelf: eşik altındaki kullanıcı için null döner (sırası anlamsız)', async () => {
    const belowThreshold = await makeUser({
      elo: 500_300,
      ratedGames: LEADERBOARD_MIN_RATED_GAMES - 1,
    })

    await expect(getLeaderboardSelf(belowThreshold)).resolves.toBeNull()
  })

  it('getLeaderboardSelf: var olmayan kullanıcı için null döner (istisna fırlatmaz)', async () => {
    await expect(getLeaderboardSelf(randomUUID())).resolves.toBeNull()
  })

  it('KK-115: getLeaderboardView — top içindeyken self=null (aynı satır İKİ KEZ gösterilmez)', async () => {
    const userId = await makeUser({ elo: 500_400, ratedGames: 10 })

    const view = await getLeaderboardView(userId, 5)

    expect(view.top.some((e) => e.userId === userId)).toBe(true)
    expect(view.self).toBeNull()
  })

  it('KK-115: getLeaderboardView — top DIŞINDAKİ kullanıcı için self DOLU döner', async () => {
    // limit=1 ile yapay olarak "ilk 50'de değil" durumunu üretiyoruz: iki
    // yüksek puanlı kullanıcı var, `limit` yalnız birini top'a alıyor.
    const inTop = await makeUser({ elo: 500_500, ratedGames: 10 })
    const belowTop = await makeUser({
      elo: 500_499,
      ratedGames: 8,
      stats: { wins: 1, losses: 0, draws: 0 },
    })

    const view = await getLeaderboardView(belowTop, 1)

    expect(view.top.map((e) => e.userId)).toStrictEqual([inTop])
    expect(view.self).not.toBeNull()
    expect(view.self?.userId).toBe(belowTop)
    expect(view.self?.rank).toBe(2)
  })

  it('getLeaderboardView: viewerUserId=null iken self her zaman null', async () => {
    await makeUser({ elo: 500_600, ratedGames: 10 })

    const view = await getLeaderboardView(null, 5)

    expect(view.self).toBeNull()
  })

  it('SAF OLMAYAN SORGU DAHİ deterministik: aynı veriyle iki ardışık çağrı AYNI sırayı verir', async () => {
    await makeUser({ elo: 500_700, ratedGames: 10 })
    await makeUser({ elo: 500_701, ratedGames: 10 })

    const first = await getLeaderboardTop(5)
    const second = await getLeaderboardTop(5)

    expect(first.map((e) => e.userId)).toStrictEqual(second.map((e) => e.userId))
  })
})
