import { auth } from '@/auth'
import { logError } from '@/lib/log'
import {
  issueMobileTokenPair,
  mobileErrorDeepLink,
  mobileStateSchema,
  redirectResponse,
  type MobileBridgeErrorCode,
} from '../shared'

export const dynamic = 'force-dynamic'

/**
 * W2-06: web hedefinde (Expo web build) `xox://` bir şey İFADE ETMEZ —
 * tarayıcı bilinmeyen bir şemaya top-level yönlendirmeyi "sayfaya
 * ulaşılamıyor" hatasıyla gösterir (E2E-005'te gerçek Chromium'da ölçüldü).
 * `expo-web-browser`ın GERÇEK web implementasyonu (`ExpoWebBrowser.web.ts`,
 * kaynağı okunarak doğrulandı) `redirectUrl`ı SUNUCUYA HİÇ GÖNDERMEZ —
 * yalnız açan pencerenin KENDİ `localStorage`'ında saklar ve popup'ın
 * NEREYE VARDIĞINI (`window.location`) sonradan `maybeCompleteAuthSession()`
 * ile karşılaştırır. Yani sunucunun doğru web sayfasına (`/auth`) dönebilmesi
 * için istemcinin bunu AÇIKÇA `redirect_uri` parametresiyle TALEP ETMESİ
 * gerekir — `apps/mobile/lib/auth/browser-login.ts`nin bunu `authorize`
 * isteğine eklemesi ve `authorize`nin bunu `callback`e taşıması AYRI, bu
 * görevin çakışma kümesi DIŞINDA bir değişikliktir (raporda "kapsam dışı
 * gerekli değişiklik" olarak işaretlendi); burada YALNIZ ALICI UÇ (`callback`)
 * hazırlanıyor — parametre bugün hiçbir yerden gelmese bile, geldiğinde
 * güvenli şekilde işlenir.
 *
 * GÜVENLİK (açık yönlendirme DEĞİL): `redirect_uri` asla doğrudan Location
 * başlığına yazılmaz. Yalnız SABİT bir allowlist'e (`ALLOWED_WEB_AUTH_ORIGINS`,
 * env `MOBILE_WEB_AUTH_ORIGINS`) karşı TAM origin eşleşmesi + `/auth` path'i
 * sınanır (`resolveWebRedirectTarget`); eşleşmezse parametre YOK SAYILIR ve
 * akış bugünkü TEK davranışa (`xox://auth`) düşer. Yani bu sinyalin saldırgan
 * tarafından "serbestçe" seçilmesinin sonucu EN FAZLA "bugünkü davranış"tır —
 * hiçbir zaman yeni bir hedefe (bizim sahip olmadığımız bir origin'e)
 * yönlendirme AÇMAZ; eşleşen tek durumda bile hedef zaten ops onaylı,
 * bizim kontrolümüzdeki bir origin'dir.
 */
const ALLOWED_WEB_AUTH_ORIGINS = (process.env['MOBILE_WEB_AUTH_ORIGINS'] ?? 'http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0)

/**
 * `redirect_uri` yalnızca ALLOWLIST'teki bir origin'in TAM `/auth` yoluna
 * eşitse kabul edilir; aksi halde (eşleşmeyen origin, farklı path, geçersiz
 * URL, `http`/`https` dışı şema) `null` döner — çağıran taraf bunu "istek
 * yok" gibi ele alır. Dönüş değeri KASITLI OLARAK `parsed`in kendisi değil,
 * `origin`+`pathname`den yeniden kurulmuş TEMİZ bir URL'dir — istemcinin
 * `redirect_uri`ye iliştirebileceği rastgele bir query string bizim ürettiğimiz
 * yönlendirmeye asla taşınmaz.
 */
function resolveWebRedirectTarget(rawRedirectUri: string | null): URL | null {
  if (rawRedirectUri === null || rawRedirectUri.length === 0) return null

  let parsed: URL
  try {
    parsed = new URL(rawRedirectUri)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.pathname !== '/auth') return null
  if (!ALLOWED_WEB_AUTH_ORIGINS.includes(parsed.origin)) return null

  return new URL(`${parsed.origin}/auth`)
}

/** Native (`xox://auth`) ya da doğrulanmış web hedefi — ikisi için ORTAK hata URL'si üretir. */
function errorRedirectTarget(
  webTarget: URL | null,
  code: MobileBridgeErrorCode,
  state: string,
): string {
  if (webTarget === null) return mobileErrorDeepLink(code, state)
  const target = new URL(webTarget.toString())
  target.searchParams.set('error', code)
  if (state.length > 0) target.searchParams.set('state', state)
  return target.toString()
}

/**
 * KK-009 mobil köprüsü (ADR-0005), adım 2/3.
 *
 * Yalnız `/api/auth/mobile/authorize`in OTURUMLU dalından ulaşılır ama
 * doğrudan ziyaret (ör. eski bir sekme) oturumsuz gelebilir — bu durumda
 * `authorize`yle AYNI kuralı uygular: `/giris?donus=<bu-URL>`e döner, giriş
 * sonrası akış buraya devam eder. Döngü RİSKİ yok: `authorize` yalnız
 * oturumluyken buraya yönlendirir, buraya oturumsuz gelen tek yol doğrudan
 * ziyarettir ve o da aynı `/giris` yoluna düşer. `donus` tüm sorgu dizesini
 * (dolayısıyla varsa `redirect_uri`yi de) TAŞIR — giriş sonrası akış aynı
 * hedefe geri döner.
 *
 * Oturum VARSA: access+refresh çifti üretilir (`issueMobileTokenPair`,
 * ADR-0005 döndürmeli refresh — jti `mobileRefreshTokens`e yazılır) ve
 * `redirect_uri` GEÇERLİ bir allowlist eşleşmesiyse o web hedefine, aksi
 * halde (bugünkü tek davranış, native akış) `xox://auth?token=&refresh=&state=`
 * deep link'i ile mobil uygulamaya dönülür. `expo-secure-store`a yazma işi
 * İSTEMCİ tarafıdır (bu uç nokta hiçbir token'ı kalıcı olarak KENDİSİ
 * saklamaz, yalnız refresh'in `jti`sini tek-kullanımlık döndürme takibi
 * için tutar).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const parsedState = mobileStateSchema.safeParse(url.searchParams.get('state'))
  const state = parsedState.success ? parsedState.data : ''
  const webTarget = resolveWebRedirectTarget(url.searchParams.get('redirect_uri'))

  const session = await auth()
  const userId = session?.user.id

  if (userId === undefined || userId.length === 0) {
    const donus = `${url.pathname}${url.search}`
    const giris = new URL(`/giris?donus=${encodeURIComponent(donus)}`, url.origin)
    return Response.redirect(giris, 307)
  }

  try {
    const pair = await issueMobileTokenPair(userId, session?.user.name ?? '')
    const target = webTarget ?? new URL('xox://auth')
    target.searchParams.set('token', pair.token)
    target.searchParams.set('refresh', pair.refresh)
    target.searchParams.set('state', state)
    return redirectResponse(target.toString())
  } catch (error) {
    logError('GET /api/auth/mobile/callback hata', { userId }, error)
    return redirectResponse(errorRedirectTarget(webTarget, 'SERVER_ERROR', state))
  }
}
