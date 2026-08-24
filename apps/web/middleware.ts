import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

/**
 * YALNIZ `auth.config.ts`'i kullanır — `./auth` (mongoose + @node-rs/argon2
 * içerir) buraya ASLA import edilmez, aksi halde build kenar çalışma
 * zamanında patlar (ADR-0009 E, gotchas.md).
 */
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: ['/oyna/:path*', '/oda/:path*', '/profil', '/siralama', '/gecmis', '/arkadaslar'],
}
