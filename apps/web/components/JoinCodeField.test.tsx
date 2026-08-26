import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JoinCodeField } from './JoinCodeField'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

afterEach(() => {
  push.mockClear()
  vi.unstubAllGlobals()
})

describe('JoinCodeField', () => {
  it('küçük harf ve boşluk içeren geçerli kodu normalize edip sunucu onayından sonra yönlendirir (KK-034)', async () => {
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

    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), ' abc234 ')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/rooms/ABC234')
    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('geçersiz (kısa) kod hata-mesaji INVALID_CODE gösterir, sunucuya istek atmaz ve yönlendirmez', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'IO01')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'INVALID_CODE')
  })

  it('ROOM_CODE_ALPHABET dışı tuş vuruşlarını yutar: I, O, 0, 1 girilemez', async () => {
    const user = userEvent.setup()
    render(<JoinCodeField />)

    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    await user.type(input, 'IO01')

    expect(input.value).toBe('')
  })

  it('`user.paste()` artık native maxLength tarafından SINIRLANMAZ — ham metnin TAMAMI normalizeInputa ulaşır (W1-05 düzeltmesi)', async () => {
    // DÜZELTME ÖNCESİ (bu yorumun eski hali): native `maxLength={6}` ham metni
    // React'in `onChange`'i görmeden ÖNCE 6 karaktere kırpıyordu — 12 karakterlik
    // 'IAO1B0C2D3E4' yapıştırılınca yalnız ilk 6 ham karakter ('IAO1B0') görülür,
    // `normalizeInput` onu 'AB'ye süzerdi. `maxLength` KALDIRILDIĞI için artık
    // ham metnin TAMAMI ('IAO1B0C2D3E4') `normalizeInput`'a ulaşır: alfabe dışı
    // (I, O, 1, 0) karakterler atılır → 'ABC2D3E4', SONRA `.slice(0, 6)` uygulanır
    // → 'ABC2D3'. Sıra artık [süz → kırp], [kırp → süz] DEĞİL — W1-05'in kök
    // nedeni tam da bu sıra tersliğiydi.
    const user = userEvent.setup()
    render(<JoinCodeField />)

    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    await user.click(input)
    await user.paste('IAO1B0C2D3E4')

    expect(input.value).toBe('ABC2D3')
  })

  it('W1-05: boşlukla başlayan yapıştırmada karakter KAYBOLMAZ (regresyon — E2E-002 gerçek tarayıcıda bulmuştu)', async () => {
    // Kök neden: `maxLength` input üzerindeyken tarayıcı/jsdom ham metni
    // `onChange`'den ÖNCE 6 karaktere kırpıyordu: ' abc234 ' → ' abc23'
    // (maxLength) → normalizeInput ile boşluk atılınca 'ABC23' kalıyordu —
    // sondaki '4' hiç görülmüyordu. `maxLength` kaldırıldığı ve uzunluk
    // sınırı yalnız SÜZÜLMÜŞ metin üzerinde `.slice()` ile uygulandığı için
    // bu test artık 'ABC234' bekleyebilir.
    const user = userEvent.setup()
    render(<JoinCodeField />)

    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    await user.click(input)
    await user.paste(' abc234 ')

    expect(input.value).toBe('ABC234')
  })

  it('programatik değer atamasında (maxLength ATLANDIĞINDA) ROOM_CODE_LENGTHi aşan sonucu .slice() keser', () => {
    // `fireEvent.change` DOM `value` IDL niteliğini DOĞRUDAN atar — native
    // `maxLength` denetimi yalnız kullanıcı ETKİLEŞİMİNDE (tip/paste) devreye
    // girer, programatik atamada GİRMEZ. Bu, tarayıcı ototamamlama/parola
    // yöneticisi gibi `maxLength`'i atlayan gerçek yolları temsil eder —
    // `.slice()`'ın tek erişilebilir dalı BURASIDIR.
    render(<JoinCodeField />)

    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    fireEvent.change(input, { target: { value: 'ABC234DEF' } })

    expect(input.value).toBe('ABC234')
  })

  it('var olmayan kod için ROOM_NOT_FOUND gösterir ve yönlendirmez', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ code: 'ROOM_NOT_FOUND', message: 'Böyle bir oda yok. Kodu kontrol et.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_NOT_FOUND')
  })

  it('koltukları dolu waiting oda için ROOM_FULL gösterir ve yönlendirmez', async () => {
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

    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_FULL')
  })

  it('sürmekte olan (playing) oda için ROOM_FULL gösterir — GAME_OVER DEĞİL', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'ABC234',
          state: 'playing',
          seats: { X: { userId: 'u1', name: 'A' }, O: { userId: 'u2', name: 'B' } },
          canJoin: false,
          size: 3,
          winLength: 3,
        }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_FULL')
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

    render(<JoinCodeField />)

    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'GAME_OVER')
  })
})
