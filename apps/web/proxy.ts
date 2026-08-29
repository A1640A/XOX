import { NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { applySessionUser } from '@/lib/auth/session-callback'
import { authConfig } from './auth.config'
import { resolveThemeCookieValue } from './lib/theme'
import { THEME_COOKIE } from './lib/theme-cookie'

/**
 * YALNIZ `auth.config.ts`'i taban alır — `./auth` (mongoose + @node-rs/argon2
 * + Credentials sağlayıcısı) buraya ASLA doğrudan import edilmez (ADR-0009 E,
 * gotchas.md): `Credentials({ authorize })` gibi ağır/parola-doğrulayan bir
 * sağlayıcı zinciri burada GEREKSİZ, tek ihtiyaç oturumu OKUMAK.
 *
 * `callbacks.session` BURADA ayrıca tanımlanır (`auth.ts`'teki ile AYNI saf
 * yardımcı, `applySessionUser` — next-auth'a runtime bağımlılığı YOK, yalnız
 * tip import eder, bkz. `session-callback.ts` başlığı): `authConfig`'in
 * kendisi bu callback'i içermez, dolayısıyla onsuz `req.auth.user.id` HİÇ
 * dolmaz (@auth/core edge-güvenli `getSession()` yolu `session.user`'ı
 * `args[0].user ?? args[0].token`e düşürür — `.id` alanı olmayan çıplak JWT
 * payload'ı). PERF-008 için bu callback ZORUNLU: aşağıdaki tema-çerezi
 * mantığı `req.auth.user.id`'ye ihtiyaç duyuyor. `callbacks.authorized`
 * (yönlendirme kapısı) DEĞİŞMEDİ — hâlâ `authConfig`'ten aynen gelir.
 */
const { auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    session({ session, token }) {
      return applySessionUser(session, token)
    },
  },
})

/**
 * PERF-008 — W2-05, çerez yoksa `users.theme`i DB'den okuyordu ama çerezi
 * YAZABİLECEK tek yer (`ProfileContent.tsx`) yalnız `/profil`de çalışıyordu;
 * `/profil`e hiç uğramayan oturumlu bir kullanıcı bu DB okumasını KÖK
 * LAYOUT'TA HER İSTEKTE (bu proxy'nin zaten koruduğu 6 rotanın her birinde)
 * ödüyordu. Çözüm: `auth()`'u kendi middleware'imizle SARIP (`auth((req) =>
 * ...)`, next-auth'un belgelenmiş "Alternatively you can wrap your own
 * middleware" kalıbı — `index.d.ts`te doğrulandı) `req.auth` ZATEN çözülmüş
 * oturumu; çerez eksikse burada BİR KEZ DB'den okunur ve yanıta yazılır.
 * Sonraki istekte çerez zaten var → `resolveThemeCookieValue` DB'ye HİÇ
 * gitmez (fonksiyonun kendi hızlı-yol kontrolü, bkz. `lib/theme.ts`).
 *
 * Bu sarmalayıcı yalnız `authorized` `true` DÖNDÜĞÜNDE çalışır (@auth/core
 * `handleAuth`: `authorized instanceof Response` ise onu kullanır, HİÇBİR
 * ZAMAN sarmalayıcıya düşmez) — yani `req.auth` burada HER ZAMAN dolu bir
 * oturumdur; anonim ziyaretçi zaten `/giris`e yönlendirilmiş olur ve bu
 * fonksiyon hiç çağrılmaz (DB'ye anonim için gidilmediği garantisi böylece
 * `authorized` kapısından miras alınır, ayrıca kontrol ETMEYE gerek yok —
 * yine de savunmacı olsun diye `userId` boşsa `resolveThemeCookieValue`
 * `undefined` döner).
 */
export default auth(async (req) => {
  const response = NextResponse.next()

  const userId = req.auth?.user.id
  if (userId !== undefined) {
    const existingCookie = req.cookies.get(THEME_COOKIE)?.value
    const theme = await resolveThemeCookieValue(existingCookie, userId)
    if (theme !== undefined) {
      response.cookies.set(THEME_COOKIE, theme, { path: '/', sameSite: 'lax', maxAge: 31536000 })
    }
  }

  return response
})

/**
 * OPS-004: bu dosya Next.js 16'nın `middleware.ts` → `proxy.ts` dosya adı
 * geçişiyle taşındı (`middleware.ts` deprecated — `pnpm build` çıktısında
 * "The middleware file convention is deprecated. Please use proxy instead."
 * uyarısı ölçüldü, bkz. docs/board/reports/OPS-004.md). Davranış AYNI:
 * Next hâlâ tek bir kenar (edge) fonksiyonu kuruyor, yalnız dosya adı ve
 * derlenmiş çıktının etiketi (`ƒ Proxy (Middleware)`) değişti.
 *
 * PERF-008 DÜZELTMESİ: yukarıdaki cümle artık YANLIŞ — "tek bir kenar (edge)
 * fonksiyonu" OPS-004 zamanında (henüz `proxy.ts`'e taşınmamışken) doğruydu.
 * Next'in derleyicisinin kendi kaynağı (`get-page-static-info.js`,
 * `validateMiddlewareProxyExports` çevresi) artık açıkça diyor ki: "Proxy
 * always runs on Node.js runtime." Yani bu dosya ARTIK edge DEĞİL, Node.js
 * çalışma zamanındadır — `@xox/db`/mongoose'un buraya (yukarıdaki tema-çerezi
 * mantığı yoluyla, dolaylı olarak) girmesi bu YÜZDEN güvenlidir. Aynı kaynak
 * ayrıca proxy dosyalarının `export const runtime = ...` gibi bir
 * route-segment config'i KABUL ETMEDİĞİNİ söylüyor ("Route segment config is
 * not allowed in Proxy file") — o yüzden burada elle bir `runtime` ihracı
 * YOK, eklemeye çalışmak `pnpm build`'i sert biçimde kırar (canlı doğrulandı).
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
 *
 * PERF-008 matcher'ı GENİŞLETMEDİ (kart notu: genişletmenin her istekte proxy
 * çalıştırma maliyeti var) — bu 6 rota zaten oyunun TÜM oturumlu deneyimini
 * kapsıyor (`/oyna`, `/oda`, `/profil`, `/siralama`, `/gecmis`, `/arkadaslar`);
 * yalnızca ana sayfa (`/`) kapsam dışı kalır ve orada `resolveTheme`'in eski
 * (çerezsiz) DB-okuma dalı hâlâ çalışır — kart bunu "bilinen kapsam dışı
 * boşluk" olarak PERF-008.md'de kaydeder.
 */
export const config = {
  matcher: ['/oyna/:path*', '/oda/:path*', '/profil', '/siralama', '/gecmis', '/arkadaslar'],
}
