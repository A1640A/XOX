export const fontSize = { xs: 12, sm: 14, base: 16, lg: 20, xl: 28, display: 44 } as const
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const
export type FontSizeToken = keyof typeof fontSize

/**
 * DESIGN-001a — Yön A ("Kağıt & Mürekkep") yazı ailesi seçimi: Fraunces (başlık, serif —
 * "ink" karakteri) + Inter (arayüz) + JetBrains Mono (oda kodu, süre, koordinat — bkz.
 * `docs/design/2026-08-25-gorsel-yonler.md`). Tailwind v4'ün `--font-*` tema namespace'i
 * (`generate-globals-css.ts`) bu değerleri DOĞRUDAN alır; böylece `font-sans`/`font-serif`/
 * `font-mono` utility sınıfları otomatik olarak bu yığınları kullanır.
 *
 * NOT (DESIGN-001b/sonraki karta devir): bu yalnız CSS `font-family` DEĞERİDİR — gerçek
 * webfont YÜKLEMESİ (`next/font/google` ile `apps/web/app/layout.tsx`'e ekleme) bu kartın
 * KAPSAMI DIŞINDA (`layout.tsx` "sıcak dosya dondurma", DESIGN-001a'nın yazma alanında değil).
 * Fontlar yüklenene kadar tarayıcı ilk isimden sonrakine (fallback yığınına) düşer — bu
 * SESSİZ bir bozulma değildir, yalnızca görsel etkinin bir sonraki adımı bekliyor demektir.
 */
export const fontFamily = {
  serif: "'Fraunces', ui-serif, Georgia, 'Times New Roman', serif",
  sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
} as const
export type FontFamilyToken = keyof typeof fontFamily

/**
 * Yön A okunabilirliği önceliklendiriyor: gövde metni `base` satır yüksekliği 1.6
 * (tasarım notu), başlıklar `tight` 1.2.
 */
export const lineHeight = { tight: 1.2, base: 1.6 } as const
export type LineHeightToken = keyof typeof lineHeight
