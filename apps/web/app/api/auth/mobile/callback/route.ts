import { auth } from '@/auth'
import { logError } from '@/lib/log'
import {
  issueMobileTokenPair,
  mobileErrorDeepLink,
  mobileStateSchema,
  redirectResponse,
} from '../shared'

export const dynamic = 'force-dynamic'

/**
 * KK-009 mobil köprüsü (ADR-0005), adım 2/3.
 *
 * Yalnız `/api/auth/mobile/authorize`in OTURUMLU dalından ulaşılır ama
 * doğrudan ziyaret (ör. eski bir sekme) oturumsuz gelebilir — bu durumda
 * `authorize`yle AYNI kuralı uygular: `/giris?donus=<bu-URL>`e döner, giriş
 * sonrası akış buraya devam eder. Döngü RİSKİ yok: `authorize` yalnız
 * oturumluyken buraya yönlendirir, buraya oturumsuz gelen tek yol doğrudan
 * ziyarettir ve o da aynı `/giris` yoluna düşer.
 *
 * Oturum VARSA: access+refresh çifti üretilir (`issueMobileTokenPair`,
 * ADR-0005 döndürmeli refresh — jti `mobileRefreshTokens`e yazılır) ve
 * `xox://auth?token=&refresh=&state=` deep link'i ile mobil uygulamaya
 * dönülür. `expo-secure-store`a yazma işi İSTEMCİ tarafıdır (bu uç nokta
 * hiçbir token'ı kalıcı olarak KENDİSİ saklamaz, yalnız refresh'in `jti`sini
 * tek-kullanımlık döndürme takibi için tutar).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const parsedState = mobileStateSchema.safeParse(url.searchParams.get('state'))
  const state = parsedState.success ? parsedState.data : ''

  const session = await auth()
  const userId = session?.user.id

  if (userId === undefined || userId.length === 0) {
    const donus = `${url.pathname}${url.search}`
    const giris = new URL(`/giris?donus=${encodeURIComponent(donus)}`, url.origin)
    return Response.redirect(giris, 307)
  }

  try {
    const pair = await issueMobileTokenPair(userId, session?.user.name ?? '')
    const deepLink = new URL('xox://auth')
    deepLink.searchParams.set('token', pair.token)
    deepLink.searchParams.set('refresh', pair.refresh)
    deepLink.searchParams.set('state', state)
    return redirectResponse(deepLink.toString())
  } catch (error) {
    logError('GET /api/auth/mobile/callback hata', { userId }, error)
    return redirectResponse(mobileErrorDeepLink('SERVER_ERROR', state))
  }
}
