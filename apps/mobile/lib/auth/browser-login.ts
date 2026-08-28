import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { getApiBaseUrl } from '../env'
import { generateAuthState, parseAuthCallbackUrl, type ParsedAuthDeepLink } from './deep-link'

/**
 * İNCE TEL (KK-009 mobil köprüsü istemci ucu, ADR-0005) — `expo-web-browser`/
 * `expo-linking` import ettiği için Vitest'te ÇALIŞTIRILAMAZ; gerçek karar
 * mantığı (`parseAuthCallbackUrl`, `generateAuthState`) next-auth'suz
 * `deep-link.ts`de yaşıyor ve ORADAN test edilir (conventions.md deseni).
 *
 * Akış (tr.auth.mobileOpening/mobileReturn burada gösterilir):
 * 1. `WebBrowser.openAuthSessionAsync` `authorize` uç noktasını (KK-009
 *    adım 1/3) bir uygulama-içi tarayıcı oturumunda açar.
 * 2. Kullanıcı oturumu YOKSA web'in KENDİ `/giris` formunu doldurur — bu
 *    ekran mobilin sahibi DEĞİLDİR (`apps/web/components/auth/GirisForm.tsx`).
 * 3. Web `xox://auth?token=&refresh=&state=`e 307 ile döner;
 *    `openAuthSessionAsync` bu şemayı (`redirectUri`) YAKALAR ve tarayıcıyı
 *    KAPATIP `{ type:'success', url }` döner — gerçek bir sayfa geçişi olmaz.
 */
export async function signInWithBrowser(): Promise<ParsedAuthDeepLink> {
  const state = generateAuthState()
  const redirectUri = Linking.createURL('auth')
  const authorizeUrl = `${getApiBaseUrl()}/api/auth/mobile/authorize?state=${encodeURIComponent(state)}`

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri)

  if (result.type !== 'success') {
    // Kullanıcı tarayıcıyı kendi kapattı (`dismiss`/`cancel`) — sessiz ağ
    // hatası DEĞİL, bilinçli vazgeçme. `INVALID_MESSAGE` burada "akış
    // tamamlanmadı" anlamında en yakın genel koddur; ekran bunu "Giriş iptal
    // edildi" gibi nötr bir mesajla gösterir (spesifik bir tr anahtarı
    // istemiyorsa `common.error` yeterli).
    return { ok: false, code: 'INVALID_MESSAGE' }
  }

  return parseAuthCallbackUrl(result.url, state)
}
