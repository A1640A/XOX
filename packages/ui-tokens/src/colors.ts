/**
 * Web (CSS custom property, bkz. `css.ts`) ve mobil (React Native `StyleSheet`) aynı renk
 * değerlerini buradan alır. `themes` TEK kaynaktır — başka hiçbir dosyada hex literal renk
 * tekrarlanmaz (bkz. KK-084, kök `eslint.config.mjs` `no-restricted-syntax` kuralı).
 *
 * Kontrast notu: her metin/arka plan çifti WCAG AA (>=4.5:1) hedefiyle seçildi.
 * `playerX`/`playerO` yalnızca renkle ayırt edilmemeli — bileşen katmanı (sonraki dalga)
 * ayrıca şekil/kalınlık farkı ekler (X: kalın çift çizgi, O: ince çember).
 */
export const themes = {
  acik: {
    bg: '#faf9f7',
    surface: '#ffffff',
    border: '#e5e2dd',
    text: '#1c1917',
    textMuted: '#78716c',
    accent: '#2563eb',
    playerX: '#2563eb',
    playerO: '#be123c',
    win: '#15803d',
    danger: '#dc2626',
  },
  koyu: {
    bg: '#17161a',
    surface: '#211f26',
    border: '#35323c',
    text: '#f5f4f2',
    textMuted: '#a8a29e',
    accent: '#60a5fa',
    playerX: '#60a5fa',
    playerO: '#fb7185',
    win: '#4ade80',
    danger: '#f87171',
  },
} as const

export type Theme = keyof typeof themes
export type ColorToken = keyof (typeof themes)['acik']

/**
 * Geriye dönük takma ad. `apps/mobile/app/index.tsx` bu dalgadan önce `colors.light`
 * üzerinden yazıldı; bu görevin çakışma kümesi `apps/mobile/app/**`'i kapsamıyor, bu yüzden
 * kırılmasın diye `themes`'ten türetilen bir görünüm olarak korunuyor. Yeni kod `themes`
 * kullanmalı — sonraki dalgada `apps/mobile/app/index.tsx` `themes.acik`'e taşınınca bu
 * takma ad kaldırılabilir.
 */
export const colors = { light: themes.acik, dark: themes.koyu } as const
export type ColorScheme = keyof typeof colors
