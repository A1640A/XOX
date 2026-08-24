import type { DefaultSession } from 'next-auth'

/**
 * Auth.js'in resmi genişletme kalıbı — `session.user.id` varsayılan tipte yok.
 * `auth.ts`'teki `session` callback'i `token.sub`'ı buraya yazar.
 */
declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}
