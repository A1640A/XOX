import { NextResponse } from 'next/server'
import type { NextAuthConfig } from 'next-auth'

/**
 * Korunan rotalar (KK-007). ELLE yazılır — `middleware.ts`'in `config.matcher`'ından
 * TÜRETİLMEZ; aksi halde biri buradan silinirse hem matcher hem bu liste aynı anda
 * kör kalır ve hiçbir test bunu yakalayamaz (gotchas.md "kendine-referanslı test").
 */
export const PROTECTED_ROUTE_PREFIXES = [
  '/oyna',
  '/oda',
  '/profil',
  '/siralama',
  '/gecmis',
  '/arkadaslar',
] as const

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/**
 * Kenar-güvenli yapılandırma (ADR-0009 E). `mongoose` / `@node-rs/argon2` gibi
 * yerel ikili gerektiren HİÇBİR şey import etmez — `middleware.ts` bunu doğrudan
 * kullanır ve build kenar çalışma zamanında patlamaz.
 */
export const authConfig = {
  pages: { signIn: '/giris' },
  // Bu katmanda gerçek bir sağlayıcı yok; `auth.ts` `Credentials` ile genişletir.
  providers: [],
  callbacks: {
    authorized({ request, auth }): boolean | NextResponse {
      if (!isProtectedPath(request.nextUrl.pathname)) return true
      if (auth?.user) return true

      const donus = `${request.nextUrl.pathname}${request.nextUrl.search}`
      const redirectUrl = new URL(
        `/giris?donus=${encodeURIComponent(donus)}`,
        request.nextUrl.origin,
      )
      return NextResponse.redirect(redirectUrl, 307)
    },
  },
} satisfies NextAuthConfig
