import { render, screen, waitFor } from '@testing-library/react'
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

describe('/oda/katil sayfası — önizlemeli katılım (SB-09/US-B03)', () => {
  it('6 haneli kod girişini ve btn-odaya-katil düğmesini gösterir; önizleme YOKKEN düğme kapalıdır', () => {
    render(<OdaKatilPage />)

    expect(screen.getByLabelText('Oda kodu (6 hane)')).toBeVisible()
    const btn = screen.getByTestId('btn-odaya-katil')
    expect(btn).toBeVisible()
    expect(btn).toBeDisabled()
  })

  it('kod 6 haneye ULAŞMADAN hiçbir istek atılmaz (erken/gereksiz ağ çağrısı yok)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<OdaKatilPage />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC2')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('var olmayan kod için hata-mesaji ROOM_NOT_FOUND gösterir, düğme kapalı kalır, yönlendirmez', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ code: 'ROOM_NOT_FOUND', message: 'Böyle bir oda yok. Kodu kontrol et.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_NOT_FOUND')
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/rooms/ABC234')
    expect(screen.getByTestId('btn-odaya-katil')).toBeDisabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('katılınabilir oda için OYUN AYARI ÖZETİNİ gösterir ve düğme "Katıl"a bastıktan SONRA yönlendirir (kriter 6 + SB-09)', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'ABC234',
          state: 'waiting',
          seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
          canJoin: true,
          size: 6,
          winLength: 4,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    const ozet = await screen.findByTestId('oyun-ayari-ozeti')
    expect(ozet).toHaveTextContent('6×6 tahta · 4 taş yan yana')

    // Önizleme geldiğinde henüz yönlendirilmemiştir — kullanıcı "Katıl"a
    // basmadan oda GİRİLMEZ (kriter: girmeden önce görür, sonra karar verir).
    expect(push).not.toHaveBeenCalled()

    const btn = screen.getByTestId('btn-odaya-katil')
    await waitFor(() => expect(btn).toBeEnabled())
    await user.click(btn)

    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('eski (size/winLength taşımayan sunucudan zaten {3,3} çözülmüş) oda önizlemesi "undefined" GÖSTERMEZ', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'ABC234',
          state: 'waiting',
          seats: { X: null, O: null },
          canJoin: true,
          size: 3,
          winLength: 3,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    const ozet = await screen.findByTestId('oyun-ayari-ozeti')
    expect(ozet).toHaveTextContent('3×3 tahta · 3 taş yan yana')
    expect(ozet.textContent).not.toContain('undefined')
  })

  it('koltukları dolu waiting oda için ROOM_FULL gösterir, önizleme/katılma sunulmaz', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'ABC234',
          state: 'waiting',
          seats: { X: { userId: 'u1', name: 'A' }, O: { userId: 'u2', name: 'B' } },
          canJoin: false,
          size: 3,
          winLength: 3,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_FULL')
    expect(screen.queryByTestId('oyun-ayari-ozeti')).not.toBeInTheDocument()
    expect(screen.getByTestId('btn-odaya-katil')).toBeDisabled()
  })

  it('bitmiş (finished) oda için GAME_OVER gösterir — ROOM_FULL DEĞİL', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'ABC234',
          state: 'finished',
          seats: { X: { userId: 'u1', name: 'A' }, O: { userId: 'u2', name: 'B' } },
          canJoin: false,
          size: 3,
          winLength: 3,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<OdaKatilPage />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'GAME_OVER')
  })
})
