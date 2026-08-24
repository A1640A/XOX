import { hash } from '@node-rs/argon2'
import { ELO_START } from '@xox/shared'
import { connectDb, disconnectDb } from './client'
import { User } from './models/user'

/** E2E testleri bu kullanıcılarla giriş yapar. Kimlikler sabittir — testler tahmin etmez. */
export const TEST_USERS = [
  { _id: 'e2e-user-1', name: 'Test Oyuncu 1', email: 'e2e1@xox.test' },
  { _id: 'e2e-user-2', name: 'Test Oyuncu 2', email: 'e2e2@xox.test' },
] as const

/**
 * TEST_USERS'ın ortak parolası — E2E ve entegrasyon testleri bunu bilerek
 * giriş yapar. Saklanan `passwordHash` bu değerin argon2id özetidir, düz
 * metin hiçbir dokümana yazılmaz (KK-004).
 */
export const TEST_USER_PASSWORD = 'XoxTest!2026'

export async function seedTestUsers(): Promise<void> {
  await connectDb()
  const passwordHash = await hash(TEST_USER_PASSWORD)
  for (const user of TEST_USERS) {
    await User.updateOne(
      { _id: user._id },
      {
        $set: { name: user.name, email: user.email, passwordHash },
        $setOnInsert: {
          stats: { wins: 0, losses: 0, draws: 0 },
          elo: ELO_START,
          ratedGames: 0,
          theme: 'acik',
        },
      },
      { upsert: true },
    )
  }
}

if (process.argv[1]?.endsWith('seed.ts') === true) {
  await seedTestUsers()
  await disconnectDb()
  console.warn(`${String(TEST_USERS.length)} test kullanıcısı hazır`)
}
