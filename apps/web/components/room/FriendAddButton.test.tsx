import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendAddButton } from './FriendAddButton'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('FriendAddButton', () => {
  const mockFetch = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('visible=false iken hiçbir şey render etmez', () => {
    const { container } = render(<FriendAddButton opponentId="u2" visible={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opponentId=null iken hiçbir şey render etmez (henüz rakip yok)', () => {
    const { container } = render(<FriendAddButton opponentId={null} visible={true} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('KK-125: tıklanınca POST /api/friends {userId:opponentId} çağrılır', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    const user = userEvent.setup()
    render(<FriendAddButton opponentId="u2" visible={true} />)

    await user.click(screen.getByRole('button', { name: 'Arkadaş ekle' }))

    expect(mockFetch).toHaveBeenCalledWith('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u2' }),
    })
  })

  it('başarılı istekten sonra "istek gönderildi" mesajı gösterilir ve düğme tekrar tıklanamaz', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    const user = userEvent.setup()
    render(<FriendAddButton opponentId="u2" visible={true} />)

    await user.click(screen.getByRole('button', { name: 'Arkadaş ekle' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Arkadaşlık isteği gönderildi.')
    })
    expect(screen.getByRole('button', { name: 'Arkadaş ekle' })).toBeDisabled()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('sunucu 403 NOT_FRIENDS_ELIGIBLE döndürürse hata role="alert" ile görünür', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ code: 'NOT_FRIENDS_ELIGIBLE', message: 'x' }, 403))
    const user = userEvent.setup()
    render(<FriendAddButton opponentId="u2" visible={true} />)

    await user.click(screen.getByRole('button', { name: 'Arkadaş ekle' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Yalnızca birlikte oyun bitirdiğin oyuncuları ekleyebilirsin.',
    )
  })

  it(
    'ağ hatasında pending FINALLY ile düşer — düğme tekrar tıklanabilir hâle döner ' +
      '(sonsuza kadar devre dışı kalmaz)',
    async () => {
      mockFetch.mockRejectedValue(new Error('ağ hatası'))
      const user = userEvent.setup()
      render(<FriendAddButton opponentId="u2" visible={true} />)

      await user.click(screen.getByRole('button', { name: 'Arkadaş ekle' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Bağlantı sorunu. İnternetini kontrol et.',
      )
      expect(screen.getByRole('button', { name: 'Arkadaş ekle' })).not.toBeDisabled()
    },
  )
})
