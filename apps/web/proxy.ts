import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

/**
 * YALNIZ `auth.config.ts`'i kullanır — `./auth` (mongoose + @node-rs/argon2
 * içerir) buraya ASLA import edilmez, aksi halde build kenar çalışma
 * zamanında patlar (ADR-0009 E, gotchas.md).
 */
const { auth } = NextAuth(authConfig)

export default auth

/**
 * OPS-004: bu dosya Next.js 16'nın `middleware.ts` → `proxy.ts` dosya adı
 * geçişiyle taşındı (`middleware.ts` deprecated — `pnpm build` çıktısında
 * "The middleware file convention is deprecated. Please use proxy instead."
 * uyarısı ölçüldü, bkz. docs/board/reports/OPS-004.md). Davranış AYNI:
 * Next hâlâ tek bir kenar (edge) fonksiyonu kuruyor, yalnız dosya adı ve
 * derlenmiş çıktının etiketi (`ƒ Proxy (Middleware)`) değişti.
 *
 * DENENDİ VE BAŞARISIZ OLDU: `matcher: [...MIDDLEWARE_MATCHER]` (auth.config.ts'ten
 * import) — Next.js Turbopack derleyicisi SERT reddetti: "Next.js can't
 * recognize the exported `config` field in route. `matcher` needs to be a
 * static string or array of static strings" (canlı `pnpm build` hatasıyla
 * doğrulandı). Yani bu dizi BURADA, literal olarak, elle yazılmak ZORUNDA.
 *
 * Tek doğruluk kaynağı yine de var: `auth.config.ts`teki `MIDDLEWARE_MATCHER`
 * BİREBİR AYNI listeyi taşır ve `proxy.test.ts` (eski adıyla `middleware.test.ts`)
 * ikisinin (bu dosyanın kaynak metninden ayrıştırılan literal ile
 * `MIDDLEWARE_MATCHER`'ın) TAM eşit olduğunu gerçek bir `toStrictEqual` ile
 * kilitler — yalnızca `toContain` değil, çünkü Next'in kendisi
 * computed/sarmalanmış bir matcher'ı zaten build-time'da reddediyor
 * (yukarıdaki başarısız deneme bunu kanıtladı).
 */
export const config = {
  matcher: ['/oyna/:path*', '/oda/:path*', '/profil', '/siralama', '/gecmis', '/arkadaslar'],
}
