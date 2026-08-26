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
  const authenticated = hasSessionCookie(response)

  if (email !== null) {
    if (authenticated) {
      await recordLoginSuccess(email, ip)
    } else {
      await recordLoginFailure(email, ip)
    }
  }

  if (authenticated) {
    return response
  }

  /**
   * AUTH-002 / KK-005 — `@auth/core@0.41.3` (`src/index.ts`, `~172. satır`:
   * `return Response.json({ url }, { headers: response.headers })`) istemci
   * `X-Auth-Return-Redirect` başlığını gönderdiğinde (next-auth'un `signIn(...,
   * { redirect: false })`'ı HER ZAMAN gönderir) başarı/başarısızlık FARK
   * ETMEKSİZİN durum kodunu 200'E SABİTLER — bu bir hata değil, Auth.js'in
   * KASITLI istemci sözleşmesi: `next-auth/react.js`'in `signIn()` fonksiyonu
   * `res.json()`'u `res.ok`'a bakmadan okur, hatayı `data.url`'deki
   * `?error=` parametresinden çıkarır (bkz. `credential-request.ts` başı).
   *
   * `lib/auth/**`/`auth.ts`'e (donuk katman) HİÇ DOKUNMADAN, bu sarmalayıcının
   * zaten SEC-002 için hesapladığı `hasSessionCookie` sinyalini burada da
   * kullanıp durum kodunu 401'e ÇEVİRİYORUZ. Gövde ve başlıklar (dolayısıyla
   * `data.url` ve içindeki `error`/`code`) DEĞİŞMİYOR — `signIn()` istemcisi
   * hata mesajını aynı şekilde okumaya devam eder; `res.ok` artık `false`
   * olur ki bu DAHA DOĞRUDUR (başarısız girişte gereksiz `_getSession()`
   * çağrısı artık tetiklenmez, bkz. `react.js`: `if (res.ok) { ...
   * _getSession() }`).
   *
   * Bu dönüşüm yalnız `/callback/credentials`e özel bu dalda uygulanır —
   * `authorize()`ın kendisine veya diğer NextAuth eylemlerine (session,
   * csrf, signout, …) dokunmaz.
   */
  return new Response(response.body, {
    status: 401,
    headers: response.headers,
  })
}
