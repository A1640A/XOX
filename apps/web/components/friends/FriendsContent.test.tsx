import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendsContent } from './FriendsContent'

let sessionValue: { data: unknown; status: string } = { data: null, status: 'unauthenticated' }

vi.mock('next-auth/react', () => ({
  useSession: () => sessionValue,
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const authSession = {
  status: 'authenticated',
  data: { user: { id: 'me', name: 'Ben' } },
}

const EMPTY_VIEW = { friends: [], incoming: [], outgoing: [] }

describe('FriendsContent', () => {
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('oturum yüklenirken yükleniyor metni gösterir', () => {
    sessionValue = { status: 'loading', data: null }
    render(<FriendsContent />)

    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('oturum yokken hiçbir şey render etmez (middleware zaten yönlendirir)', () => {
    sessionValue = { status: 'unauthenticated', data: null }
    const { container } = render(<FriendsContent />)

    expect(container).toBeEmptyDOMElement()
  })

  it('GET /api/friends çeker; hiçbir ilişki yoksa tr.friends.empty metni gösterilir', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse(EMPTY_VIEW))

    render(<FriendsContent />)

    expect(
      await screen.findByText('Henüz arkadaşın yok. Bir oyun bitir ve rakibini ekle.'),
    ).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('/api/friends')
  })

  it('GET başarısız olursa (500) hata role="alert" ile görünür', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ code: 'SERVER_ERROR', message: 'x' }, 500))

    render(<FriendsContent />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuda bir sorun oluştu. Tekrar dene.',
    )
  })

  it('KK-127: arkadaş listesini (ad, ELO) gösterir, Çıkar tıklanınca DELETE çağrılır ve satır kalkar', async () => {
    sessionValue = authSession
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          friends: [{ userId: 'u2', name: 'Arkadaş Adı', elo: 1234 }],
          incoming: [],
          outgoing: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const user = userEvent.setup()
    render(<FriendsContent />)

    expect(await screen.findByText('Arkadaş Adı · 1234')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Çıkar' }))

    expect(mockFetch).toHaveBeenLastCalledWith('/api/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u2' }),
    })
    await waitFor(() => {
      expect(screen.queryByText('Arkadaş Adı · 1234')).not.toBeInTheDocument()
    })
  })

  it(
    'KK-125: bekleyen istekleri gösterir; Kabul et tıklanınca PATCH {action:"accept"} ' +
      'çağrılır ve satır arkadaş listesine taşınır',
    async () => {
      sessionValue = authSession
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            friends: [],
            incoming: [{ userId: 'u3', name: 'Gelen İstek', elo: 999 }],
            outgoing: [],
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ ok: true }))
      const user = userEvent.setup()
      render(<FriendsContent />)

      expect(await screen.findByText('Gelen İstek · 999')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Kabul et' }))

      expect(mockFetch).toHaveBeenLastCalledWith('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'u3', action: 'accept' }),
      })
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Kabul et' })).not.toBeInTheDocument()
      })
      expect(screen.getByText('Gelen İstek · 999')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Çıkar' })).toBeInTheDocument()
    },
  )

  it('Reddet tıklanınca PATCH {action:"reject"} çağrılır ve satır tamamen kalkar', async () => {
    sessionValue = authSession
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          friends: [],
          incoming: [{ userId: 'u4', name: 'Reddedilecek', elo: 800 }],
          outgoing: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    const user = userEvent.setup()
    render(<FriendsContent />)

    expect(await screen.findByText('Reddedilecek · 800')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reddet' }))

    expect(mockFetch).toHaveBeenLastCalledWith('/api/friends', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u4', action: 'reject' }),
    })
    await waitFor(() => {
      expect(screen.queryByText('Reddedilecek · 800')).not.toBeInTheDocument()
    })
  })

  it('PATCH ağ hatasıyla başarısız olursa hata gösterilir ve düğme tekrar tıklanabilir', async () => {
    sessionValue = authSession
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          friends: [],
          incoming: [{ userId: 'u5', name: 'Hata Testi', elo: 700 }],
          outgoing: [],
        }),
      )
      .mockRejectedValueOnce(new Error('ağ hatası'))
    const user = userEvent.setup()
    render(<FriendsContent />)

    expect(await screen.findByText('Hata Testi · 700')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kabul et' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bağlantı sorunu. İnternetini kontrol et.',
    )
    expect(screen.getByRole('button', { name: 'Kabul et' })).not.toBeDisabled()
  })
})
