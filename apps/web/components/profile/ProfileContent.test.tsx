import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileContent } from './ProfileContent'

const signOut = vi.fn<(...args: unknown[]) => Promise<void>>()
let sessionValue: { data: unknown; status: string } = { data: null, status: 'unauthenticated' }

vi.mock('next-auth/react', () => ({
  useSession: () => sessionValue,
  signOut: (...args: unknown[]) => signOut(...args),
}))

const PROFILE_BODY = {
  name: 'Ayşe Yılmaz',
  email: 'ayse@example.com',
  stats: { wins: 3, losses: 1, draws: 2 },
  elo: 1234,
  ratedGames: 6,
  theme: 'acik' as const,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const authSession = {
  status: 'authenticated',
  data: { user: { id: 'u1', name: 'Ayşe Yılmaz', email: 'ayse@example.com' } },
}

describe('ProfileContent', () => {
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    document.documentElement.removeAttribute('data-tema')
    document.cookie = 'xox-tema=; path=/; max-age=0'
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    signOut.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('oturum yüklenirken yükleniyor metni gösterir', () => {
    sessionValue = { status: 'loading', data: null }
    render(<ProfileContent />)

    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('oturum yokken hiçbir şey render etmez (middleware zaten yönlendirir)', () => {
    sessionValue = { status: 'unauthenticated', data: null }
    const { container } = render(<ProfileContent />)

    expect(container).toBeEmptyDOMElement()
  })

  it(
    'KK-080: oturumluysa GET /api/profile çeker; e-posta ve galibiyet/mağlubiyet/beraberlik ' +
      'sayıları users.stats ile birebir görünür',
    async () => {
      sessionValue = authSession
      mockFetch.mockResolvedValue(jsonResponse(PROFILE_BODY))

      render(<ProfileContent />)

      expect(await screen.findByText('ayse@example.com')).toBeInTheDocument()
      expect(screen.getByTestId('istatistik-galibiyet')).toHaveTextContent('3')
      expect(screen.getByTestId('istatistik-maglubiyet')).toHaveTextContent('1')
      expect(screen.getByTestId('istatistik-beraberlik')).toHaveTextContent('2')
      expect(screen.getByTestId('elo-puani')).toHaveTextContent('1234')
      expect(mockFetch).toHaveBeenCalledWith('/api/profile')
    },
  )

  it('GET başarısız olursa (500) hata role="alert" ile görünür', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ code: 'SERVER_ERROR', message: 'x' }, 500))

    render(<ProfileContent />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuda bir sorun oluştu. Tekrar dene.',
    )
  })

  it('Çıkış yap düğmesi signOut çağırır', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse(PROFILE_BODY))
    const user = userEvent.setup()
    render(<ProfileContent />)
    await screen.findByText('ayse@example.com')

    await user.click(screen.getByRole('button', { name: 'Çıkış yap' }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' })
  })

  describe('ad düzenleme', () => {
    it(
      'KK-082: yeni ad kaydedilince PATCH /api/profile {name} çağrılır, güncel ad görünür ve ' +
        'başarı mesajı duyurulur',
      async () => {
        sessionValue = authSession
        mockFetch
          .mockResolvedValueOnce(jsonResponse(PROFILE_BODY))
          .mockResolvedValueOnce(jsonResponse({ ...PROFILE_BODY, name: 'Yeni Ad' }))
        const user = userEvent.setup()
        render(<ProfileContent />)
        await screen.findByText('ayse@example.com')

        const input = screen.getByLabelText('Görünen ad')
        await user.clear(input)
        await user.type(input, 'Yeni Ad')
        await user.click(screen.getByRole('button', { name: 'Kaydet' }))

        await waitFor(() => {
          expect(screen.getByRole('status')).toHaveTextContent('Adın güncellendi.')
        })
        expect(mockFetch).toHaveBeenLastCalledWith('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Yeni Ad' }),
        })
      },
    )

    it(
      'KK-082: sunucu 400 INVALID_NAME döndürürse hata role="alert" ile görünür ve düğme ' +
        'tekrar tıklanabilir hâle döner (pending sonsuza kalmaz)',
      async () => {
        sessionValue = authSession
        mockFetch
          .mockResolvedValueOnce(jsonResponse(PROFILE_BODY))
          .mockResolvedValueOnce(jsonResponse({ code: 'INVALID_NAME', message: 'x' }, 400))
        const user = userEvent.setup()
        render(<ProfileContent />)
        await screen.findByText('ayse@example.com')

        await user.click(screen.getByRole('button', { name: 'Kaydet' }))

        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Görünen ad 2 ile 40 karakter arasında olmalı.',
        )
        expect(screen.getByRole('button', { name: 'Kaydet' })).not.toBeDisabled()
      },
    )
  })

  describe('tema değiştirici', () => {
    it(
      'KK-083: Koyu seçilince <html data-tema="koyu"> hemen uygulanır (yenileme olmadan) ' +
        've PATCH /api/profile {theme} çağrılır',
      async () => {
        sessionValue = authSession
        mockFetch
          .mockResolvedValueOnce(jsonResponse(PROFILE_BODY))
          .mockResolvedValueOnce(jsonResponse({ ...PROFILE_BODY, theme: 'koyu' }))
        const user = userEvent.setup()
        render(<ProfileContent />)
        await screen.findByText('ayse@example.com')

        await user.click(screen.getByRole('button', { name: 'Koyu' }))

        expect(document.documentElement.getAttribute('data-tema')).toBe('koyu')
        expect(document.cookie).toContain('xox-tema=koyu')
        await waitFor(() => {
          expect(mockFetch).toHaveBeenLastCalledWith('/api/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: 'koyu' }),
          })
        })
      },
    )

    it('tema PATCH isteği ağ hatasıyla başarısız olursa önceki temaya geri döner ve hata gösterir', async () => {
      sessionValue = authSession
      mockFetch
        .mockResolvedValueOnce(jsonResponse(PROFILE_BODY))
        .mockRejectedValueOnce(new Error('ağ hatası'))
      const user = userEvent.setup()
      render(<ProfileContent />)
      await screen.findByText('ayse@example.com')

      await user.click(screen.getByRole('button', { name: 'Koyu' }))

      await waitFor(() => {
        expect(document.documentElement.getAttribute('data-tema')).toBe('acik')
      })
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Bağlantı sorunu. İnternetini kontrol et.',
      )
    })
  })
})
