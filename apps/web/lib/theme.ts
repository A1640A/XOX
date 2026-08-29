import { cookies } from 'next/headers'
import { connectDb, User } from '@xox/db'
import type { Theme } from '@xox/ui-tokens'
import { THEME_COOKIE } from './theme-cookie'

/**
 * `<html data-tema>` için sunucu tarafı tema çözümü (DONDURMA #2, spec KK-083).
 *
 * `@/auth` BİLEREK import edilmez — oturum kapısı `proxy.ts`'tedir ve bu
 * kural AUTH-001 ile paralelliği koruyan tek şeydir (kart metni). Bu dosya
 * next-auth'un `Session` tipini de import ETMEZ; çağıran (`app/layout.tsx`)
 * kendi çözdüğü `session.user.id`'yi düz bir `string`/`Promise<string>`
 * olarak geçer — next-auth bağımlılığı yalnız çağıranda kalır.
 *
 * `THEME_COOKIE` burada export EDİLMEZ (knip "kullanılmayan export" sayar):
 * `components/profile/ProfileContent.tsx` PATCH sonrası aynı çerezi
 * (yenileme olmadan) yazmak için `./theme-cookie`'yi DOĞRUDAN import eder —
 * `next/headers` içeren BU dosyayı değil (bkz. `theme-cookie.ts` başlığı,
 * build hatasının gerekçesi). İki ayrı sabit olarak KOPYALANMADI, tek kaynak
 * `./theme-cookie`.
 *
 * W2-05 — çerez cihaza özeldir; yeni bir cihazda/tarayıcıda (çerez YOK) oturum
 * açık bir kullanıcının `users.theme` tercihi bu çereze kadar hiç uygulanmazdı
 * (bkz. W2-02 raporu "bilinen kapsam dışı boşluk"). Düzeltme SADECE çerez YOK
 * dalına DB okuması ekler:
 * 1. Çerez varsa DERHAL onunla dön — DB'ye HİÇ gidilmez (hızlı yol korunur).
 * 2. Çerez yoksa VE bir `userId` (oturum) verilmişse `users.theme` okunur.
 * 3. `userId` yoksa (anonim ziyaretçi) DB'ye HİÇ gidilmez, `'acik'` döner.
 * 4. DB sorgusu (bağlantı dahil) her ne sebeple düşerse düşsün YUTULUR —
 *    tema çözümü sayfa render'ını asla engellemez, sessizce `'acik'`e döner.
 * `userId` bir `Promise` da olabilir: `app/layout.tsx` `auth()`'u tek kez
 * çağırıp aynı promise'i hem `resolveTheme`'e hem kendi `session`
 * değişkenine paylaştırır — çerez zaten varsa bu promise `resolveTheme`
 * içinde hiç `await` edilmez, ikinci bir `auth()` çağrısı da olmaz.
 *
 * PERF-008 — `resolveTheme()`'in DB dalı `app/layout.tsx`'in HER isteği için
 * çalışıyordu, çünkü çerezi yazabilecek TEK yer (`ProfileContent.tsx`,
 * istemci) yalnız `/profil`e uğrayınca tetikleniyordu — `/profil`e hiç
 * uğramayan oturumlu bir kullanıcı bu okumayı KALICI olarak ödüyordu.
 * `lookupThemeInDb` bu yüzden ayrı bir fonksiyona çıkarıldı: hem
 * `resolveTheme` (sunucu bileşeni, `next/headers` çerezi) hem `proxy.ts`
 * (Auth.js middleware sarmalayıcısı, `NextRequest`/`NextResponse` çerezi)
 * AYNI DB okuma mantığını kullanır — iki ayrı kopya değil.
 *
 * `proxy.ts`'in DB'ye (`@xox/db`/mongoose) gitmesi GÜVENLİDİR: OPS-004 ile
 * `middleware.ts` → `proxy.ts` geçişinde Next.js'in kendi derleyicisi artık
 * "Proxy always runs on Node.js runtime" diyor (canlı kaynakta doğrulandı,
 * `next/dist/build/analysis/get-page-static-info.js`) — ADR-0009 E'nin
 * "kenar çalışma zamanı kısıtı" gerekçesi `middleware.ts` dönemi (kenar
 * varsayılan) için yazılmıştı ve `proxy.ts`'te artık GEÇERLİ DEĞİL. Proxy
 * dosyaları ayrıca `export const runtime = ...` gibi bir route-segment
 * config'i KABUL ETMEZ (aynı kaynakta doğrulandı: "Route segment config is
 * not allowed in Proxy file... Proxy always runs on Node.js runtime") —
 * yani `proxy.ts`'e elle bir `runtime` ihracı eklemeye ÇALIŞMA, `pnpm build`
 * SERT biçimde kırılır.
 */

function isTheme(value: string | undefined): value is Theme {
  return value === 'acik' || value === 'koyu'
}

type ThemeLookupResult = { ok: true; theme: Theme } | { ok: false }

/**
 * Tek DB okuma noktası. Hata YUTULUR (`ok: false`) — çağıran, hatayı nasıl
 * ele alacağına kendi bağlamında karar verir: `resolveTheme` sessizce
 * `'acik'`e düşer (sayfa render'ı asla patlamaz); `proxy.ts` ise `ok: false`
 * durumunda çerezi HİÇ YAZMAZ (bkz. `resolveThemeCookieValue`) — aksi halde
 * geçici bir Atlas kesintisinde kullanıcı YANLIŞ bir 'acik' çerezine
 * KALICI (1 yıl) olarak kilitlenir ve DB düzelse bile bir daha asla yeniden
 * denenmez (kendi kendini onarma kaybolur).
 */
async function lookupThemeInDb(userId: string): Promise<ThemeLookupResult> {
  try {
    await connectDb()
    const doc = await User.findById(userId).select('theme').lean()
    return { ok: true, theme: doc === null ? 'acik' : doc.theme }
  } catch {
    return { ok: false }
  }
}

export async function resolveTheme(userId?: string | Promise<string | undefined>): Promise<Theme> {
  const store = await cookies()
  const cookieValue = store.get(THEME_COOKIE)?.value
  if (isTheme(cookieValue)) return cookieValue

  const resolvedUserId = typeof userId === 'string' ? userId : await userId
  if (resolvedUserId === undefined || resolvedUserId.length === 0) return 'acik'

  const result = await lookupThemeInDb(resolvedUserId)
  return result.ok ? result.theme : 'acik'
}

/**
 * `proxy.ts` için: mevcut çerez zaten geçerliyse (hızlı yol) ya da DB hatası
 * varsa `undefined` döner — HİÇBİR ŞEY YAZILMASIN sinyali. Yalnız DB'den
 * BAŞARIYLA bir tema çözüldüğünde (kullanıcı silinmişse bile — bu geçerli
 * bir çözüm, `'acik'`) somut bir `Theme` döner ve çağıran bunu çereze yazar.
 * `userId` boş string OLAMAZ (proxy zaten `session.user.id` doluyken çağırır);
 * yine de savunmacı biçimde boş string'i "kullanıcı yok" sayar.
 */
export async function resolveThemeCookieValue(
  existingCookie: string | undefined,
  userId: string,
): Promise<Theme | undefined> {
  if (isTheme(existingCookie)) return undefined
  if (userId.length === 0) return undefined

  const result = await lookupThemeInDb(userId)
  return result.ok ? result.theme : undefined
}
