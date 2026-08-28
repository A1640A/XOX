import { connectDb, MobileRefreshToken } from '@xox/db'
import { mobileRefreshBodySchema, type MobileTokenPair } from '@xox/shared'
import { verifyToken } from '@/lib/auth/tokens'
import { errorJson } from '@/lib/http/error-json'
import { logError } from '@/lib/log'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-limit'
import { rateLimitedResponse } from '@/lib/rate-limit/response'
import { issueMobileTokenPair } from '../shared'

export const dynamic = 'force-dynamic'

function readClaimJti(claims: Record<string, unknown>): string | null {
  return typeof claims['jti'] === 'string' && claims['jti'].length > 0 ? claims['jti'] : null
}

function readClaimName(claims: Record<string, unknown>): string {
  return typeof claims['name'] === 'string' ? claims['name'] : ''
}

/**
 * KK-009 mobil köprüsü (ADR-0005), adım 3/3 — DÖNDÜRMELİ (rotating) refresh.
 *
 * Tüketim TEK ATOMİK `findOneAndDelete` komutunda yapılır: sorgu filtresi
 * (`jti`+`userId`) ve silme AYNI Mongo komutunda olduğu için eşzamanlı iki
 * çağrıdan yalnız BİRİ dokümanı "bulup" silebilir — `consumeWsTicket`'ın
 * (SEC-003, `@xox/db/tickets.ts`) kullandığı AYNI tek-komut disiplini, farkı
 * "kullanılmış" işaretlemek yerine kaydı doğrudan SİLMEK (kart kriteri:
 * "eski jti mobileRefreshTokens'tan SİLİNİR").
 *
 * Silinmiş/var olmayan bir `jti` ile gelen ikinci istek (yeniden kullanım —
 * çalınmış bir refresh token'ın hem saldırgan hem gerçek kullanıcı tarafından
 * kullanılmaya çalışılması) `findOneAndDelete` `null` döndürdüğü için HER
 * ZAMAN 401 alır; imzası/`aud`/`exp` geçerli olsa bile.
 */
export async function POST(req: Request): Promise<Response> {
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

  const parsed = mobileRefreshBodySchema.safeParse(body)
  if (!parsed.success) {
    return errorJson('INVALID_MESSAGE', 'Geçersiz gövde.', 400)
  }

  const verified = await verifyToken(parsed.data.refresh, 'mobile-refresh')
  if (verified === null) {
    return errorJson('UNAUTHENTICATED', 'Geçersiz ya da süresi dolmuş refresh token.', 401)
  }

  const jti = readClaimJti(verified.claims)
  if (jti === null) {
    return errorJson('UNAUTHENTICATED', 'Geçersiz refresh token.', 401)
  }

  try {
    await connectDb()
    const deleted = await MobileRefreshToken.findOneAndDelete({
      jti,
      userId: verified.userId,
    }).lean()
    if (deleted === null) {
      return errorJson('UNAUTHENTICATED', 'Bu refresh token zaten kullanılmış ya da geçersiz.', 401)
    }

    const pair = await issueMobileTokenPair(verified.userId, readClaimName(verified.claims))
    return Response.json({
      token: pair.token,
      refresh: pair.refresh,
      expiresIn: pair.expiresIn,
    } satisfies MobileTokenPair)
  } catch (error) {
    logError('POST /api/auth/mobile/refresh hata', { userId: verified.userId }, error)
    return errorJson('SERVER_ERROR', 'Token yenilenemedi.', 500)
  }
}
