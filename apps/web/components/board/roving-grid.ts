import { cellCount, colOf, rowOf, type BoardConfig } from '@xox/game-core'

/**
 * Roving tabindex'in SAF klavye mantığı (ADR-0017 §6, KK-B59/B60). DOM'suz:
 * `Board.tsx` bir `KeyboardEvent`'i buradaki anlamsal `NavKey`'e çevirir, bu
 * modül yalnız aritmetik yapar. `game-core`'un `rowOf`/`colOf`/`cellCount`'u
 * dışında hiçbir bağımlılığı yoktur — Vitest jsdom'suz koşar.
 *
 * KENARLARDA SARMA YOKTUR (E-16): bir kenardaki ok tuşu aynı hücrede kalır,
 * karşı kenara atlamaz. `Ctrl+Home`/`Ctrl+End` ham `KeyboardEvent.ctrlKey` +
 * `key`'den `Board.tsx` tarafından `CtrlHome`/`CtrlEnd`'e çevrilir; imza
 * `nextFocusIndex(current, key, config)` üç parametreyle sabittir (ADR-0017,
 * kart §6), bu yüzden "ctrl" ayrı bir parametre DEĞİL, `NavKey`'in kendi
 * üyesidir.
 */
export type NavKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'CtrlHome'
  | 'CtrlEnd'
  | 'PageUp'
  | 'PageDown'

/**
 * `KeyboardEvent`in DOM'a özgü tipini DEĞİL, yalnız gereken iki alanı
 * (`key`, `ctrlKey`) alan yapısal bir arayüz — bu modülün DOM'suzluğunu korur.
 * `Board.tsx`'teki gerçek `React.KeyboardEvent` yapısal olarak bu arayüze
 * zaten uyar, ayrı bir dönüşüm/adaptasyon GEREKMEZ.
 */
export interface NavKeyEvent {
  readonly key: string
  readonly ctrlKey: boolean
}

/** Ham tuş olayını `nextFocusIndex`'in anlaştığı `NavKey`'e çevirir; tanınmayan tuş `null`. */
export function toNavKey(event: NavKeyEvent): NavKey | null {
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'PageUp':
    case 'PageDown':
      return event.key
    case 'Home':
      return event.ctrlKey ? 'CtrlHome' : 'Home'
    case 'End':
      return event.ctrlKey ? 'CtrlEnd' : 'End'
    default:
      return null
  }
}

/** `PageUp`/`PageDown` ±5 satır (KK-B60). */
const PAGE_ROWS = 5

/**
 * Bir sonraki odak indeksini döner; hareketsiz kalınması gereken durumlarda
 * (kenar) `current`'ın KENDİSİ döner — çağıran bunu "değişmedi" olarak okur.
 */
export function nextFocusIndex(current: number, key: NavKey, config: BoardConfig): number {
  const { size } = config
  const row = rowOf(current, config)
  const col = colOf(current, config)
  const last = cellCount(config) - 1

  switch (key) {
    case 'ArrowUp':
      return row === 0 ? current : current - size
    case 'ArrowDown':
      return row === size - 1 ? current : current + size
    case 'ArrowLeft':
      return col === 0 ? current : current - 1
    case 'ArrowRight':
      return col === size - 1 ? current : current + 1
    case 'Home':
      return row * size
    case 'End':
      return row * size + (size - 1)
    case 'CtrlHome':
      return 0
    case 'CtrlEnd':
      return last
    case 'PageUp':
      return Math.max(current - PAGE_ROWS * size, 0)
    case 'PageDown':
      return Math.min(current + PAGE_ROWS * size, last)
  }
}
