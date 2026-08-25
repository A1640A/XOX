import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OdaKatilPage from './page'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

afterEach(() => {
  push.mockClear()
  vi.unstubAllGlobals()
})

describe('/oda/katil sayfası', () => {
  it('6 haneli kod girişini, btn-odaya-katil düğmesini gösterir (kriter 1)', () => {
    render(<OdaKatilPage />)

    expect(screen.getByLabelText('Oda kodu (6 hane)')).toBeVisible()
    expect(screen.getByTestId('btn-odaya-katil')).toBeVisible()
  })

  it('var olmayan kod için hata-mesaji ROOM_NOT_FOUND gösterir ve sayfa değişmez', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ code: 'ROOM_NOT_FOUND', message: 'Böyle bir oda yok. Kodu kontrol et.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_NOT_FOUND')
    expect(screen.getByLabelText('Oda kodu (6 hane)')).toBeVisible()
  })

  it('başarılı katılım /oda/<KOD>a yönlendirir (kriter 6)', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'ABC234',
          state: 'waiting',
          seats: { X: null, O: null },
          canJoin: true,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })
})
