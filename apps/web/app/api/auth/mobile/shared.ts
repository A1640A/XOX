import { randomUUID } from 'node:crypto'
import { connectDb, MobileRefreshToken } from '@xox/db'
import { z } from 'zod'
import { signToken } from '@/lib/auth/tokens'

/**
 * KK-009 mobil köprüsü (ADR-0005). `state` istemcinin ürettiği opak bir
 * CSRF/eşleştirme değeridir — sunucu onu YALNIZ TAŞIR, anlamını yorumlamaz.
 * Boş değeri reddediyoruz ki `xox://auth?state=` gibi anlamsız bir deep link
 * hiç üretilmesin (istemci tarafı eşleştirmesi state boşsa güvenilmez olur).
 */
export const mobileStateSchema = z.string().min(1).max(256)

export interface MobileTokenPairIssued {
  readonly token: string
  readonly refresh: string
  readonly expiresIn: number
}

/**
 * Access + refresh çiftini üretir ve refresh'in `jti`sini `@xox/db`'ye
 * `mobileRefreshTokens` koleksiyonuna yazar (ADR-0005 döndürmeli refresh).
 *
 * `signToken`'ın `jti` üretimi BİLEREK yalnız `'ws-ticket'` türü için var
 * (SEC-003, `apps/web/lib/auth/tokens.ts` — bu dosyanın çakışma kümesi
 * DIŞINDA, dokunulmadı). Burada kendi `jti`mizi üretip `extraClaims.jti`
 * olarak gömüyoruz — `jose`nin `SignJWT` yapıcısı payload'ı doğrudan JSON
 * nesnesi olarak işler, `jti` kayıtlı bir iddia adı olduğu için `.setJti()`
 * çağrılmadan da aynı biçimde okunur/yazılır (`verifyToken`'ın döndürdüğü
 * `claims` ham payload'ın kendisidir).
 */
export async function issueMobileTokenPair(
  userId: string,
  name: string,
): Promise<MobileTokenPairIssued> {
  const jti = randomUUID()
  const [access, refresh] = await Promise.all([
    signToken('mobile-access', userId, { name }),
    signToken('mobile-refresh', userId, { name, jti }),
  ])

  await connectDb()
  await MobileRefreshToken.create({
    jti,
    userId,
    expiresAt: new Date(Date.now() + refresh.expiresIn * 1000),
  })

  return { token: access.token, refresh: refresh.token, expiresIn: access.expiresIn }
}

/** Deep link'e gömülecek ölçüde küçük, URL-güvenli hata kodu seti. */
export type MobileBridgeErrorCode = 'UNAUTHENTICATED' | 'INVALID_MESSAGE' | 'SERVER_ERROR'

/** `xox://auth?error=<kod>&state=<state>` — istemci tarafı bunu KK-093 akışında yorumlar. */
export function mobileErrorDeepLink(code: MobileBridgeErrorCode, state: string): string {
  const url = new URL('xox://auth')
  url.searchParams.set('error', code)
  if (state.length > 0) url.searchParams.set('state', state)
  return url.toString()
}

/**
 * `Response.redirect(url, status)` KULLANILMAZ: WHATWG fetch'in bazı
 * çalışma zamanı uygulamaları (undici dahil) yönlendirme hedefinin
 * `http`/`https` şemasında olmasını BEKLER ve özel şema (`xox://`) verilirse
 * `TypeError` fırlatabilir — canlı davranış dokümante değil, riske girmemek
 * için `Location` başlığını ELLE yazan düz bir `Response` kullanılıyor
 * (WHATWG Location başlığının kendisi şema kısıtlamıyor).
 */
export function redirectResponse(location: string, status = 307): Response {
  return new Response(null, { status, headers: { Location: location } })
}
