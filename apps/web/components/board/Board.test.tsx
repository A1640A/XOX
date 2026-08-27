import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BOARD_CONFIG, type BoardConfig } from '@xox/game-core'
import type { Cell } from '@xox/shared'
import { Board } from './Board'
import { CellButton, type CellButtonProps } from './CellButton'

const EMPTY_9: readonly Cell[] = [null, null, null, null, null, null, null, null, null]
const EMPTY_36: readonly Cell[] = Array.from({ length: 36 }, () => null)
const EMPTY_121: readonly Cell[] = Array.from({ length: 121 }, () => null)

const CONFIG_6: BoardConfig = { size: 6, winLength: 4 }
const CONFIG_11: BoardConfig = { size: 11, winLength: 5 }

describe('Board', () => {
  it('interactive=false iken hücreye tıklamak onCellPress üretmez', async () => {
    const user = userEvent.setup()
    const onCellPress = vi.fn()
    render(
      <Board
        cells={EMPTY_9}
        config={DEFAULT_BOARD_CONFIG}
        interactive={false}
        onCellPress={onCellPress}
      />,
    )

    await user.click(screen.getByTestId('hucre-0'))

    expect(onCellPress).not.toHaveBeenCalled()
    expect(screen.getByTestId('hucre-0')).toBeDisabled()
  })

  it('interactive=true iken tıklama doğru indeksle onCellPress çağırır', async () => {
    const user = userEvent.setup()
    const onCellPress = vi.fn()
    render(
      <Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive onCellPress={onCellPress} />,
    )

    await user.click(screen.getByTestId('hucre-4'))

    expect(onCellPress).toHaveBeenCalledExactlyOnceWith(4)
  })

  it('X ve O yalnız renkle değil, farklı SVG şekilleriyle ayrılır', () => {
    const cells: readonly Cell[] = ['X', 'O', null, null, null, null, null, null, null]
    render(<Board cells={cells} config={DEFAULT_BOARD_CONFIG} interactive={false} />)

    const xCell = screen.getByTestId('hucre-0')
    const oCell = screen.getByTestId('hucre-1')

    const xLines = xCell.querySelectorAll('svg[data-symbol="x"] line')
    const oCircles = oCell.querySelectorAll('svg[data-symbol="o"] circle')
    expect(xLines).toHaveLength(2)
    expect(oCircles).toHaveLength(1)
    expect(xCell.querySelector('svg[data-symbol="o"]')).toBeNull()
    expect(oCell.querySelector('svg[data-symbol="x"]')).toBeNull()

    const xStrokeWidth = xLines[0]?.getAttribute('stroke-width')
    const oStrokeWidth = oCircles[0]?.getAttribute('stroke-width')
    expect(xStrokeWidth).not.toBe(oStrokeWidth)
  })

  it('aria-label konumu ve içeriği bildirir', () => {
    render(<Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive={false} />)

    expect(screen.getByTestId('hucre-4')).toHaveAccessibleName('2. satır 2. sütun, boş')
  })

  it('kazanan çizgi hücrelerinde data-kazanan="true" yazar, diğerlerinde yazmaz', () => {
    const cells: readonly Cell[] = ['X', 'X', 'X', null, null, null, null, null, null]
    render(
      <Board
        cells={cells}
        config={DEFAULT_BOARD_CONFIG}
        interactive={false}
        winningLine={[0, 1, 2]}
      />,
    )

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-kazanan', 'true')
    expect(screen.getByTestId('hucre-1')).toHaveAttribute('data-kazanan', 'true')
    expect(screen.getByTestId('hucre-3')).not.toHaveAttribute('data-kazanan')
  })

  it('bekleyen hamlenin indeksinde data-bekliyor="true" yazar', () => {
    render(<Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive pendingIndex={5} />)

    expect(screen.getByTestId('hucre-5')).toHaveAttribute('data-bekliyor', 'true')
    expect(screen.getByTestId('hucre-0')).not.toHaveAttribute('data-bekliyor')
  })

  it('data-tas hücrenin taşını yansıtır, boşsa boş string olur', () => {
    const cells: readonly Cell[] = ['X', 'O', null, null, null, null, null, null, null]
    render(<Board cells={cells} config={DEFAULT_BOARD_CONFIG} interactive={false} />)

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-tas', 'X')
    expect(screen.getByTestId('hucre-1')).toHaveAttribute('data-tas', 'O')
    expect(screen.getByTestId('hucre-2')).toHaveAttribute('data-tas', '')
  })

  it('geçerli ARIA grid deseni üretir: role=grid -> 3x role=row -> role=gridcell (inceleme minor bulgusu)', () => {
    const { container } = render(
      <Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive={false} />,
    )

    const grid = screen.getByRole('grid')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(grid).toContainElement(row)
      const cellsInRow = row.querySelectorAll('[role="gridcell"]')
      expect(cellsInRow).toHaveLength(3)
    }
    const directGridcellChildren = Array.from(grid.children).filter(
      (child) => child.getAttribute('role') === 'gridcell',
    )
    expect(directGridcellChildren).toHaveLength(0)
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(9)
  })

  describe('KK-B56/B49 — tek ızgara kod yolu (3/6/11 aynı bileşen, aynı kod)', () => {
    it('36 hücre verildiğinde 6 sütun (6 satır × 6 hücre) oluşur', () => {
      render(<Board cells={EMPTY_36} config={CONFIG_6} interactive={false} />)

      expect(screen.getAllByRole('row')).toHaveLength(6)
      expect(screen.getAllByRole('gridcell')).toHaveLength(36)
      expect(screen.getByTestId('hucre-35')).toBeInTheDocument()
    })

    it('121 hücre verildiğinde 11 sütun (11 satır × 11 hücre) oluşur', () => {
      render(<Board cells={EMPTY_121} config={CONFIG_11} interactive={false} />)

      expect(screen.getAllByRole('row')).toHaveLength(11)
      expect(screen.getAllByRole('gridcell')).toHaveLength(121)
      expect(screen.getByTestId('hucre-120')).toBeInTheDocument()
    })

    it('tahta elementi data-boyut ve data-kazanma taşır (KK-B49)', () => {
      render(<Board cells={EMPTY_121} config={CONFIG_11} interactive={false} />)

      const tahta = screen.getByTestId('tahta')
      expect(tahta).toHaveAttribute('data-boyut', '11')
      expect(tahta).toHaveAttribute('data-kazanma', '5')
    })

    it('grid-cols-3 gibi sabit bir sınıf adı hiçbir yerde yoktur — sütun sayısı --xox-n değişkeninden gelir', () => {
      const { container: c3 } = render(
        <Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive={false} />,
      )
      const { container: c11 } = render(
        <Board cells={EMPTY_121} config={CONFIG_11} interactive={false} />,
      )

      for (const container of [c3, c11]) {
        expect(container.innerHTML).not.toMatch(/grid-cols-\d/)
      }
      expect(screen.getAllByTestId('tahta')[0]).toHaveStyle({ '--xox-n': '3' })
      expect(screen.getAllByTestId('tahta')[1]).toHaveStyle({ '--xox-n': '11' })
    })
  })

  describe('KK-B57 — bozuk ızgara asla çizilmez', () => {
    it('cells.length config ile eşleşmiyorsa hata durumu render eder ve console.error çağırır', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      render(<Board cells={EMPTY_9} config={CONFIG_11} interactive={false} />)

      expect(screen.queryByRole('grid')).not.toBeInTheDocument()
      expect(screen.getByTestId('tahta')).toBeInTheDocument()
      expect(errorSpy).toHaveBeenCalled()

      errorSpy.mockRestore()
    })
  })

  describe('KK-B58/B61/B62/B63 — erişilebilirlik', () => {
    it('grid aria-label taşır, aria-rowcount/aria-colcount config boyutundadır', () => {
      render(<Board cells={EMPTY_121} config={CONFIG_11} interactive={false} />)

      const grid = screen.getByRole('grid')
      expect(grid).toHaveAccessibleName('11×11 oyun tahtası, kazanmak için 5 taş yan yana')
      expect(grid).toHaveAttribute('aria-rowcount', '11')
      expect(grid).toHaveAttribute('aria-colcount', '11')
    })

    it('her hücre aria-rowindex/aria-colindex taşır (1 tabanlı)', () => {
      render(<Board cells={EMPTY_121} config={CONFIG_11} interactive={false} />)

      // index 12 -> satır 2 (1 tabanlı), sütun 2 (1 tabanlı), 11 sütunlu tahtada.
      expect(screen.getByTestId('hucre-12')).toHaveAttribute('aria-rowindex', '2')
      expect(screen.getByTestId('hucre-12')).toHaveAttribute('aria-colindex', '2')
    })
  })

  describe('KK-B59/B60 — roving tabindex ve klavye gezinmesi', () => {
    it('yalnız bir hücre tabIndex=0, kalanı -1 (3×3 dahil)', () => {
      render(<Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive={false} />)

      const cells = screen.getAllByRole('gridcell')
      const zeroTabbable = cells.filter((cell) => cell.getAttribute('tabindex') === '0')
      expect(zeroTabbable).toHaveLength(1)
      expect(zeroTabbable[0]).toBe(screen.getByTestId('hucre-0'))
    })

    it('11×11de tahtadan sonraki odaklanabilir elemana ulaşmak 1 Tab basışı alır', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <Board cells={EMPTY_121} config={CONFIG_11} interactive />
          <button type="button">sonraki</button>
        </div>,
      )

      screen.getByTestId('hucre-0').focus()
      await user.tab()

      expect(screen.getByRole('button', { name: 'sonraki' })).toHaveFocus()
    })

    it('ok tuşları odağı bir hücre taşır ve sarma yoktur (E-16)', async () => {
      const user = userEvent.setup()
      render(<Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive />)

      screen.getByTestId('hucre-0').focus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByTestId('hucre-1')).toHaveFocus()

      await user.keyboard('{ArrowDown}')
      expect(screen.getByTestId('hucre-4')).toHaveFocus()

      // Sol üst köşeye dön, sınırda sarma OLMAMALI.
      screen.getByTestId('hucre-0').focus()
      await user.keyboard('{ArrowUp}')
      expect(screen.getByTestId('hucre-0')).toHaveFocus()
      await user.keyboard('{ArrowLeft}')
      expect(screen.getByTestId('hucre-0')).toHaveFocus()
    })

    it('Home/End satır başı/sonuna, Ctrl+Home/Ctrl+End ilk/son hücreye, PageUp/PageDown ±5 satıra taşır', async () => {
      const user = userEvent.setup()
      render(<Board cells={EMPTY_121} config={CONFIG_11} interactive />)

      screen.getByTestId('hucre-24').focus() // satır 2 (0 tabanlı), sütun 2
      await user.keyboard('{End}')
      expect(screen.getByTestId('hucre-32')).toHaveFocus() // satır 2 sonu (2*11+10)

      await user.keyboard('{Home}')
      expect(screen.getByTestId('hucre-22')).toHaveFocus() // satır 2 başı (2*11)

      await user.keyboard('{Control>}{End}{/Control}')
      expect(screen.getByTestId('hucre-120')).toHaveFocus()

      await user.keyboard('{Control>}{Home}{/Control}')
      expect(screen.getByTestId('hucre-0')).toHaveFocus()

      screen.getByTestId('hucre-60').focus()
      await user.keyboard('{PageDown}')
      expect(screen.getByTestId('hucre-115')).toHaveFocus() // 60 + 5*11

      await user.keyboard('{PageUp}')
      expect(screen.getByTestId('hucre-60')).toHaveFocus()
    })

    it('fareyle bir hücreye tıklamak roving odağı o hücreye taşır', async () => {
      const user = userEvent.setup()
      render(
        <Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive onCellPress={vi.fn()} />,
      )

      await user.click(screen.getByTestId('hucre-5'))

      expect(screen.getByTestId('hucre-5')).toHaveAttribute('tabindex', '0')
      expect(screen.getByTestId('hucre-0')).toHaveAttribute('tabindex', '-1')
    })
  })

  describe('KK-B71 — render bütçesi', () => {
    function baseCellProps(index: number, onCellClick: (index: number) => void): CellButtonProps {
      return {
        index,
        cell: null,
        interactive: false,
        isWinning: false,
        isFaded: false,
        isPending: false,
        isLastMove: false,
        tabIndex: index === 0 ? 0 : -1,
        rowIndex: 1,
        colIndex: index + 1,
        ariaLabel: `hücre ${String(index)}`,
        onCellClick,
      }
    }

    /**
     * SAYAÇ TABANLI test (kart §KK-B71): `React.memo(fn)`'in döndürdüğü nesnenin
     * `.type` alanı SARILAN fonksiyonun KENDİSİDİR — React reconciler yalnız
     * memo karşılaştırması prop'ları FARKLI bulursa `.type(props)`'u çağırır.
     * `.type`'ı bir `vi.fn()` casusuyla değiştirip GERÇEK `CellButton`'ın kaç
     * kez ÇALIŞTIRILDIĞINI (Profiler'ın commit-seviyesi belirsizliği olmadan,
     * doğrudan fonksiyon çağrısı sayısıyla) ölçüyoruz — "hızlı hissettiriyor"
     * gibi öznel bir gözlem değil.
     */
    it("yalnız KENDİ prop'ları değişen hücre yeniden render olur, komşusu ATLANIR", () => {
      const memoized = CellButton as unknown as {
        type: (props: CellButtonProps) => React.ReactElement
      }
      const original = memoized.type
      const renderSpy = vi.fn(original)
      memoized.type = renderSpy

      try {
        const stableClick = vi.fn()
        const props0 = baseCellProps(0, stableClick)
        const props1 = baseCellProps(1, stableClick)

        const { rerender } = render(
          <>
            <CellButton {...props0} />
            <CellButton {...props1} />
          </>,
        )
        expect(renderSpy).toHaveBeenCalledTimes(2)

        renderSpy.mockClear()
        rerender(
          <>
            <CellButton {...props0} cell="X" />
            <CellButton {...props1} />
          </>,
        )

        // Yalnız hücre 0 çağrıldı — hücre 1 AYNI prop'larla, render ATLANDI.
        expect(renderSpy).toHaveBeenCalledTimes(1)
        expect(renderSpy.mock.calls[0]?.[0]).toMatchObject({ index: 0, cell: 'X' })
      } finally {
        memoized.type = original
      }
    })

    it('bir hücre değişince yalnız o hücrenin data-tas değeri güncellenir, diğer DOM düğümleri AYNI kalır', () => {
      const { rerender } = render(
        <Board cells={EMPTY_9} config={DEFAULT_BOARD_CONFIG} interactive={false} />,
      )
      const nodesBefore = Array.from({ length: 9 }, (_unused, i) =>
        screen.getByTestId(`hucre-${String(i)}`),
      )

      const next: readonly Cell[] = [...EMPTY_9]
      const mutated = [...next]
      mutated[4] = 'X'
      rerender(<Board cells={mutated} config={DEFAULT_BOARD_CONFIG} interactive={false} />)

      const nodesAfter = Array.from({ length: 9 }, (_unused, i) =>
        screen.getByTestId(`hucre-${String(i)}`),
      )
      for (let i = 0; i < 9; i += 1) {
        expect(nodesAfter[i]).toBe(nodesBefore[i]) // reconciliation aynı DOM düğümünü korur
      }
      expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', 'X')
    })
  })
})
