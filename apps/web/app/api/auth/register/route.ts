import { randomUUID } from 'node:crypto'
import { connectDb, User } from '@xox/db'
import {
  registerBodySchema,
  type ErrorCode,
  type ErrorResponse,
  type RegisterBody,
} from '@xox/shared'
import { hashPassword } from '@/lib/auth/password'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-limit'
import { rateLimitedResponse } from '@/lib/rate-limit/response'

export const dynamic = 'force-dynamic'

/**
 * RFC 5321 §4.5.3.1.3 — e-posta yolu (`Reverse-path`/`Forward-path`) en fazla
 * 256 sekizli, `<`/`>` çerçevesi düşülünce fiilen 254. `emailSchema`
 * (`@xox/shared`, bu görevde DONDU) üst sınır tanımlamıyor; Mongo'nun
 * `email_1` benzersiz indeksi ~1024 baytlık anahtar sınırını AŞAN bir değer
 * `E11000` DIŞI bir hata fırlatır → `isDuplicateKeyError` false döner →
 * 500 (güvenlik denetimi bulgusu). Sınır burada, route seviyesinde,
 * savunma amaçlı uygulanıyor; kalıcı çözüm `emailSchema.max(254)`.
 */
const MAX_EMAIL_LENGTH = 254

function fieldErrorCode(field: unknown): ErrorCode {
  if (field === 'email') return 'INVALID_EMAIL'
  if (field === 'password') return 'WEAK_PASSWORD'
  if (field === 'displayName') return 'INVALID_NAME'
  return 'INVALID_MESSAGE'
}

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  )
}

/**
 * KK-001…004 — Auth.js Credentials sağlayıcısı kullanıcı OLUŞTURMAZ; kayıt bu
 * ayrı REST uç noktasıdır (ADR-0009 B). Doğrulama istemciden bağımsız: gövde
 * her zaman `registerBodySchema`'dan geçer, kullanıcı girdisi hiçbir zaman
 * doğrudan Mongo sorgu nesnesine girmez.
 */
export async function POST(req: Request): Promise<Response> {
  /**
   * SEC-002 (a) — IP başına kaba hız sınırı, gövdeyi ayrıştırmadan/DB'ye
   * dokunmadan ÖNCE. Kayıt argon2id hash'ini ÖDER (var olan e-posta ön
   * kontrolü hariç); bu satır o maliyete ULAŞMADAN önce IP akınını keser.
   */
  const ipLimit = await checkIpRateLimit(req, 'auth-write')
  if (!ipLimit.allowed) {
    return rateLimitedResponse({
      message: 'Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.',
      retryAfterSeconds: ipLimit.retryAfterSeconds,
      limit: ipLimit.limit,
      remaining: ipLimit.remaining,
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorJson('INVALID_MESSAGE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
  }

  const parsed = registerBodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const code = fieldErrorCode(issue?.path[0])
    return errorJson(code, 'Geçersiz kayıt bilgisi.', 400)
  }

  const { email, password, displayName }: RegisterBody = parsed.data

  if (email.length > MAX_EMAIL_LENGTH) {
    return errorJson('INVALID_EMAIL', 'Geçersiz kayıt bilgisi.', 400)
  }

  try {
    await connectDb()

    /**
     * KK-002 hızlı yol (güvenlik denetimi madde 5): pahalı argon2id hash'i
     * (19 MiB bellek + ~100ms CPU) hesaplamadan ÖNCE ucuz bir varlık
     * kontrolü yapılır. ZATEN kayıtlı bir e-postaya yağdırılan istekler
     * (probing/DoS) artık tam maliyeti ödemiyor. Bu, DOĞRULUK için TEK
     * mekanizma DEĞİL — eşzamanlı iki isteğin ikisi de bu kontrolü "boş"
     * görebileceği yarış penceresi hâlâ var; nihai/atomik doğruluk aşağıdaki
     * unique indeks + `E11000` yakalamasından gelir (ADR-0009'un reddettiği
     * "yalnız önce-oku" alternatifi burada YOK, bu yalnız bir performans
     * ön-filtresi).
     */
    const existing = await User.findOne({ email }).select('_id').lean()
    if (existing !== null) {
      return errorJson('EMAIL_TAKEN', 'Bu e-posta zaten kayıtlı.', 409)
    }

    const passwordHash = await hashPassword(password)
    const created = await User.create({
      _id: randomUUID(),
      name: displayName,
      email,
      passwordHash,
    })
    return Response.json({ userId: created._id }, { status: 201 })
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return errorJson('EMAIL_TAKEN', 'Bu e-posta zaten kayıtlı.', 409)
    }
    return errorJson('SERVER_ERROR', 'Kayıt sırasında bir hata oluştu.', 500)
  }
}
