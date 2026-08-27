'use client'

import { useCallback, useRef, useState } from 'react'
import { cellCount, type BoardConfig } from '@xox/game-core'
import { cellTestId, TESTID, type Cell } from '@xox/shared'
import { tr } from '@/messages/tr'
import { boardAriaLabel, cellAriaLabel } from './cell-label'
import { CellButton } from './CellButton'
import { nextFocusIndex, toNavKey } from './roving-grid'

export interface BoardProps {
  readonly cells: readonly Cell[]
  /**
   * TEK ızgara kod yolu (ADR-0017 §5/§10): `data-kazanma` `cells.length`'ten
   * TÜRETİLEMEZ (bir K değeri aynı N'de birden fazladır), bu yüzden
   * konfigürasyon ayrı bir prop'tur ve `cells.length !== cellCount(config)`
   * KK-B57'nin hata yoludur.
   */
  readonly config: BoardConfig
  /**
   * TEK girdi kapısı. `Board` hiçbir oyun kuralı bilmez (sıra, doluluk, oyun
   * bitişi) — hepsi çağıranın (RoomScreen / bilgisayar ekranı / reducer)
   * sorumluluğundadır. `false` iken hücreler `disabled`dır ve `onCellPress`
   * ASLA çağrılmaz (kart §2).
   */
  readonly interactive: boolean
  /** Kazanan çizginin indeksleri — yoksa `null`/`undefined`. */
  readonly winningLine?: readonly number[] | null
  /** İyimser gösterimde bekleyen hamlenin indeksi (`data-bekliyor`). */
  readonly pendingIndex?: number | null
  /** Rakibin (ya da kendinin) en son oynadığı hücre (`data-son-hamle`, KK-B55). */
  readonly lastMoveIndex?: number | null
  readonly onCellPress?: (index: number) => void
}

/**
 * Uygulamanın TEK tahta bileşeni (kart §2) — hem oda ekranı hem bilgisayara
 * karşı ekran bunu kullanır. TEK ızgara kod yolu (ADR-0017): 3×3/6×6/11×11
 * arasında dallanma yok, yalnız `--xox-n` (grid sütun sayısı) değişir.
 *
 * Roving tabindex (KK-B59): ızgarada yalnız BİR hücre `tabIndex=0`'dır,
 * kalanı `-1`. Klavye/odak yönetimi ızgara KAPSAYICISINDA event delegasyonu
 * ile yapılır (`onKeyDown`/`onFocus` kapsayıcıda) — her hücreye ayrı, her
 * render'da yeniden kurulan bir closure geçmemek için (KK-B71 render bütçesi).
 */
export function Board({
  cells,
  config,
  interactive,
  winningLine = null,
  pendingIndex = null,
  lastMoveIndex = null,
  onCellPress,
}: BoardProps): React.ReactElement {
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleCellClick = useCallback(
    (index: number) => {
      onCellPress?.(index)
    },
    [onCellPress],
  )

  const expectedCount = cellCount(config)

  // KK-B57: bozuk ızgara ASLA çizilmez (bayat reducer / bozuk veri, E-03/E-18).
  if (cells.length !== expectedCount) {
    console.error(
      `Board: cells.length (${String(cells.length)}) config ile eşleşmiyor ` +
        `(beklenen ${String(expectedCount)}, size=${String(config.size)})`,
    )
    return (
      <div data-testid={TESTID.tahta} role="alert">
        {tr.common.error}
      </div>
    )
  }

  const safeFocusIndex = focusIndex < expectedCount ? focusIndex : 0

  function focusCell(index: number): void {
    containerRef.current
      ?.querySelector<HTMLButtonElement>(`[data-testid="${cellTestId(index)}"]`)
      ?.focus()
  }

  /** E-16: kenarlarda sarma yok — `nextFocusIndex` sınırda `current`'ı döner. */
  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const key = toNavKey(event)
    if (key === null) return
    event.preventDefault()
    const next = nextFocusIndex(safeFocusIndex, key, config)
    if (next === safeFocusIndex) return
    setFocusIndex(next)
    focusCell(next)
  }

  /** Fare/`Tab` ile bir hücreye doğrudan odaklanınca roving indeksi senkronlar. */
  function handleGridFocus(event: React.FocusEvent<HTMLDivElement>): void {
    const target = event.target
    if (!(target instanceof HTMLButtonElement)) return
    const rowAttr = target.getAttribute('aria-rowindex')
    const colAttr = target.getAttribute('aria-colindex')
    if (rowAttr === null || colAttr === null) return
    const row = Number(rowAttr) - 1
    const col = Number(colAttr) - 1
    setFocusIndex(row * config.size + col)
  }

  const rows = Array.from({ length: config.size }, (_unused, row) => row)

  return (
    <div
      data-testid={TESTID.tahta}
      role="grid"
      aria-label={boardAriaLabel(config)}
      aria-rowcount={config.size}
      aria-colcount={config.size}
      data-boyut={config.size}
      data-kazanma={config.winLength}
      ref={containerRef}
      // Roving tabindex (KK-B59): odak DAİMA bir hücrede yaşar, kapsayıcının
      // KENDİSİ tab sırasında DEĞİLDİR (`tabIndex={-1}`) — bu yalnız `jsx-a11y`
      // uyumu için programatik olarak odaklanabilir kılar, sekme durağı EKLEMEZ.
      tabIndex={-1}
      onKeyDown={handleGridKeyDown}
      onFocus={handleGridFocus}
      style={{ '--xox-n': config.size } as React.CSSProperties}
      className="mx-auto grid aspect-square w-[min(100%,var(--xox-board-max))] min-w-0 grid-cols-[repeat(var(--xox-n),minmax(0,1fr))] gap-[var(--xox-grid-line)] bg-border"
    >
      {rows.map((row) => (
        // `role="grid"` doğrudan `role="gridcell"` çocuklarını KABUL ETMEZ —
        // ARIA'nın grid deseni aradaki `role="row"`u ZORUNLU kılar (KK-B58).
        // Görsel düzen kapsayıcıda olduğu için bu satır `display: contents`
        // ile yalnız erişilebilirlik ağacına eklenir, görsel ızgarayı BOZMAZ.
        <div key={row} role="row" className="contents">
          {cells.slice(row * config.size, row * config.size + config.size).map((cell, col) => {
            const index = row * config.size + col
            const isWinning = winningLine?.includes(index) ?? false
            const isFaded = winningLine !== null && !isWinning
            return (
              <CellButton
                key={index}
                index={index}
                cell={cell}
                interactive={interactive}
                isWinning={isWinning}
                isFaded={isFaded}
                isPending={pendingIndex === index}
                isLastMove={lastMoveIndex === index}
                tabIndex={index === safeFocusIndex ? 0 : -1}
                rowIndex={row + 1}
                colIndex={col + 1}
                ariaLabel={cellAriaLabel(index, cell, config)}
                onCellClick={handleCellClick}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
