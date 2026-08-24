import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JoinCodeField } from './JoinCodeField'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

describe('JoinCodeField', () => {
  it('küçük harf ve boşluk içeren geçerli kodu normalize edip yönlendirir (KK-034)', async () => {
    const user = userEvent.setup()
    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), ' abc234 ')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('geçersiz kod hata-mesaji INVALID_CODE gösterir ve yönlendirmez', async () => {
    const user = userEvent.setup()
    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'IO01')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'INVALID_CODE')
  })
})
