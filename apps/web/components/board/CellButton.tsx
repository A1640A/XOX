import { memo } from 'react'
import { cellTestId, type Cell } from '@xox/shared'
import { OMark, XMark } from './Marks'

/**
 * Yalnız `Board.test.tsx` (KK-B71 render-bütçesi sondası) için dışa açılır —
 * `RoomScreen`/`ComputerGameInner` bunu DOĞRUDAN KULLANMAZ, yalnız `Board`'un
 * kendisini import eder. Sözleşme yüzeyi büyümez: bu tip `Board.tsx`/
 * `CellButton.tsx` DIŞINDA hiçbir üretim dosyasında referans edilmez.
 */
export interface CellButtonProps {
  readonly index: number
  readonly cell: Cell
  readonly interactive: boolean
  readonly isWinning: boolean
  readonly isFaded: boolean
  readonly isPending: boolean
  readonly isLastMove: boolean
  readonly tabIndex: 0 | -1
  readonly rowIndex: number
  readonly colIndex: number
  readonly ariaLabel: string
  readonly onCellClick: (index: number) => void
}

/**
 * `React.memo` + tüm prop'lar ilkel değer/kararlı referans (KK-B71):
 * `onCellClick` `Board`'da `useCallback` ile sarılır, böylece 121 hücrenin
 * yalnız DEĞİŞENİ (`state`/`move:applied` başına ≤ 2) yeniden render olur.
 * Klavye/odak yönetimi hücrede DEĞİL, ızgara kapsayıcısında (event
 * delegasyonu) — her hücreye ayrı kararsız closure geçmemek için bilinçli.
 */
export const CellButton = memo(function CellButton({
  index,
  cell,
  interactive,
  isWinning,
  isFaded,
  isPending,
  isLastMove,
  tabIndex,
  rowIndex,
  colIndex,
  ariaLabel,
  onCellClick,
}: CellButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      role="gridcell"
      data-testid={cellTestId(index)}
      data-tas={cell ?? ''}
      data-kazanan={isWinning ? 'true' : undefined}
      data-bekliyor={isPending ? 'true' : undefined}
      data-son-hamle={isLastMove ? 'true' : undefined}
      aria-label={ariaLabel}
      aria-rowindex={rowIndex}
      aria-colindex={colIndex}
      tabIndex={tabIndex}
      disabled={!interactive}
      onClick={() => {
        onCellClick(index)
      }}
      className={[
        'relative flex aspect-square min-w-0 items-center justify-center bg-surface p-1',
        'outline-none disabled:cursor-not-allowed',
        'focus-visible:outline focus-visible:outline-accent',
        'focus-visible:outline-[length:var(--xox-focus-ring-width)]',
        'focus-visible:outline-offset-[length:var(--xox-focus-ring-offset)]',
        isWinning ? 'outline outline-win outline-[length:var(--xox-winning-outline-width)]' : '',
        isFaded ? 'opacity-[var(--xox-faded-opacity)]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {cell === 'X' ? (
        <span className="text-player-x h-full w-full p-1">
          <XMark />
        </span>
      ) : null}
      {cell === 'O' ? (
        <span className="text-player-o h-full w-full p-1">
          <OMark />
        </span>
      ) : null}
    </button>
  )
})
