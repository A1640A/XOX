import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'
import { authorizeCredentials } from './lib/auth/authorize'

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
    jwt({ token, user }) {
      if (user.id !== undefined) {
        token.sub = user.id
      }
      return token
    },
    session({ session, token }) {
      if (token.sub !== undefined) {
        session.user.id = token.sub
      }
      return session
    },
  },
})
