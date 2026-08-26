import { connectDb, getDbName } from '@xox/db'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

/**
 * W2-04 · KK-101 — "ortam karışması testle yakalanır". `Vercel env`
 * ayarlarında Preview `MONGODB_DB=xox_test`, Production `MONGODB_DB=xox_prod`
 * OLMASI GEREKİR (OPS-002) ama bu bir sözleşme, mekanik bir garanti DEĞİL:
 * OPS-006 taşımasında tam da bu ayrım bozulmuştu — yeni Vercel projesinin
 * Preview ortamına `MONGODB_DB` yazılamamış (izin reddi) ve preview
 * `/api/health` sessizce `xox_prod` raporlamıştı; E2E-001'in bloke edici ön
 * kontrolü (`assertTestDatabase`, OPS-007 nöbetçisi) production veritabanının
 * E2E tarafından SIFIRLANMASINI o gün engelledi (`docs/board/journal.ndjson`,
 * `guard.saved_production`). O kontrol E2E tarafında; BU route artık AYNI
 * sınıf hatayı üretim tarafında da açıkça işaretler: `VERCEL_ENV`'in
 * BEKLEDİĞİ veritabanı adıyla `getDbName()`'in DÖNDÜĞÜ ad karşılaştırılır,
 * uyuşmazsa `ok:false` ile 500 döner — health check yeşil kalıp yanlış
 * ortamı gizlemez.
 *
 * Yerel geliştirme (`VERCEL_ENV` tanımsız) kontrol DIŞI bırakılır: geliştirici
 * bilerek `xox_dev`/`xox_test` arasında geçiş yapabilir.
 */
const EXPECTED_DB_BY_VERCEL_ENV: Record<string, string> = {
  production: 'xox_prod',
  preview: 'xox_test',
}

function environmentMismatch(dbName: string): string | null {
  const vercelEnv = process.env['VERCEL_ENV']
  if (vercelEnv === undefined) return null
  const expected = EXPECTED_DB_BY_VERCEL_ENV[vercelEnv]
  if (expected === undefined || expected === dbName) return null
  return `VERCEL_ENV='${vercelEnv}' '${expected}' veritabanını bekliyor, '${dbName}' bulundu`
}

export async function GET(): Promise<Response> {
  try {
    const conn = await connectDb()
    await conn.connection.db?.admin().ping()

    const dbName = getDbName()
    const mismatch = environmentMismatch(dbName)
    if (mismatch !== null) {
      logError('GET /api/health ortam/veritabanı uyuşmazlığı', {}, new Error(mismatch))
      return Response.json({ ok: false, db: dbName, error: mismatch }, { status: 500 })
    }

    return Response.json({ ok: true, db: dbName, at: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bilinmeyen hata'
    return Response.json({ ok: false, error: message }, { status: 503 })
  }
}
