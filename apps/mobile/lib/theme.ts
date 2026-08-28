import { useColorScheme } from 'react-native'
import { nativeColors, type ColorToken, type Theme } from '@xox/ui-tokens'

/**
 * `react-native`'in `useColorScheme` (işletim sistemi tercihi) TEK kaynaktır
 * — web tarafının `data-tema` + kullanıcı tercihi kalıcılığı (profil ekranı,
 * `apps/web/lib/theme.ts`) bu görevin KAPSAMI DIŞINDA (mobil profil ekranı
 * yalnız iskelet). `nativeColors`/`themes` `@xox/ui-tokens`tan gelir — renk
 * DEĞERİ elle yazılmaz (kart değişmezi).
 */
export function useTheme(): Readonly<Record<ColorToken, string>> {
  const scheme = useColorScheme()
  const theme: Theme = scheme === 'dark' ? 'koyu' : 'acik'
  return nativeColors(theme)
}
