import { historyRowTestId } from '@xox/shared'
import { render, screen } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryContent } from './HistoryContent'

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

describe('HistoryContent', () => {
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
    render(<HistoryContent />)

    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('oturum yokken hiçbir şey render etmez (middleware zaten yönlendirir)', () => {
    sessionValue = { status: 'unauthenticated', data: null }
    const { container } = render(<HistoryContent />)

    expect(container).toBeEmptyDOMElement()
  })

  it('GET /api/matches çeker; hiçbir bitmiş oyun yoksa tr.history.empty metni gösterilir', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ matches: [] }))

    render(<HistoryContent />)

    expect(await screen.findByText('Henüz tamamlanmış oyunun yok.')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('/api/matches')
  })

  it('GET başarısız olursa (500) hata role="alert" ile görünür', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ code: 'SERVER_ERROR', message: 'x' }, 500))

    render(<HistoryContent />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuda bir sorun oluştu. Tekrar dene.',
    )
  })

  it(
    'KK-116: satırlar gecmis-satir-<n> testid taşır, en yeni oyun ilk satırda, ' +
      'puanlı oyunda +12 ELO işaretli gösterilir',
    async () => {
      sessionValue = authSession
      mockFetch.mockResolvedValue(
        jsonResponse({
          matches: [
            {
              gameId: 'g1',
              finishedAt: Date.UTC(2026, 7, 28, 10, 0),
              opponent: { userId: 'u2', name: 'Rakip Bir' },
              result: 'win',
              endReason: 'line',
              rated: true,
              eloDelta: 12,
            },
            {
              gameId: 'g2',
              finishedAt: Date.UTC(2026, 7, 27, 10, 0),
              opponent: { userId: 'u3', name: 'Rakip İki' },
              result: 'loss',
              endReason: 'resign',
              rated: true,
              eloDelta: -11,
            },
          ],
        }),
      )

      render(<HistoryContent />)

      expect(await screen.findByTestId(historyRowTestId(0))).toHaveTextContent('Rakip Bir')
      expect(screen.getByTestId(historyRowTestId(1))).toHaveTextContent('Rakip İki')
      expect(screen.getByTestId(historyRowTestId(0))).toHaveTextContent('+12')
      expect(screen.getByTestId(historyRowTestId(1))).toHaveTextContent('-11')
    },
  )

  it('KK-116: beraberlikte ELO değişimi tam 0 gösterilir (— değil)', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(
      jsonResponse({
        matches: [
          {
            gameId: 'g1',
            finishedAt: Date.UTC(2026, 7, 28, 10, 0),
            opponent: { userId: 'u2', name: 'Beraberlik Rakibi' },
            result: 'draw',
            endReason: null,
            rated: true,
            eloDelta: 0,
          },
        ],
      }),
    )

    render(<HistoryContent />)

    const row = await screen.findByTestId(historyRowTestId(0))
    expect(row).toHaveTextContent('0')
    expect(row).not.toHaveTextContent('—')
  })

  it('KK-116: puansız oyunda ELO sütunu "—" gösterir', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(
      jsonResponse({
        matches: [
          {
            gameId: 'g1',
            finishedAt: Date.UTC(2026, 7, 28, 10, 0),
            opponent: { userId: 'u2', name: 'Puansız Rakip' },
            result: 'win',
            endReason: 'resign',
            rated: false,
            eloDelta: null,
          },
        ],
      }),
    )

    render(<HistoryContent />)

    expect(await screen.findByTestId(historyRowTestId(0))).toHaveTextContent('—')
  })

  it(
    'KK-077 regresyonu: sunucu finishedAt:null bir kayıt döndüremez ' +
      '(matchesResponseSchema epochMs zorunlu kılar) — boş liste sessizce boş kalır',
    async () => {
      sessionValue = authSession
      mockFetch.mockResolvedValue(jsonResponse({ matches: [] }))

      render(<HistoryContent />)

      expect(await screen.findByText('Henüz tamamlanmış oyunun yok.')).toBeInTheDocument()
      expect(screen.queryByTestId(historyRowTestId(0))).not.toBeInTheDocument()
    },
  )

  it('endReason "timeout" için bitiş sebebi metni satırda görünür', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(
      jsonResponse({
        matches: [
          {
            gameId: 'g1',
            finishedAt: Date.UTC(2026, 7, 28, 10, 0),
            opponent: { userId: 'u2', name: 'Süre Rakibi' },
            result: 'win',
            endReason: 'timeout',
            rated: true,
            eloDelta: 8,
          },
        ],
      }),
    )

    render(<HistoryContent />)

    expect(await screen.findByText('Rakibin süresi doldu — kazandın!')).toBeInTheDocument()
  })

  it('endReason "abandon" için bitiş sebebi metni satırda görünür', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(
      jsonResponse({
        matches: [
          {
            gameId: 'g1',
            finishedAt: Date.UTC(2026, 7, 28, 10, 0),
            opponent: { userId: 'u2', name: 'Terk Rakibi' },
            result: 'win',
            endReason: 'abandon',
            rated: true,
            eloDelta: 5,
          },
        ],
      }),
    )

    render(<HistoryContent />)

    expect(await screen.findByText('Rakibin oyunu terk etti — kazandın!')).toBeInTheDocument()
  })
})
