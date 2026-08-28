import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'
import { authorizeCredentials } from './lib/auth/authorize'
import { applySessionUser } from './lib/auth/session-callback'
import { revokeTicketsOnSignOut } from './lib/auth/signout-cleanup'

/**
 * Adapter ALANI YOK (ADR-0009 A) — Credentials sağlayıcısı kullanıcı
 * oluşturmaz, JWT stratejisinde `sessions`/`accounts` koleksiyonu
 * kullanılmaz. Kayıt ayrı bir REST uç noktasıdır (`/api/auth/register`).
 *
 * İş mantığı (`authorizeCredentials`) bilerek `./lib/auth/authorize.ts`'te
 * yaşıyor — bu dosya yalnız `next-auth` telini kurar, gerçek `next-auth`
 * paketini import ettiği için Vitest'in native ESM yükleyicisinde test
 * EDİLEMEZ (bkz. authorize.ts'teki not). Test edilebilir mantık orada.
 */
export const {
  handlers: { GET, POST },
  auth,
} = NextAuth({
  ...authConfig,
  providers: [Credentials({ authorize: authorizeCredentials })],
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * `jwt` callback'i BİLEREK tanımlanmıyor. `@auth/core`'un oturum okuma
     * yolu (`lib/actions/session.js`) `callbacks.jwt`'i her çağrıda `user`
     * ANAHTARI OLMADAN çağırıyor — `user` yalnız `signIn` (Credentials
     * authorize sonrası) yolunda gelir. Önceki sürüm `user.id !== undefined`
     * yazıyordu; bu, her oturum okumasında `TypeError: Cannot read
     * properties of undefined` fırlatıyordu, `session.js` bunu yakalayıp
     * `sessionStore.clean()` ile çerezi SİLİYORDU — kullanıcı giriş yapar
     * yapmaz ilk `auth()` çağrısında oturumu kayboluyordu (KK-006/KK-010
     * çerez dalı asla çalışmazdı). Callback zaten GEREKSİZ: `@auth/core`
     * sign-in sırasında `token.sub`'ı varsayılan olarak `user.id`'den kurar
     * (`callback/index.js`: `sub: user.id?.toString()`).
     */
    session({ session, token }) {
      return applySessionUser(session, token)
    },
  },
  events: {
    /**
     * SEC-005 — SEC-003'ün yazdığı `revokeWsTicketsForUser`ı çıkış yoluna
     * bağlar. `@auth/core`'un `session.strategy === 'jwt'` dalı bu olayı
     * yalnız `{ token }` şekliyle çağırır (`{ session }` yalnız adapter'lı
     * kurulumlarda gelir, ADR-0009 A'da adapter YOK). `token` `jwt.decode`
     * başarısız olursa `null` OLABİLİR — `revokeTicketsOnSignOut` bu durumu
     * (`undefined` `sub`) sessizce yok sayar, fırlatmaz.
     *
     * `revokeTicketsOnSignOut` KENDİSİ asla fırlatmaz (bkz. dosyasındaki
     * not) — `@auth/core`'un `signOut` uygulaması zaten bu çağrıyı bir
     * try/catch içine alıp hata olsa bile çerezi temizlemeye devam eder;
     * yani bilet iptali başarısız olsa da çıkış (AUTH-004'ün düzelttiği
     * çerez temizliği) HİÇBİR KOŞULDA geciktirilmez/kırılmaz.
     */
    async signOut(message) {
      const token = 'token' in message ? message.token : null
      await revokeTicketsOnSignOut(token?.sub)
    },
  },
})
