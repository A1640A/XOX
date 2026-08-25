import { toKebabCase } from './casing'

/**
 * Tahta ölçekleme/vurgu sabitleri (ADR-0017 §1, §2, §8; DESIGN-001a kabul kriterleri).
 * Web `--xox-*` CSS custom property'lerine (`boardCssVariables`), mobil `StyleSheet`
 * sabitlerine BUNDAN akar — `UI-BOARD-001` ham piksel değeri serpiştirmez.
 *
 * Piksel değerleri BİLİNÇLİ SABİTTİR — boyuta (3×3/6×6/11×11) göre İKİNCİ bir değer YOKTUR.
 * ADR-0017'nin "tek ızgara kod yolu" kararı: Yön B'nin reddedilme sebebi boyuta göre dallanan
 * dekordu, bu paket o hatayı tekrarlamaz.
 *
 * `hücre boyutu (28px/24px) BURADA YOKTUR`: CSS'te/tokenlarda hücre için ALT SINIR
 * tanımlanmaz (ADR-0017 §1) — bu sayılar E2E'de (`E2E-BOARD-001`) ÖLÇÜLEN iddialardır,
 * token DEĞİLDİR. Buraya bir `minCellSize` eklemek, dar ekranda taşma (KK-B50 ihlali)
 * üretmenin tek yoludur — eklenmesin.
 */
export const board = {
  /** `--xox-grid-line` — ızgara çizgisi KALINLIĞI, tek sabit 2px (ADR-0017 §2). Izgara
   * çizgisi gap'in kendisidir: tahta arka planı `border` renginde, hücreler `surface`
   * renginde (Yön A'nın "kağıt-ızgara hilesi"). */
  gridLine: 2,
  /** `--xox-board-max` — tahtanın ölçeklenebileceği üst sınır. `width: min(100%, var(--xox-board-max))`
   * ile kullanılır; geniş ekranda tahtanın devasa büyümesini önler, dar ekranda hiçbir etkisi
   * yoktur (100% zaten daha küçük). Yön A önizlemesindeki kart genişliğiyle aynı (480px). */
  boardMax: 480,
  /** `--xox-focus-ring-width` — odak halkası kalınlığı. Rengi YENİ bir token DEĞİL,
   * `--color-accent`'tır (odak her zaman `accent` ile çizilir, tema fark etmez). */
  focusRingWidth: 2,
  /** `--xox-focus-ring-offset` — odak halkası ile hücre kenarı arası boşluk. */
  focusRingOffset: 2,
  /** `--xox-winning-outline-width` — kazanan hücrede renkten BAĞIMSIZ dış çizgi kalınlığı
   * (ADR-0017 §8c, WCAG 1.4.1). Rengi `--color-win`; kalınlık burada, renk `colors.ts`'te. */
  winningOutlineWidth: 3,
  /** `--xox-faded-opacity` — oyun bittiğinde kazanan OLMAYAN hücrelere uygulanan opaklık
   * (ADR-0017 §8b: kazanan hattı vurgulamak için "geri kalanı soluklaştır"). 0.55, ≥%40
   * düşüş şartını (1 - 0.55 = %45) payla geçer — tam sınırda (0.6) bırakılmadı. */
  fadedOpacity: 0.55,
  /** `--xox-mark-stroke-x` / `--xox-mark-stroke-o` — X/O işaretlerinin çizgi kalınlığı.
   * Renk körlüğünde de ayırt edilebilirlik İÇİN (yalnız renge güvenilmez): X daha kalın
   * (~3px, "kalın çift çizgi" hissi), O daha ince (~2px, "ince çember"). Sabit px — hücre
   * boyutu küçüldükçe ORANTILI küçülmez (tek görsel kod yolu, `gridLine` ile aynı felsefe). */
  markStrokeX: 3,
  markStrokeO: 2,
} as const

export type BoardToken = keyof typeof board

/** `fadedOpacity` HARİÇ tüm token'lar piksel — CSS'te `px` soneki alır. */
const PIXEL_TOKENS: readonly BoardToken[] = [
  'gridLine',
  'boardMax',
  'focusRingWidth',
  'focusRingOffset',
  'winningOutlineWidth',
  'markStrokeX',
  'markStrokeO',
]

/**
 * `board`'u `--xox-` önekli CSS custom property adı -> değer eşlemesine çevirir
 * (`generateGlobalsCss`, `apps/web/lib/generate-globals-css.ts` bunu `:root`'a yazar).
 * Tek kaynak `board`'dır; başka hiçbir dosyada bu sayılar tekrarlanmaz.
 */
export function boardCssVariables(): Record<string, string> {
  return Object.fromEntries(
    (Object.entries(board) as [BoardToken, number][]).map(([token, value]) => [
      `--xox-${toKebabCase(token)}`,
      PIXEL_TOKENS.includes(token) ? `${String(value)}px` : String(value),
    ]),
  )
}
