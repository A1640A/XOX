import { cookies } from 'next/headers'
import type { Theme } from '@xox/ui-tokens'

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
 * `THEME_COOKIE` bilerek export EDİLMEZ: knip "kullanılmayan export" sayar
 * (bu dosya dışında hiçbir tüketici yok — profil tema değiştiricisi W2-02'de
 * yazılacak). O görev çerez adını burada TEKRAR export ederek tüketmeli;
 * iki ayrı sabit olarak KOPYALANMAMALI.
 */
const THEME_COOKIE = 'xox-tema'

function isTheme(value: string | undefined): value is Theme {
  return value === 'acik' || value === 'koyu'
}

export async function resolveTheme(): Promise<Theme> {
  const store = await cookies()
  const value = store.get(THEME_COOKIE)?.value
  return isTheme(value) ? value : 'acik'
}
