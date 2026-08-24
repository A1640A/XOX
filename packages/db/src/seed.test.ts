import { verify } from '@node-rs/argon2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
})
