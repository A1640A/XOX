import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JoinRoomPreview } from './JoinRoomPreview'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

afterEach(() => {
  push.mockClear()
  vi.unstubAllGlobals()
})

describe('JoinRoomPreview', () => {
  it('ROOM_CODE_ALPHABET dışı tuş vuruşlarını yutar: I, O, 0, 1 girilemez', async () => {
    const user = userEvent.setup()
    render(<JoinRoomPreview />)

    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    await user.type(input, 'IO01')

    expect(input.value).toBe('')
  })

  it('ağ isteği reddedilirse NETWORK hatası gösterir', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<JoinRoomPreview />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'NETWORK')
  })

  it('sunucu şemasına UYMAYAN bir gövde dönerse SERVER_ERROR gösterir, çökmez', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ garip: true }) }),
    )

    render(<JoinRoomPreview />)
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'ABC234')

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'SERVER_ERROR')
  })

  it('kod silinip yeniden yazıldığında önceki önizleme/hata TEMİZLENİR', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ code: 'ROOM_NOT_FOUND', message: 'x' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<JoinRoomPreview />)
    const input = screen.getByLabelText<HTMLInputElement>('Oda kodu (6 hane)')
    await user.type(input, 'ABC234')
    expect(await screen.findByTestId('hata-mesaji')).toBeInTheDocument()

    await user.clear(input)

    expect(screen.queryByTestId('hata-mesaji')).not.toBeInTheDocument()
    expect(screen.queryByTestId('oyun-ayari-ozeti')).not.toBeInTheDocument()
  })
})
