import { cookies } from 'next/headers'
import { connectDb, User } from '@xox/db'
import type { Theme } from '@xox/ui-tokens'
import { THEME_COOKIE } from './theme-cookie'

/**
 * `<html data-tema>` için sunucu tarafı tema çözümü (DONDURMA #2, spec KK-083).
 *
 * `@/auth` BİLEREK import edilmez — oturum kapısı `middleware.ts`'tedir ve bu
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
 * değişkenine paylaştırır — çerez zaten varsa bu promise hiç `await`
 * edilmez, ikinci bir `auth()` çağrısı da olmaz.
 */

function isTheme(value: string | undefined): value is Theme {
  return value === 'acik' || value === 'koyu'
}

export async function resolveTheme(userId?: string | Promise<string | undefined>): Promise<Theme> {
  const store = await cookies()
  const cookieValue = store.get(THEME_COOKIE)?.value
  if (isTheme(cookieValue)) return cookieValue

  const resolvedUserId = typeof userId === 'string' ? userId : await userId
  if (resolvedUserId === undefined || resolvedUserId.length === 0) return 'acik'

  try {
    await connectDb()
    const doc = await User.findById(resolvedUserId).select('theme').lean()
    return doc === null ? 'acik' : doc.theme
  } catch {
    return 'acik'
  }
}
