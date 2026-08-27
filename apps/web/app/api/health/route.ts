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

/**
 * ROLLOUT-BOARD-001 · ADR-0018 §3, "İLK KRİTER BİR ÖLÇÜMDÜR" — Vercel Skew
 * Protection Pro/Enterprise takımlar içindir ve bu projenin planı ADR
 * yazıldığında DOĞRULANMADI. "Korunuyoruz" ölçüm olmadan DENMEZ (gotcha
 * örüntü 1: kural yazılmış ama ateşlenmiyor).
 *
 * Yalnız BOOLEAN eklenir — DEĞER SIZDIRILMAZ: `VERCEL_DEPLOYMENT_ID`'nin
 * KENDİSİ (dağıtım kimliği, hassas değil ama gereksiz) hiçbir zaman yanıta
 * yazılmaz, yalnız VAR OLUP OLMADIĞI. `db` alanına DOKUNULMAZ — o alan
 * `apps/e2e/global-setup.ts`'in bloke edici ön kontrolünün (OPS-007
 * nöbetçisi) okuduğu kapıdır, adı/tipi/varlığı sabittir.
 */
function skewProtectionSignals(): { skewProtectionEnabled: boolean; deploymentIdPresent: boolean } {
  return {
    skewProtectionEnabled: process.env['VERCEL_SKEW_PROTECTION_ENABLED'] === '1',
    deploymentIdPresent:
      typeof process.env['VERCEL_DEPLOYMENT_ID'] === 'string' &&
      process.env['VERCEL_DEPLOYMENT_ID'].length > 0,
  }
}

export async function GET(): Promise<Response> {
  const skew = skewProtectionSignals()
  try {
    const conn = await connectDb()
    await conn.connection.db?.admin().ping()

    const dbName = getDbName()
    const mismatch = environmentMismatch(dbName)
    if (mismatch !== null) {
      logError('GET /api/health ortam/veritabanı uyuşmazlığı', {}, new Error(mismatch))
      return Response.json({ ok: false, db: dbName, error: mismatch, ...skew }, { status: 500 })
    }

    return Response.json({ ok: true, db: dbName, at: new Date().toISOString(), ...skew })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bilinmeyen hata'
    return Response.json({ ok: false, error: message, ...skew }, { status: 503 })
  }
}
