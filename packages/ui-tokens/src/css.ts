import { type ColorToken, type Theme, themes } from './colors'
import { toKebabCase } from './casing'

const CSS_VAR_PREFIX = '--color-'

/** `--color-text-muted` -> `textMuted`. `toKebabCase`'in tersi; anahtar eşitlik testleri için. */
function fromCssVariableName(name: string): string {
  const withoutPrefix = name.slice(CSS_VAR_PREFIX.length)
  return withoutPrefix.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

/**
 * Bir temanın renklerini web `@theme` bloğuna yapıştırılacak
 * CSS custom property adı -> hex değer eşlemesine çevirir. Tek kaynak `themes`'tir.
 */
export function cssVariables(theme: Theme): Record<string, string> {
  const palette = themes[theme]
  const entries = Object.entries(palette) as [ColorToken, string][]
  return Object.fromEntries(
    entries.map(([token, value]) => [`${CSS_VAR_PREFIX}${toKebabCase(token)}`, value]),
  )
}

/**
 * Aynı `themes` kaynağından React Native `StyleSheet` için düz renk nesnesi üretir.
 * `cssVariables` ile birebir aynı anahtar kümesini (kebab-case önekten arındırılmış hâliyle)
 * taşır — iki çıktı kaymaz. Dönüş değeri `themes[theme]`'in KENDİSİDİR (kopya değil) — bu
 * yüzden `Readonly` işaretli: geri dönüş tipi mutable olsaydı `nativeColors('acik').bg = ...`
 * tsc'den geçer ve sürecin TEK renk kaynağını kalıcı olarak bozardı.
 */
export function nativeColors(theme: Theme): Readonly<Record<ColorToken, string>> {
  return themes[theme]
}

/** `cssVariables` çıktısının anahtarlarını `nativeColors` ile karşılaştırılabilir hâle getirir. */
export function cssVariableTokenNames(theme: Theme): string[] {
  return Object.keys(cssVariables(theme)).map(fromCssVariableName)
}

const THEME_SELECTOR: Record<Theme, string> = {
  acik: "[data-tema='acik']",
  koyu: "[data-tema='koyu']",
}

/**
 * Bir temanın CSS seçici bloğunu üretir, ör. `[data-tema='koyu'] { --color-bg: #17161a; ... }`.
 * `apps/web/app/globals.css`'teki `@theme` bloğunun İÇİNE DEĞİL, YANINA kardeş bir kural
 * olarak yapıştırılmak üzere tasarlandı (sonraki dalga, UI-SKEL-001). Tailwind v4'te `@theme`
 * bir seçici içeremez — bu blok `@theme`'in içine gömülürse build kırılır.
 */
export function themeCssBlock(theme: Theme): string {
  const vars = cssVariables(theme)
  const declarations = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`)
  return `${THEME_SELECTOR[theme]} {\n${declarations.join('\n')}\n}`
}

/** İki temanın da CSS bloklarını sırayla üretir. */
export function themeCss(): string {
  return (Object.keys(themes) as Theme[]).map(themeCssBlock).join('\n\n')
}
