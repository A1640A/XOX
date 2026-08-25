/**
 * Web (CSS custom property, bkz. `css.ts`) ve mobil (React Native `StyleSheet`) aynı renk
 * değerlerini buradan alır. `themes` TEK kaynaktır — başka hiçbir dosyada hex literal renk
 * tekrarlanmaz (bkz. KK-084, kök `eslint.config.mjs` `no-restricted-syntax` kuralı).
 *
 * DESIGN-001a (2026-08-26): Ömer'in seçtiği Yön A — "Kağıt & Mürekkep" (bkz.
 * `docs/design/2026-08-25-gorsel-yonler.md`). Sıcak kağıt zemin, mürekkep tonlarında
 * `playerX`/`playerO`, gölgesiz — hiyerarşi tipografi + boşluk + hairline ile kurulur.
 *
 * `surfaceRaised`: Yön A'nın yeni token'ı — gölgesiz "yükselti" zemini (hover/aktif/basılı
 * durum, UI-BOARD-001'in hücre hover'ı için). `surface`den bilinçli olarak farklı bir
 * değerdir (aşağıdaki `colors.test.ts` kopya-yapıştır kaymasını kilitler).
 *
 * Kontrast notu: her metin/vurgu token'ı WCAG AA (>=4.5:1) hedefiyle ÜÇ yüzeyin TÜMÜNE karşı
 * (`bg`, `surface`, `surfaceRaised`) ölçüldü — `border` ise WCAG 1.4.11 (>=3:1, "anlamlı UI
 * bileşeni") hedefiyle, yine üç yüzeye karşı. Tümü `contrast.test.ts`'te kilitlendi; gerçek
 * ölçüm tablosu `docs/board/reports/DESIGN-001a.md`'de. `playerX`/`playerO` yalnızca renkle
 * ayırt edilmemeli — bileşen katmanı (sonraki dalga) ayrıca şekil/kalınlık farkı ekler
 * (X: kalın çift çizgi ~3px, O: ince çember ~2px — bkz. `board.ts` `markStrokeX/O`).
 */
export const themes = {
  acik: {
    bg: '#f7f4ee',
    surface: '#ffffff',
    surfaceRaised: '#fbf9f5',
    border: '#8a8478',
    text: '#241f1a',
    textMuted: '#6b6255',
    accent: '#1d4ed8',
    playerX: '#243b5c',
    playerO: '#7a2e2e',
    win: '#2f6b3a',
    danger: '#a13d2c',
  },
  koyu: {
    bg: '#14120f',
    surface: '#1e1b17',
    surfaceRaised: '#262220',
    border: '#786d5f',
    text: '#f2ede4',
    textMuted: '#b3a998',
    accent: '#93b4ff',
    playerX: '#aac0ea',
    playerO: '#e6a8a2',
    win: '#8ccb98',
    danger: '#e2897c',
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
