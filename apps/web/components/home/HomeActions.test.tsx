import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeActions } from './HomeActions'

const push = vi.fn()
let sessionValue: { data: unknown; status: string } = { data: null, status: 'unauthenticated' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => sessionValue,
}))

function signIn(): void {
  sessionValue = {
    status: 'authenticated',
    data: { user: { id: 'u1', name: 'Ayşe', email: 'ayse@example.com' } },
  }
}

describe('HomeActions', () => {
  beforeEach(() => {
    push.mockClear()
    sessionValue = { data: null, status: 'unauthenticated' }
    vi.stubGlobal('fetch', vi.fn())
  })

  it('girişsizken giriş/kayıt bağlantılarını gösterir', () => {
    render(<HomeActions />)

    expect(screen.getByRole('link', { name: 'Giriş yap' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kayıt ol' })).toBeInTheDocument()
  })

  it('girişliyken hoş geldin mesajını ve CTA-ları gösterir', () => {
    signIn()
    render(<HomeActions />)

    expect(screen.getByText('Hoş geldin, Ayşe')).toBeInTheDocument()
    expect(screen.getByTestId('btn-oda-kur')).toBeInTheDocument()
    expect(screen.getByTestId('btn-bilgisayara-karsi')).toBeInTheDocument()
  })

  it('Oda kur başarılı olunca dönen koda yönlendirir', async () => {
    signIn()
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'ABC234' }), { status: 201 }),
    )
    const user = userEvent.setup()
    render(<HomeActions />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('sunucu errorResponseSchema-a UYAN bir gövde dönerse o kodu gösterir', async () => {
    signIn()
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'CODE_GENERATION_FAILED', message: 'x' }), {
        status: 503,
      }),
    )
    const user = userEvent.setup()
    render(<HomeActions />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute(
      'data-kod',
      'CODE_GENERATION_FAILED',
    )
  })

  it('İNCELEME MAJOR #6: errorResponseSchema-a UYMAYAN bir gövde (ör. Vercel 504 HTML-i) boş şerit YERİNE SERVER_ERROR gösterir', async () => {
    signIn()
    // Gerçek bir platform hatası — enum dışı/şemasız gövde. Eski kod
    // (`body as Partial<ErrorResponse>`) bunu doğrulamadan `code` alanını
    // okuyup `undefined` bulur, `tr.errors[undefined]` `undefined` döner ve
    // `hata-mesaji` BOŞ render edilirdi.
    vi.mocked(fetch).mockResolvedValue(
      new Response('<html>Gateway Timeout</html>', { status: 504 }),
    )
    const user = userEvent.setup()
    render(<HomeActions />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    const banner = await screen.findByTestId('hata-mesaji')
    expect(banner).not.toBeEmptyDOMElement()
    expect(banner).toHaveTextContent('Sunucuda bir sorun oluştu. Tekrar dene.')
  })

  it('ağ isteği reddedilirse NETWORK hatası gösterir', async () => {
    signIn()
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<HomeActions />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'NETWORK')
  })
})
