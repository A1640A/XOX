import { connectDb, disconnectDb } from './client'
import { User } from './models/user'

/** E2E testleri bu kullanıcılarla giriş yapar. Kimlikler sabittir — testler tahmin etmez. */
export const TEST_USERS = [
  { _id: 'e2e-user-1', name: 'Test Oyuncu 1', email: 'e2e1@xox.test' },
  { _id: 'e2e-user-2', name: 'Test Oyuncu 2', email: 'e2e2@xox.test' },
] as const

export async function seedTestUsers(): Promise<void> {
  await connectDb()
  for (const user of TEST_USERS) {
    await User.updateOne(
      { _id: user._id },
      { $setOnInsert: { ...user, stats: { wins: 0, losses: 0, draws: 0 }, elo: 1200 } },
      { upsert: true },
    )
  }
}

if (process.argv[1]?.endsWith('seed.ts') === true) {
  await seedTestUsers()
  await disconnectDb()
  console.warn(`${String(TEST_USERS.length)} test kullanıcısı hazır`)
}
