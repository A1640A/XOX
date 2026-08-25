import { NextRequest } from 'next/server'
import { GET, POST as authPOST } from '@/auth'
import { extractEmailFromBody, hasSessionCookie } from '@/lib/rate-limit/credential-request'
import {
  getLoginLockStatus,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/rate-limit/credential-lockout'
import { checkIpRateLimit, extractClientIp } from '@/lib/rate-limit/ip-limit'
import { rateLimitedResponse } from '@/lib/rate-limit/response'

export { GET }

/**
 * SEC-002 — bu dosya `auth.ts`/`lib/auth/**`'e HİÇ DOKUNMAZ (kimlik katmanı
 * dondu, iki kez oturum çerezini sessizce silen bir hataya yol açmıştı);
 * yalnız `@/auth`'un zaten dışa verdiği `POST`'u bu ince telde SARAR.
 *
 * İKİ ayrı savunma burada birleşiyor:
 *
 * (a) IP başına kaba hız sınırı — TÜM `/api/auth/*` POST'ları (csrf/session
 *     GET'leri ETKİLENMEZ, onlar zaten argon2 çalıştırmıyor).
 * (b) `/api/auth/callback/credentials`e ÖZEL kimlik başına kilit — argon2id
 *     ÇALIŞMADAN ÖNCE kilitli kimlik kısa devre yapılır (KK: kilitli bir
 *     hesaba yağan istek artık pahalı hash'i hiç ödemiyor). İKİ KATMANLI
 *     (hesap-geneli + e-posta+IP bileşik, HIGH-2 — bkz. `credential-
 *     lockout.ts` dosya başı yorumu); `ip` bu yüzden `checkIpRateLimit`ten
 *     BAĞIMSIZ ayrıca hesaplanıyor (`extractClientIp`, aynı BLOCKER-2
 *     düzeltmesini paylaşıyor — uydurma XFF'e karşı bağışık).
 *
 * Başarı/başarısızlık ayrımı `authorize()`ın DÖNÜŞ DEĞERİNE değil, gerçek
 * NextAuth yanıtının `set-cookie` başlığına bakılarak yapılır (bkz.
 * `credential-request.ts`) — `authorize()`ın kendisine dokunmadan.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ipLimit = await checkIpRateLimit(req, 'auth-write')
  if (!ipLimit.allowed) {
    return rateLimitedResponse({
      message: 'Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin.',
      retryAfterSeconds: ipLimit.retryAfterSeconds,
      limit: ipLimit.limit,
      remaining: ipLimit.remaining,
    })
  }

  const pathname = new URL(req.url).pathname
  if (!pathname.endsWith('/callback/credentials')) {
    return authPOST(req)
  }

  const bodyText = await req.text()
  const email = extractEmailFromBody(bodyText, req.headers.get('content-type'))
  const ip = extractClientIp(req)

  if (email !== null) {
    const lock = await getLoginLockStatus(email, ip)
    if (lock.locked) {
      /**
       * Mesaj var-olmayan/var-olan hesap arasında AYIRT ETMEZ — sayaç
       * `User` koleksiyonuna hiç bakmadan yalnız ham kimlik dizesine göre
       * işler (KK: kullanıcı numaralandırması kapalı kalır).
       */
      return rateLimitedResponse({
        message: 'Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin.',
        retryAfterSeconds: lock.retryAfterSeconds,
      })
    }
  }

  const forwardedRequest = new NextRequest(req.url, {
    method: 'POST',
    headers: req.headers,
    body: bodyText,
  })
  const response = await authPOST(forwardedRequest)

  if (email !== null) {
    if (hasSessionCookie(response)) {
      await recordLoginSuccess(email, ip)
    } else {
      await recordLoginFailure(email, ip)
    }
  }

  return response
}
