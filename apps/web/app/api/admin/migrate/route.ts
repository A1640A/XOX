import { timingSafeEqual } from 'node:crypto'
import { connectDb, ensureIndexes, getDbName } from '@xox/db'
import { logError, logWarn } from '@/lib/log'

export const dynamic = 'force-dynamic'
/** İndeks kurulumu birden fazla `createIndex` çağrısı yapar; varsayılan 10 sn dar olabilir. */
export const maxDuration = 30

/** Kabul edilen hedef veritabanları — kapsam dışı bir ada asla yazmaz (SEC-004). */
const KNOWN_DB_NAMES = new Set(['xox_dev', 'xox_test', 'xox_prod'])

/**
 * OPS-003 · `ensureIndexes()`'in korumalı bir çağıranı.
 *
 * Auth.js henüz yok (AUTH-001 sonraki dalgada), bu yüzden bu route bir oturuma
 * değil paylaşılan bir sırra dayanır: `MIGRATION_SECRET` ortam değişkeni
 * `x-migration-secret` başlığıyla eşleşmeli. Eşleşmezse (ya da sır hiç
 * tanımlı değilse) 404 dönülür — 401/403 route'un VARLIĞINI doğrulardı,
 * 404 onu gizler.
 *
 * Çağıranlar:
 * 1. CI'de artık BU ROUTE DEĞİL, `packages/db/src/migrate.ts` (runner'dan
 *    doğrudan çağrı) — bkz. o dosyanın başlık yorumu (SEC-002/SEC-005: sır
 *    ağdan hiç geçmiyor, deploy edilen PR koduna hiç güvenilmiyor).
 * 2. Production: otomatik bir deploy workflow'u yok (deploy'lar yalnız lead
 *    onayıyla `vercel deploy --prod` ile elle yapılıyor — bkz. CLAUDE.md).
 *    devops runbook'u: `vercel deploy --prod` sonrası
 *    `POST /api/admin/migrate?db=xox_prod` bir kez elle çağrılır (gerçek
 *    prod URL'i ve sır board'da SEC-001'e bağlı runbook'ta — bu dosyada YOK,
 *    bkz. dosya başı security notu deposundaki gerekçe).
 *
 * SEC-004: `db` sorgu parametresi hedefi POZİTİF olarak doğrular — sır
 * doğrulandıktan SONRA, `getDbName()` ile eşleşmezse (ör. Vercel
 * production'da `MONGODB_DB` unutulmuş ve sessizce `xox_dev`'e düşmüşse)
 * 409 döner. Bu, runbook'u koşan insanın "prod'u indeksledim" sanıp yanlış
 * ortamı indekslemesini — ya da hiç fark etmemesini — engeller.
 */
function secretMatches(provided: string | null): boolean {
  const expected = process.env['MIGRATION_SECRET']
  if (expected === undefined || expected === '' || provided === null) return false
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  // Uzunluk farklıysa timingSafeEqual fırlatır — önce eşit uzunluğa getir,
  // eşleşmeyecek şekilde, süre farkı bilgi sızdırmasın.
  if (expectedBuf.length !== providedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf)
    return false
  }
  return timingSafeEqual(expectedBuf, providedBuf)
}

export async function POST(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-migration-secret'))) {
    // SEC-007: değeri ya da uzunluğunu ASLA loglama — yalnız denemenin olduğunu.
    logWarn('migrate: yetkisiz istek reddedildi', { at: new Date().toISOString() })
    return new Response('Not Found', { status: 404 })
  }

  const requestedDb = new URL(request.url).searchParams.get('db')
  if (requestedDb === null || !KNOWN_DB_NAMES.has(requestedDb)) {
    return Response.json(
      { ok: false, error: 'invalid_db_param', allowed: [...KNOWN_DB_NAMES] },
      { status: 400 },
    )
  }
  const actualDb = getDbName()
  if (requestedDb !== actualDb) {
    return Response.json(
      { ok: false, error: 'db_mismatch', expected: actualDb, actual: requestedDb },
      { status: 409 },
    )
  }

  try {
    await connectDb()
    await ensureIndexes()
    return Response.json({ ok: true, db: actualDb, at: new Date().toISOString() })
  } catch (error) {
    // SEC-006: sürücü hatası (host adı, kimlik bilgisi ipuçları içerebilir) ASLA
    // istemciye açık dönmez — sunucu tarafı `lib/log.ts`'e gider (W2-04'ten
    // itibaren MONGODB_URI/e-posta/JWT kalıpları orada maskelenir, ikinci
    // savunma hattı), istemci sabit bir kod alır.
    logError('migrate: ensureIndexes başarısız', {}, error)
    const isLockConflict = error instanceof Error && error.message.includes('zaten çalışıyor')
    return Response.json(
      { ok: false, error: isLockConflict ? 'already_running' : 'migration_failed' },
      { status: isLockConflict ? 409 : 503 },
    )
  }
}
