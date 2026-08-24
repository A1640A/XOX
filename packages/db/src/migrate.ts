import { connectDb, disconnectDb, getDbName } from './client'
import { ensureIndexes } from './indexes'
import { loadEnvLocal } from './load-env'

/**
 * OPS-003 SEC-002/SEC-005 düzeltmesi.
 *
 * ÖNCEKİ tasarım `e2e-preview.yml`'de `MIGRATION_SECRET`'ı preview URL'ine
 * (`curl -X POST $E2E_BASE_URL/api/admin/migrate -H "x-migration-secret: ..."`)
 * gönderiyordu. Güvenlik denetimi bunu kırdı: preview'da deploy edilen kod
 * PR YAZARININ kodudur (workflow default branch'ten okunur ama deploy edilen
 * kod PR head'i) — bir PR, route'un ilk satırına isteğin başlıklarını
 * (dolayısıyla sırrı) geri yansıtan bir satır ekleyebilir, workflow da yanıt
 * gövdesini zaten `cat` ile public Actions log'una basıyordu. Fork PR'ları
 * için `gitForkProtection` bunu blocker'dan major'a düşürüyor ama
 * collaborator/entegrasyon yolu açık kalıyordu.
 *
 * ÇÖZÜM: sırrı AĞDAN HİÇ GEÇİRME. CI zaten `MONGODB_URI` secret'ına sahip ve
 * `pnpm --filter @xox/db reset` çalıştırıyor — `ensureIndexes()`'i doğrudan
 * RUNNER'DAN (deploy edilen PR koduna hiç dokunmadan) çağırmak hem sırrı
 * ortadan kaldırıyor hem de HTTP/DNS/TLS güvenilirliğine bağımlılığı kesiyor.
 *
 * `POST /api/admin/migrate` route'u KALDIRILMADI — production'da otomatik bir
 * deploy workflow'u olmadığı için (deploy'lar elle, `vercel deploy --prod`)
 * yalnızca production runbook'u için hâlâ gerekli (bkz. o dosyanın başı).
 */
export async function migrate(): Promise<{ db: string }> {
  await connectDb()
  await ensureIndexes()
  return { db: getDbName() }
}

if (process.argv[1]?.endsWith('migrate.ts') === true) {
  loadEnvLocal()
  const result = await migrate()
  await disconnectDb()
  console.warn(`İndeksler kuruldu: ${result.db}`)
}
