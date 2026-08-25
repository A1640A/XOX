import { cookies } from 'next/headers'
import type { Theme } from '@xox/ui-tokens'
import { THEME_COOKIE } from './theme-cookie'

/**
 * `<html data-tema>` için sunucu tarafı tema çözümü (DONDURMA #2, spec KK-083).
 *
 * `@/auth` BİLEREK import edilmez — oturum kapısı `middleware.ts`'tedir ve bu
 * kural AUTH-001 ile paralelliği koruyan tek şeydir (kart metni). `/api/profile`
 * henüz yok (W2-02), bu yüzden tema şimdilik yalnız bu çerezden okunur; profil
 * sayfasının tema değiştiricisi aynı çerezi yazacak. Oturum var/yok ayrımı
 * burada YAPILMAZ: çerez yoksa (ilk ziyaret ya da girişsiz kullanıcı) `'acik'`
 * öntanımlıdır — kart metninin "oturum yoksa 'acik'" koşulu bu yolla sağlanır.
 *
 * `THEME_COOKIE` burada export EDİLMEZ (knip "kullanılmayan export" sayar):
 * `components/profile/ProfileContent.tsx` PATCH sonrası aynı çerezi
 * (yenileme olmadan) yazmak için `./theme-cookie`'yi DOĞRUDAN import eder —
 * `next/headers` içeren BU dosyayı değil (bkz. `theme-cookie.ts` başlığı,
 * build hatasının gerekçesi). İki ayrı sabit olarak KOPYALANMADI, tek kaynak
 * `./theme-cookie`.
 */

function isTheme(value: string | undefined): value is Theme {
  return value === 'acik' || value === 'koyu'
}

export async function resolveTheme(): Promise<Theme> {
  const store = await cookies()
  const value = store.get(THEME_COOKIE)?.value
  return isTheme(value) ? value : 'acik'
}
