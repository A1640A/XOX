import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('geçerli seçimi aria-pressed ile bildirir, klavyeyle erişilebilir iki düğme render eder', () => {
    render(<ThemeToggle theme="acik" pending={false} onChange={vi.fn()} />)

    const acik = screen.getByRole('button', { name: 'Açık' })
    const koyu = screen.getByRole('button', { name: 'Koyu' })
    expect(acik).toHaveAttribute('aria-pressed', 'true')
    expect(koyu).toHaveAttribute('aria-pressed', 'false')
  })

  it('koyu seçiliyken bildirim tersine döner', () => {
    render(<ThemeToggle theme="koyu" pending={false} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Açık' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Koyu' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tıklayınca onChange doğru temayla çağrılır', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ThemeToggle theme="acik" pending={false} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Koyu' }))
    expect(onChange).toHaveBeenCalledWith('koyu')
  })

  it('klavyeyle Tab ile odaklanıp Enter ile seçilebilir', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ThemeToggle theme="acik" pending={false} onChange={onChange} />)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Açık' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Koyu' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('koyu')
  })

  it('pending true iken her iki düğme de devre dışıdır', () => {
    render(<ThemeToggle theme="acik" pending onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Açık' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Koyu' })).toBeDisabled()
  })
})
