import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Cell } from '@xox/shared'
import { Board } from './Board'

const EMPTY: readonly Cell[] = [null, null, null, null, null, null, null, null, null]

describe('Board', () => {
  it('interactive=false iken hücreye tıklamak onCellPress üretmez', async () => {
    const user = userEvent.setup()
    const onCellPress = vi.fn()
    render(<Board cells={EMPTY} interactive={false} onCellPress={onCellPress} />)

    await user.click(screen.getByTestId('hucre-0'))

    expect(onCellPress).not.toHaveBeenCalled()
    expect(screen.getByTestId('hucre-0')).toBeDisabled()
  })

  it('interactive=true iken tıklama doğru indeksle onCellPress çağırır', async () => {
    const user = userEvent.setup()
    const onCellPress = vi.fn()
    render(<Board cells={EMPTY} interactive onCellPress={onCellPress} />)

    await user.click(screen.getByTestId('hucre-4'))

    expect(onCellPress).toHaveBeenCalledExactlyOnceWith(4)
  })

  it('X ve O yalnız renkle değil, farklı SVG şekilleriyle ayrılır', () => {
    const cells: readonly Cell[] = ['X', 'O', null, null, null, null, null, null, null]
    render(<Board cells={cells} interactive={false} />)

    const xCell = screen.getByTestId('hucre-0')
    const oCell = screen.getByTestId('hucre-1')

    // X: iki <line> (kalın çapraz çizgi), O: bir <circle> (ince çember) —
    // yalnızca `currentColor` renk farkına değil, farklı DOM elemanlarına
    // ve stroke kalınlığına dayanır.
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
    const cells: readonly Cell[] = [...EMPTY]
    render(<Board cells={cells} interactive={false} />)

    expect(screen.getByTestId('hucre-4')).toHaveAccessibleName('2. satır 2. sütun, boş')
  })

  it('kazanan çizgi hücrelerinde data-kazanan="true" yazar, diğerlerinde yazmaz', () => {
    const cells: readonly Cell[] = ['X', 'X', 'X', null, null, null, null, null, null]
    render(<Board cells={cells} interactive={false} winningLine={[0, 1, 2]} />)

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-kazanan', 'true')
    expect(screen.getByTestId('hucre-1')).toHaveAttribute('data-kazanan', 'true')
    expect(screen.getByTestId('hucre-3')).not.toHaveAttribute('data-kazanan')
  })

  it('bekleyen hamlenin indeksinde data-bekliyor="true" yazar', () => {
    render(<Board cells={EMPTY} interactive pendingIndex={5} />)

    expect(screen.getByTestId('hucre-5')).toHaveAttribute('data-bekliyor', 'true')
    expect(screen.getByTestId('hucre-0')).not.toHaveAttribute('data-bekliyor')
  })

  it('data-tas hücrenin taşını yansıtır, boşsa boş string olur', () => {
    const cells: readonly Cell[] = ['X', 'O', null, null, null, null, null, null, null]
    render(<Board cells={cells} interactive={false} />)

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-tas', 'X')
    expect(screen.getByTestId('hucre-1')).toHaveAttribute('data-tas', 'O')
    expect(screen.getByTestId('hucre-2')).toHaveAttribute('data-tas', '')
  })
})
