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

  it('`user.paste()` maxLength tarafından zaten sınırlanır — normalizeInputa 6 karakterden uzun ham metin ULAŞMAZ', async () => {
    // BULGU: incelemenin varsayımının aksine `user.paste()` GERÇEK bir
    // yapıştırma etkileşimini simüle eder ve tarayıcı/jsdom `maxLength`
    // niteliğini TAM DA paste gibi kullanıcı etkileşimlerinde uygular (HTML
    // "value sanitization" algoritması) — React'in `onChange`'i devreye
    // GİRMEDEN ÖNCE ham metin zaten 6 karaktere kırpılır. Kanıt: 12 karakterlik
    // 'IAO1B0C2D3E4' yapıştırılınca `onChange` yalnızca ilk 6 ham karakteri
    // ('IAO1B0') görür, `normalizeInput` onu 'AB'ye süzer — `.slice()` hiç
    // devreye GİRMEZ. Bu, aşağıdaki testin neden `fireEvent.change`
    // KULLANDIĞINI açıklar: `.slice()`'ı gerçekten ez sadece native
    // `maxLength` denetiminin ATLANDIĞI bir yol (programatik `.value` ataması —
    // örn. otomatik doldurma/parola yöneticisi/tarayıcı eklentisi) ile.
    const user = userEvent.setup()
    render(<JoinCodeField />)

    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    await user.click(input)
    await user.paste('IAO1B0C2D3E4')

    expect(input.value).toBe('AB')
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
