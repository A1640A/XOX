import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'
import { authorizeCredentials } from './lib/auth/authorize'
import { applySessionUser } from './lib/auth/session-callback'

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
})
