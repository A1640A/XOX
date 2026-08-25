/**
 * Auth.js `signIn('credentials', ...)` istemcisi gövdeyi VARSAYILAN olarak
 * `application/x-www-form-urlencoded` gönderir; JSON da olası bir gelecek
 * biçim olarak desteklenir. `credentials` sağlayıcısının alan adı
 * `authorize()`ın beklediğiyle (`lib/auth/authorize.ts` → `loginSchema`)
 * aynı: `email`.
 *
 * GÜVENLİK DENETİMİ — BLOCKER-1 (parametre kirliliği / HTTP parameter
 * pollution): önceki sürüm form-urlencoded gövdede `URLSearchParams.get
 * ('email')` kullanıyordu — bu, ÇOKLU `email` alanı varsa İLKİNİ döner.
 * Auth.js'in KENDİSİ (`@auth/core@0.41.3` `lib/utils/web.js:14-15`,
 * `getBody()`) gövdeyi `Object.fromEntries(new URLSearchParams(await
 * req.text()))` ile ayrıştırır — bu, ÇOKLU alanda SONUNCUYU alır (bir
 * nesnede aynı anahtara art arda yazmanın doğal sonucu).
 *
 * Gövde `email=cop@x.test&password=x&email=kurban@xox.test` olduğunda
 * ESKİ kod kilit sayacını `cop@x.test`e işletiyordu, `authorize()` GERÇEKTE
 * `kurban@xox.test`e karşı argon2 koşturuyordu — kilit hiçbir zaman doğru
 * kimliğe ULAŞMIYORDU (ya da tersi: kurban kilitleniyor, saldırgan asla).
 * Kural: **hız sınırlayıcı, kimlik doğrulayıcının gördüğü şeyin AYNISINI
 * görmeli.** Bu yüzden burada da `Object.fromEntries` kullanılıyor — kendi
 * ayrıştırma kuralımızı icat ETMİYORUZ, Auth.js'inkini BİREBİR
 * tekrarlıyoruz. `packages/shared` donuk olduğu için bu iki ayrıştırıcıyı
 * TEK bir yardımcıda birleştirmek mümkün değil; ayrışma riski ileride
 * `password`/`csrfToken` gibi başka alanlar için de doğabilir — yeni bir
 * alan ayrıştırılacaksa AYNI ilke uygulanmalı.
 */
export function extractEmailFromBody(bodyText: string, contentType: string | null): string | null {
  if (contentType?.includes('application/json') === true) {
    try {
      const parsed: unknown = JSON.parse(bodyText)
      if (typeof parsed === 'object' && parsed !== null && 'email' in parsed) {
        const email = (parsed as Record<string, unknown>)['email']
        return typeof email === 'string' && email.length > 0 ? email : null
      }
      return null
    } catch {
      return null
    }
  }

  const fields = Object.fromEntries(new URLSearchParams(bodyText))
  const email = fields['email']
  return typeof email === 'string' && email.length > 0 ? email : null
}

/**
 * Auth.js v5 Credentials sağlayıcısı `authorize()` `null` dönerse HİÇBİR
 * oturum çerezi YAZMAZ (302 ile `/giris?error=CredentialsSignin`'e yönlendirir,
 * `set-cookie` başlığı YOK) — `authorize()` bir kullanıcı dönerse `authjs.
 * session-token` (HTTPS arkasında `__Secure-` önekiyle) çerezi yazılır.
 * Bu, gerçek `next dev` sunucusuna karşı curl ile İKİ YÖNLÜ ölçüldü (rapora
 * ham çıktı yapıştırıldı) — next-auth'un iç uygulama detayına bağımlı
 * KIRILGAN bir sinyal, ama `lib/auth/**`/`auth.ts`'e DOKUNMADAN (kimlik
 * katmanı dondu) başarı/başarısızlığı ayırt etmenin tek yolu bu.
 *
 * GÜVENLİK DENETİMİ — HIGH-1 (bölünmüş oturum çerezi): Auth.js JWT değeri
 * `ALLOWED_COOKIE_SIZE(4096) - ESTIMATED_EMPTY_COOKIE_SIZE(160) = 3936`
 * bayttan büyürse `SessionStore` (`@auth/core@0.41.3`
 * `lib/utils/cookie.js:118-186`) çerezi `authjs.session-token.0`,
 * `.1`, … diye PARÇALAR — tek parçalı regex bunu YAKALAMIYORDU, başarılı
 * bir giriş "başarısız" sayılıp `recordLoginFailure` çalışıyordu (yanılma
 * yönü KÖTÜ: `recordLoginSuccess` hiç tetiklenmediği için sayaç asla
 * sıfırlanmıyor — token büyüdüğü an meşru kullanıcı kendi hesabından
 * KALICI OLARAK kilitlenir). Regex artık isteğe bağlı `.<basamak>` sonekini
 * de kabul ediyor. Test (`credential-request.test.ts`) artık `@auth/core`
 * paketinin KENDİSİNDEN (kurulu `node_modules`, sürüm sabitlenmiş) BİREBİR
 * PORTLANMIŞ parçalama algoritmasıyla üretilen gerçek çok-parçalı çerez
 * adlarına karşı çalışıyor — elle uydurulmuş tek parçalı bir sahte değere
 * karşı DEĞİL (kör noktanın kök nedeni buydu).
 */
export function hasSessionCookie(response: Response): boolean {
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie')?.split(/,(?=[^;]+?=)/) ?? [])
  return cookies.some((cookie) => /(^|;\s*)(__Secure-)?authjs\.session-token(\.\d+)?=/.test(cookie))
}
