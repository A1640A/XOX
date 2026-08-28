import { useEffect } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { errorCodeSchema } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

/**
 * W2-06 — KK-009 mobil köprüsünün WEB ALICI UCU (`/auth`).
 *
 * Bu ekran YALNIZ web hedefinde (Expo web build) anlam taşır. Native akışta
 * `expo-web-browser`ın gerçek native implementasyonu (`ASWebAuthenticationSession`/
 * Custom Tabs) `xox://auth?...`i UYGULAMA KENDİSİNE HİÇ RENDER ETMEDEN, OS
 * seviyesinde yakalar ve `openAuthSessionAsync`in promise'ini doğrudan
 * çözer (`apps/mobile/lib/auth/browser-login.ts`) — bu dosya normal native
 * akışta HİÇ MOUNT OLMAZ.
 *
 * Web'de ise (`apps/web/app/api/auth/mobile/callback/route.ts`nin W2-06
 * yorumuna bkz) `expo-web-browser`ın GERÇEK web implementasyonu
 * (`ExpoWebBrowser.web.ts`, kaynağı okunarak doğrulandı) popup'ın nereye
 * VARDIĞINI `window.location` üzerinden okur ve `maybeCompleteAuthSession()`
 * çağrılmasını BEKLER — bu çağrı popup'ı açan pencereye `postMessage` ile
 * sonucu iletir ve popup'ı (opener üzerinden) kapattırır. Bu ekranın TEK işi
 * budur; token/refresh'i BURADA `SecureStore`a YAZMAZ — o iş `session.tsx`nin
 * `signIn()`inde, `openAuthSessionAsync`in çözdüğü `result.url`den
 * (`parseAuthCallbackUrl`, `deep-link.ts`) yapılır; bu ekran o akışın
 * DIŞINDADIR (popup içinde çalışır, opener'ın state'ine erişimi yoktur).
 *
 * `error` parametresi yalnız KULLANICIYA görünür bir mesaj göstermek için
 * okunur (ör. popup açılışı başarısız olduysa/`SERVER_ERROR` döndüyse bile
 * kullanıcı boş bir ekranda kalmasın) — akış kararını ETKİLEMEZ.
 */
export default function AuthCallbackScreen(): React.ReactElement {
  const theme = useTheme()
  const params = useLocalSearchParams<{ error?: string }>()

  useEffect(() => {
    if (Platform.OS !== 'web') return
    WebBrowser.maybeCompleteAuthSession()
  }, [])

  const parsedError = errorCodeSchema.safeParse(params.error)
  const message = parsedError.success ? tr.errors[parsedError.data] : tr.auth.mobileReturn

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={{ color: theme.text }}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
})
