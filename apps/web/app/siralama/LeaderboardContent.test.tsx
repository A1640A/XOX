import { leaderboardRowTestId } from '@xox/shared'
import { render, screen } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { LeaderboardContent } from './LeaderboardContent'

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

const satir1 = {
  rank: 1,
  userId: 'u1',
  name: 'Birinci',
  elo: 1500,
  wins: 10,
  losses: 2,
  draws: 1,
  ratedGames: 13,
}

const satir2 = {
  rank: 2,
  userId: 'u2',
  name: 'İkinci',
  elo: 1400,
  wins: 8,
  losses: 4,
  draws: 0,
  ratedGames: 12,
}

describe('LeaderboardContent', () => {
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
    render(<LeaderboardContent />)

    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('oturum yokken hiçbir şey render etmez (middleware zaten yönlendirir)', () => {
    sessionValue = { status: 'unauthenticated', data: null }
    const { container } = render(<LeaderboardContent />)

    expect(container).toBeEmptyDOMElement()
  })

  it('GET /api/leaderboard çeker; kimse sıralamada değilse tr.leaderboard.empty metni gösterilir', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ entries: [], you: null }))

    render(<LeaderboardContent />)

    expect(await screen.findByText('Henüz sıralamaya giren oyuncu yok.')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith('/api/leaderboard')
  })

  it('GET başarısız olursa (500) hata role="alert" ile görünür', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ code: 'SERVER_ERROR', message: 'x' }, 500))

    render(<LeaderboardContent />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuda bir sorun oluştu. Tekrar dene.',
    )
  })

  it(
    'satırlar siralama-satir-<rank-1> testid taşır, en yüksek puan ilk satırda, ' +
      'galibiyet/mağlubiyet/beraberlik sayıları görünür',
    async () => {
      sessionValue = authSession
      mockFetch.mockResolvedValue(jsonResponse({ entries: [satir1, satir2], you: null }))

      render(<LeaderboardContent />)

      expect(await screen.findByTestId(leaderboardRowTestId(0))).toHaveTextContent('Birinci')
      expect(screen.getByTestId(leaderboardRowTestId(1))).toHaveTextContent('İkinci')
      expect(screen.getByTestId(leaderboardRowTestId(0))).toHaveTextContent('10/2/1')
      expect(screen.getByTestId(leaderboardRowTestId(1))).toHaveTextContent('8/4/0')
    },
  )

  it('KK-115: kullanıcı ilk 50 dışındaysa kendi satırı listenin ALTINDA ayrıca görünür', async () => {
    sessionValue = authSession
    const you = {
      rank: 77,
      userId: 'me',
      name: 'Ben',
      elo: 900,
      wins: 3,
      losses: 5,
      draws: 0,
      ratedGames: 8,
    }
    mockFetch.mockResolvedValue(jsonResponse({ entries: [satir1], you }))

    render(<LeaderboardContent />)

    const row = await screen.findByTestId(leaderboardRowTestId(76))
    expect(row).toHaveTextContent('77')
    expect(row).toHaveTextContent('Ben')
    expect(row).toHaveTextContent('Senin sıran')
  })

  it('KK-115: kullanıcı ilk 50 içindeyse kendi satırı ayrıca TEKRAR gösterilmez', async () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ entries: [satir1, satir2], you: null }))

    render(<LeaderboardContent />)

    await screen.findByTestId(leaderboardRowTestId(0))
    expect(screen.queryByText('Senin sıran')).not.toBeInTheDocument()
  })

  it('sayfa başlığının altında sıralamaya girme eşiği (5 puanlı oyun) metni her zaman görünür', () => {
    sessionValue = authSession
    mockFetch.mockResolvedValue(jsonResponse({ entries: [satir1], you: null }))

    render(<LeaderboardContent />)

    expect(
      screen.getByText('Sıralamaya girmek için en az 5 puanlı oyun oynamalısın.'),
    ).toBeInTheDocument()
  })
})
