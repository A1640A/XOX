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
