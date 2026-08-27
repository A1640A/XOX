import { colOf, rowOf, type BoardConfig } from '@xox/game-core'
import type { Cell } from '@xox/shared'
import { tr } from '@/messages/tr'

/**
 * Erişilebilirlik metinlerinin SAF üretimi (ADR-0017 §7, KK-B61/B63). Bileşene
 * gömülü Türkçe kalmaz — kaynak `tr.boardConfig`. Satır/sütun hesabı
 * `config`'ten gelir (`rowOf`/`colOf`); `+1` (1 tabanlı gösterim) burada,
 * `game-core` 0 tabanlı kalır.
 */

function sizeLabel(config: BoardConfig): string {
  return `${String(config.size)}×${String(config.size)}`
}

function cellContentText(cell: Cell): string {
  return cell === null ? tr.boardConfig.cellEmpty : tr.boardConfig.cellStone.replace('{tas}', cell)
}

/** Hücre `aria-label`'ı: "3. satır 2. sütun, boş" (biçim korunur, KK-B63). */
export function cellAriaLabel(index: number, cell: Cell, config: BoardConfig): string {
  const row = rowOf(index, config) + 1
  const col = colOf(index, config) + 1
  return tr.boardConfig.cellPosition
    .replace('{satir}', String(row))
    .replace('{sutun}', String(col))
    .replace('{icerik}', cellContentText(cell))
}

/** Grid `aria-label`'ı: "11×11 oyun tahtası, kazanmak için 5 taş yan yana" (KK-B61). */
export function boardAriaLabel(config: BoardConfig): string {
  return tr.boardConfig.boardLabel
    .replace('{boyut}', sizeLabel(config))
    .replace('{n}', String(config.winLength))
}
