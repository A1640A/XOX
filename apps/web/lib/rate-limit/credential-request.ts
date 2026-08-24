/**
 * Auth.js `signIn('credentials', ...)` istemcisi gövdeyi VARSAYILAN olarak
 * `application/x-www-form-urlencoded` gönderir; JSON da olası bir gelecek
 * biçim olarak desteklenir. `credentials` sağlayıcısının alan adı
 * `authorize()`ın beklediğiyle (`lib/auth/authorize.ts` → `loginSchema`)
 * aynı: `email`.
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

  const params = new URLSearchParams(bodyText)
  const email = params.get('email')
  return email !== null && email.length > 0 ? email : null
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
 */
export function hasSessionCookie(response: Response): boolean {
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie')?.split(/,(?=[^;]+?=)/) ?? [])
  return cookies.some((cookie) => /(^|;\s*)(__Secure-)?authjs\.session-token=/.test(cookie))
}
