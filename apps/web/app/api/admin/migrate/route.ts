import { timingSafeEqual } from 'node:crypto'
import { connectDb, ensureIndexes, getDbName } from '@xox/db'

export const dynamic = 'force-dynamic'
/** İndeks kurulumu birden fazla `createIndex` çağrısı yapar; varsayılan 10 sn dar olabilir. */
export const maxDuration = 30

/**
 * OPS-003 · `ensureIndexes()`'in tek gerçek üretim çağıranı.
 *
 * Auth.js henüz yok (AUTH-001 sonraki dalgada), bu yüzden bu route bir oturuma
 * değil paylaşılan bir sırra dayanır: `MIGRATION_SECRET` ortam değişkeni
 * `x-migration-secret` başlığıyla eşleşmeli. Eşleşmezse (ya da sır hiç
 * tanımlı değilse) 404 dönülür — 401/403 route'un VARLIĞINI doğrulardı,
 * 404 onu gizler.
 *
 * Çağıranlar:
 * 1. `.github/workflows/e2e-preview.yml` — her preview deploy'undan sonra,
 *    e2e paketi veritabanını sıfırlayıp tohumlamadan ÖNCE bu route'u çağırır.
 *    Böylece KK-117 gibi performans sondaları ve WS-001 sorguları gerçek
 *    indekslere karşı ölçülür, COLLSCAN'e karşı değil.
 * 2. Production: otomatik bir deploy workflow'u yok (deploy'lar yalnız lead
 *    onayıyla `vercel deploy --prod` ile elle yapılıyor — bkz. CLAUDE.md).
 *    devops runbook'u: `vercel deploy --prod` sonrası bu route bir kez elle
 *    çağrılır (`docs/board/reports/OPS-003.md`).
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
    return new Response('Not Found', { status: 404 })
  }

  try {
    await connectDb()
    await ensureIndexes()
    return Response.json({ ok: true, db: getDbName(), at: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bilinmeyen hata'
    return Response.json({ ok: false, error: message }, { status: 503 })
  }
}
