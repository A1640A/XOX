/**
 * Hareket dili (Yön A, DESIGN-001a). Tek kaynak — web `transition`/`animation`'ları
 * `--xox-*` CSS custom property'lerinden (`motionCssVariables`), mobil `Animated`/
 * `react-native-reanimated` süreleri buradan (`motion.moveDurationMs` vb.) okur.
 *
 * DEĞİŞMEZ: hiçbir süre 200ms'yi GEÇMEZ (lead protokolü). `prefers-reduced-motion`
 * saygısı bir TOKEN değeri değildir — tüketen bileşen `@media (prefers-reduced-motion:
 * reduce)` sorgusuyla süreyi 0'a indirir; bu paketin sorumluluğu yalnız "aktif" süredir.
 */
export const motion = {
  /** Hamle yerleşmesi: fade+scale. Yön A önizlemesiyle birebir (150ms ease-out). */
  moveDurationMs: 150,
  /** Kazanan çizginin `stroke-dashoffset` ile "çizilme" animasyonu. */
  winDurationMs: 200,
  /** Yön A'nın "kalem hissi" eğrisi — zıplama/geri tepme YOK (bu, Yön B'nin diliydi). */
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

export type MotionToken = keyof typeof motion

/**
 * `motion`'ı `--xox-` önekli CSS custom property adı -> değer eşlemesine çevirir.
 * Süre alanları `ms` soneki alır; `easeOut` bir CSS `<easing-function>` string'i olduğu
 * için soneksiz aktarılır.
 */
export function motionCssVariables(): Record<string, string> {
  return {
    '--xox-move-duration': `${String(motion.moveDurationMs)}ms`,
    '--xox-win-duration': `${String(motion.winDurationMs)}ms`,
    '--xox-ease-out': motion.easeOut,
  }
}
