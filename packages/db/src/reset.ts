import { connectDb, disconnectDb, getDbName } from './client'
import { loadEnvLocal } from './load-env'

const RESETTABLE = new Set(['xox_test'])

/** Yalnızca test veritabanı sıfırlanabilir — yanlış cluster'a karşı sert koruma. */
export async function resetDatabase(): Promise<void> {
  const dbName = getDbName()
  if (!RESETTABLE.has(dbName)) {
    throw new Error(`Reddedildi: '${dbName}' sıfırlanabilir değil. Yalnızca xox_test sıfırlanır.`)
  }
  const conn = await connectDb()
  await conn.connection.dropDatabase()
}

if (process.argv[1]?.endsWith('reset.ts') === true) {
  // CLI olarak kosarken .env.local yuklenmeli; vitest.setup.ts yalniz testlerde calisir.
  loadEnvLocal()
  await resetDatabase()
  await disconnectDb()
  console.warn(`Sıfırlandı: ${getDbName()}`)
}
