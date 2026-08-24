'use client'

import { cellTestId, TESTID, type Cell } from '@xox/shared'
import { OMark, XMark } from './Marks'

export interface BoardProps {
  readonly cells: readonly Cell[]
  /**
   * TEK girdi kapısı. `Board` hiçbir oyun kuralı bilmez (sıra, doluluk, oyun
   * bitişi) — hepsi çağıranın (RoomScreen / bilgisayar ekranı / reducer)
   * sorumluluğundadır. `false` iken hücreler `disabled`dır ve `onCellPress`
   * ASLA çağrılmaz (kart §2).
   */
  readonly interactive: boolean
  /** Kazanan çizginin üç indeksi — yoksa `null`/`undefined`. */
  readonly winningLine?: readonly number[] | null
  /** İyimser gösterimde bekleyen hamlenin indeksi (`data-bekliyor`). */
  readonly pendingIndex?: number | null
  readonly onCellPress?: (index: number) => void
}

function cellDescription(cell: Cell): string {
  return cell === null ? 'boş' : `${cell} taşı`
}

/** Erişilebilirlik: "3. satır 2. sütun, boş" biçiminde konum + içerik. */
function cellAriaLabel(index: number, cell: Cell): string {
  const row = Math.floor(index / 3) + 1
  const col = (index % 3) + 1
  return `${String(row)}. satır ${String(col)}. sütun, ${cellDescription(cell)}`
}

const BOARD_SIZE = 3

interface CellButtonProps {
  readonly index: number
  readonly cell: Cell
  readonly interactive: boolean
  readonly isWinning: boolean
  readonly isPending: boolean
  readonly onCellPress?: ((index: number) => void) | undefined
}

function CellButton({
  index,
  cell,
  interactive,
  isWinning,
  isPending,
  onCellPress,
}: CellButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      role="gridcell"
      data-testid={cellTestId(index)}
      data-tas={cell ?? ''}
      data-kazanan={isWinning ? 'true' : undefined}
      data-bekliyor={isPending ? 'true' : undefined}
      aria-label={cellAriaLabel(index, cell)}
      disabled={!interactive}
      onClick={() => {
        onCellPress?.(index)
      }}
      className="border-border flex aspect-square w-20 items-center justify-center border-2 p-3 disabled:cursor-not-allowed"
    >
      {cell === 'X' ? (
        <span className="text-player-x">
          <XMark />
        </span>
      ) : null}
      {cell === 'O' ? (
        <span className="text-player-o">
          <OMark />
        </span>
      ) : null}
    </button>
  )
}

/**
 * Uygulamanın TEK tahta bileşeni (kart §2) — hem oda ekranı hem bilgisayara
 * karşı ekran bunu kullanır. Hücreler `<button>`: klavyeyle Tab/Enter ile
 * erişilebilir, `aria-label` konumu ve içeriği bildirir.
 */
export function Board({
  cells,
  interactive,
  winningLine = null,
  pendingIndex = null,
  onCellPress,
}: BoardProps): React.ReactElement {
  const rows = Array.from({ length: BOARD_SIZE }, (_unused, row) => row)

  return (
    <div data-testid={TESTID.tahta} role="grid" className="grid w-fit grid-cols-3 gap-2">
      {rows.map((row) => (
        // `role="grid"` doğrudan `role="gridcell"` çocuklarını KABUL ETMEZ —
        // ARIA'nın grid deseni aradaki `role="row"`u ZORUNLU kılar (inceleme
        // minor bulgusu). Görsel düzen (`grid-cols-3`) zaten dış kapsayıcıda
        // olduğu için bu satır `display: contents` ile yalnız erişilebilirlik
        // ağacına eklenir, görsel ızgarayı BOZMAZ.
        <div key={row} role="row" className="contents">
          {cells.slice(row * BOARD_SIZE, row * BOARD_SIZE + BOARD_SIZE).map((cell, col) => {
            const index = row * BOARD_SIZE + col
            return (
              <CellButton
                key={index}
                index={index}
                cell={cell}
                interactive={interactive}
                isWinning={winningLine?.includes(index) ?? false}
                isPending={pendingIndex === index}
                onCellPress={onCellPress}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
