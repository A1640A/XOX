import { auth } from '@/auth'
import { mobileStateSchema } from '../shared'

export const dynamic = 'force-dynamic'

/**
 * KK-009 mobil köprüsü (ADR-0005), adım 1/3.
 *
 * Mobil istemci (`expo-auth-session`/`expo-web-browser`) bu adresi bir
 * tarayıcı oturumunda açar. Bu uç nokta yalnız bir SEÇİM YAPAR — token
 * ÜRETMEZ (bu, `callback`'in işi):
 *
 * - Oturum YOKSA `/giris?donus=<bu-URL>` — kullanıcı web'in KENDİ giriş
 *   formunu doldurur (`GirisForm.tsx`, bu görevin çakışma kümesi DIŞINDA,
 *   dokunulmadı); başarılı girişten sonra `router.push(donus)` bizi BURAYA
 *   geri getirir ve bu kez oturum VARDIR.
 * - Oturum VARSA `/api/auth/mobile/callback`e devreder.
 *
 * `state` sunucunun anlamlandırmadığı opak bir değerdir — yalnız taşınır.
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

  const callback = new URL('/api/auth/mobile/callback', url.origin)
  callback.searchParams.set('state', state)
  return Response.redirect(callback, 307)
}
