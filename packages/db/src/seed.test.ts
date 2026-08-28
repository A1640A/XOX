import { verify } from '@node-rs/argon2'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { connectDb, disconnectDb } from './client'
import { User } from './models/user'
import { TEST_USERS, TEST_USER_PASSWORD, seedTestUsers } from './seed'

describe('seedTestUsers', () => {
  beforeAll(async () => {
    await connectDb()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  it('TEST_USERS içindeki her kullanıcı için gerçek argon2id özeti yazar', async () => {
    await seedTestUsers()

    for (const user of TEST_USERS) {
      const found = await User.findById(user._id).select('+passwordHash').lean()
      expect(found).not.toBeNull()
      expect(found?.passwordHash).not.toBe(TEST_USER_PASSWORD)
      expect(found?.passwordHash.startsWith('$argon2id$')).toBe(true)
      await expect(verify(found?.passwordHash ?? '', TEST_USER_PASSWORD)).resolves.toBe(true)
      await expect(verify(found?.passwordHash ?? '', 'yanlis-parola')).resolves.toBe(false)
    }
  })

  it('idempotenttir — ikinci çağrı aynı kullanıcı sayısını korur', async () => {
    await seedTestUsers()
    await seedTestUsers()

    const count = await User.countDocuments({ _id: { $in: TEST_USERS.map((u) => u._id) } })
    expect(count).toBe(TEST_USERS.length)
  })

  it('varsayılan profil alanlarını (elo/ratedGames/theme/stats) kurar', async () => {
    await seedTestUsers()

    for (const user of TEST_USERS) {
      const found = await User.findById(user._id).lean()
      expect(found?.elo).toBe(1200)
      expect(found?.ratedGames).toBe(0)
      expect(found?.theme).toBe('acik')
      expect(found?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
    }
  })

  // DB-005: seed önceden `$setOnInsert` kullanıyordu — var olan kullanıcıda
  // stats/elo/ratedGames HİÇ sıfırlanmıyordu. E2E gerçek oyunlar oynayıp
  // `finishGame`'in kullandığı gerçek yazma yolunu (`$inc: {'stats.<alan>':1}`,
  // bkz. rooms/finish.ts) tetikliyor; bir sonraki seed koşusu bu kirliliği
  // GERİ ALMALI. Bu test kirliliği gerçek üretim yazma şekliyle üretir —
  // `$setOnInsert`e geri dönülürse bu test kırmızı olur.
  it('kirlenmiş istatistikleri bir sonraki koşuda bilinen sıfır duruma GERİ DÖNDÜRÜR', async () => {
    await seedTestUsers()

    const [user1, user2] = TEST_USERS
    await User.bulkWrite([
      { updateOne: { filter: { _id: user1._id }, update: { $inc: { 'stats.wins': 1 } } } },
      {
        updateOne: {
          filter: { _id: user2._id },
          update: { $inc: { 'stats.losses': 2, 'stats.draws': 1 } },
        },
      },
    ])
    await User.updateOne({ _id: user1._id }, { $set: { elo: 1400 }, $inc: { ratedGames: 3 } })

    const dirtied = await User.findById(user1._id).lean()
    expect(dirtied?.stats.wins).toBe(1)
    expect(dirtied?.elo).toBe(1400)
    expect(dirtied?.ratedGames).toBe(3)
    const dirtied2 = await User.findById(user2._id).lean()
    expect(dirtied2?.stats).toStrictEqual({ wins: 0, losses: 2, draws: 1 })

    await seedTestUsers()

    for (const user of TEST_USERS) {
      const found = await User.findById(user._id).lean()
      expect(found?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
      expect(found?.elo).toBe(1200)
      expect(found?.ratedGames).toBe(0)
    }
  })

  // Son test: bu CLI dalı disconnectDb() çağırır. resetModules ile taze bir
  // içe aktarma tetiklenmezse ES modülü zaten yüklü sayılır ve üst seviye
  // gövde ikinci kez ÇALIŞMAZ (reset.test.ts'teki kalıpla aynı).
  it('doğrudan çalıştırıldığında CLI girişi seedTestUsers çalıştırır ve bağlantıyı kapatır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const originalArgv = [...process.argv]
    process.argv = ['node', '/repo/packages/db/src/seed.ts']
    try {
      vi.resetModules()
      await import('./seed')
    } finally {
      process.argv = originalArgv
    }

    expect(warn).toHaveBeenCalledWith(`${String(TEST_USERS.length)} test kullanıcısı hazır`)

    // Sonraki test dosyaları için bağlantıyı geri kur — bu dosyanın kendi
    // afterAll'u zaten no-op disconnectDb çağırır, burada yeniden bağlanmak
    // dosyanın geri kalanının varsayımını bozmaz (bu son test).
    await connectDb()
  })
})
