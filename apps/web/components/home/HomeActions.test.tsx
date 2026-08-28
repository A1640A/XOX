import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeActions } from './HomeActions'

/** Çoğu testte üç boyutun TAMAMI sunulur — `enabledSizes` davranışı KENDİ
 * describe bloğunda ayrıca sınanır. */
const TUM_BOYUTLAR = [3, 6, 11]

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
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

    expect(screen.getByRole('link', { name: 'Giriş yap' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kayıt ol' })).toBeInTheDocument()
  })

  it('girişliyken hoş geldin mesajını ve CTA-ları gösterir', () => {
    signIn()
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

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
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('varsayılan seçim (3×3) DEĞİŞTİRİLMEDEN "Oda kur"a basılırsa {size:3,winLength:3} gönderir', async () => {
    signIn()
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'ABC234' }), { status: 201 }),
    )
    const user = userEvent.setup()
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/api/rooms',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ size: 3, winLength: 3 }),
      }),
    )
  })

  describe('BoardConfigPicker entegrasyonu (kart §Sert şart 1/2)', () => {
    it("picker'da seçilen boyut/K TAM OLARAK POST gövdesine gider — sessiz düşürme YOK", async () => {
      signIn()
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ code: 'ABC234' }), { status: 201 }),
      )
      const user = userEvent.setup()
      render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

      await user.click(screen.getByTestId('tahta-boyut-11'))
      await user.click(screen.getByRole('button', { name: '6 taş' }))
      await user.click(screen.getByTestId('btn-oda-kur'))

      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        '/api/rooms',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ size: 11, winLength: 6 }),
        }),
      )
    })

    it('kapalı (enabledSizes dışı) bir boyut HİÇ RENDER EDİLMEZ — istemci onu seçemez bile', () => {
      signIn()
      render(<HomeActions enabledSizes={[3, 6]} />)

      expect(screen.getByTestId('tahta-boyut-3')).toBeVisible()
      expect(screen.getByTestId('tahta-boyut-6')).toBeVisible()
      expect(screen.queryByTestId('tahta-boyut-11')).not.toBeInTheDocument()
    })

    it('sunucu yine de INVALID_BOARD_CONFIG dönerse (kill switch yarışı) net bir hata gösterir, sessizce 3×3 KURMAZ', async () => {
      signIn()
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'INVALID_BOARD_CONFIG',
            message: 'Bu tahta boyutu şu anda sunulmuyor.',
          }),
          { status: 400 },
        ),
      )
      const user = userEvent.setup()
      render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

      await user.click(screen.getByTestId('tahta-boyut-11'))
      await user.click(screen.getByTestId('btn-oda-kur'))

      expect(push).not.toHaveBeenCalled()
      expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute(
        'data-kod',
        'INVALID_BOARD_CONFIG',
      )
    })
  })

  it('sunucu errorResponseSchema-a UYAN bir gövde dönerse o kodu gösterir', async () => {
    signIn()
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'CODE_GENERATION_FAILED', message: 'x' }), {
        status: 503,
      }),
    )
    const user = userEvent.setup()
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

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
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    const banner = await screen.findByTestId('hata-mesaji')
    expect(banner).not.toBeEmptyDOMElement()
    expect(banner).toHaveTextContent('Sunucuda bir sorun oluştu. Tekrar dene.')
  })

  it('ağ isteği reddedilirse NETWORK hatası gösterir', async () => {
    signIn()
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

    await user.click(screen.getByTestId('btn-oda-kur'))

    expect(await screen.findByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'NETWORK')
  })

  it('UI-002: "Oda kur" ve oda koduna katıl hatası AYNI ANDA tetiklenirse tek hata düğümü kalmalı', async () => {
    signIn()
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<HomeActions enabledSizes={TUM_BOYUTLAR} />)

    // JoinCodeField kendi hatasını üretir: kısa/geçersiz kod, istemci tarafında reddedilir.
    await user.type(screen.getByLabelText('Oda kodu (6 hane)'), 'IO01')
    await user.click(screen.getByTestId('btn-odaya-katil'))

    // HomeActions kendi hatasını üretir: ağ isteği reddedilir.
    await user.click(screen.getByTestId('btn-oda-kur'))

    const banners = await screen.findAllByTestId('hata-mesaji')
    expect(banners).toHaveLength(1)
  })
})
