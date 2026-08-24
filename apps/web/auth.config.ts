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

/**
 * `middleware.ts`'in `config.matcher`'ıyla BİREBİR AYNI OLMAK ZORUNDA liste.
 * `middleware.ts`'e IMPORT EDİLEMEZ — denendi, Next.js Turbopack derleyicisi
 * "matcher needs to be a static string or array of static strings" diyerek
 * reddetti (canlı `pnpm build` hatasıyla kanıtlandı, `middleware.ts`'teki
 * nota bak); `matcher` orada AYRICA, literal olarak elle yazılmak zorunda.
 *
 * Bu listenin varlık nedeni: `middleware.ts` `next-auth` import ettiği için
 * Vitest'te ÇALIŞTIRILAMIYOR (next-auth'un derlenmiş çıktısı `next/server`'ı
 * uzantısız import ediyor — gotchas.md). Bir kaynak-metin sondası
 * (`readFileSync` + `toContain`) tek başına dizinin SESSİZCE kısaltılmasını
 * ya da fazladan girdi eklenmesini güvenilir biçimde yakalamaz. Bu listeyi
 * (next-auth'suz, gerçekten import edilebilir bir dosyada) tanımlayıp
 * `middleware.test.ts`te `toStrictEqual` ile hem kendisine (elle yazılmış
 * kart listesine) hem `middleware.ts`ten ayrıştırılan literale karşı
 * kilitlemek mümkün oluyor — ikisi arasında sessiz bir sapma artık testte
 * görünür.
 *
 * `PROTECTED_ROUTE_PREFIXES`ten MEKANİK türetilmez: `/oyna` ve `/oda` alt-rota
 * alır (`:path*`), diğer dördü tek sayfadır — elle yazılır, kart metniyle
 * testte birebir karşılaştırılır.
 */
export const MIDDLEWARE_MATCHER = [
  '/oyna/:path*',
  '/oda/:path*',
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
