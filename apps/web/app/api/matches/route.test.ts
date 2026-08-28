// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Yalnız `@/auth`'un `auth()` fonksiyonu ve `@xox/db`'nin `getMatchHistory`
 * çağrısı mock'lanır — `resolveIdentity` GERÇEK kodla çalışır (aynı disiplin:
 * `apps/web/app/api/friends/route.test.ts`, `.../profile/route.test.ts`).
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
const mockGetMatchHistory = vi.fn()

vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  getMatchHistory: mockGetMatchHistory,
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(): Request {
  return new Request('https://xox.test/api/matches')
}

const SESSION = { user: { id: 'me', name: 'Ben' } }

describe('GET /api/matches — gerçek resolveIdentity, yalnız auth()+@xox/db mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockGetMatchHistory.mockReset()
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('oturumsuzsa 401 UNAUTHENTICATED döner, DB hiç sorgulanmaz', async () => {
    mockAuth.mockResolvedValue(null)

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual({
      code: 'UNAUTHENTICATED',
      message: 'Oturum bulunamadı.',
    })
    expect(mockGetMatchHistory).not.toHaveBeenCalled()
  })

  it('oturumluysa maç listesini döner ve getMatchHistory(userId) çağrılır', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetMatchHistory.mockResolvedValue([
      {
        gameId: 'g1',
        finishedAt: 1_700_000_000_000,
        opponent: { userId: 'u2', name: 'Rakip' },
        result: 'win',
        endReason: 'line',
        rated: true,
        eloDelta: 12,
      },
      {
        gameId: 'g2',
        finishedAt: 1_699_999_000_000,
        opponent: { userId: 'u3', name: 'Diğer Rakip' },
        result: 'loss',
        endReason: 'timeout',
        rated: false,
        eloDelta: null,
      },
    ])

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({
      matches: [
        {
          gameId: 'g1',
          finishedAt: 1_700_000_000_000,
          opponent: { userId: 'u2', name: 'Rakip' },
          result: 'win',
          endReason: 'line',
          rated: true,
          eloDelta: 12,
        },
        {
          gameId: 'g2',
          finishedAt: 1_699_999_000_000,
          opponent: { userId: 'u3', name: 'Diğer Rakip' },
          result: 'loss',
          endReason: 'timeout',
          rated: false,
          eloDelta: null,
        },
      ],
    })
    expect(mockGetMatchHistory).toHaveBeenCalledWith('me')
  })

  it('KK-077: sonuç boşsa (bitmiş oyun yoksa) boş matches dizisi döner', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetMatchHistory.mockResolvedValue([])

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({ matches: [] })
  })

  it('puansız bir maç ELO değişimi olmadan (null) taşınır', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetMatchHistory.mockResolvedValue([
      {
        gameId: 'g1',
        finishedAt: 1_700_000_000_000,
        opponent: { userId: 'u2', name: 'Rakip' },
        result: 'draw',
        endReason: null,
        rated: false,
        eloDelta: null,
      },
    ])

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    const json = (await response.json()) as { matches: { eloDelta: number | null }[] }
    expect(json.matches[0]?.eloDelta).toBeNull()
  })

  it('DB katmanı fırlatırsa 500 SERVER_ERROR döner, stack sızmaz', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetMatchHistory.mockRejectedValue(new Error('mongo patladı, gizli detay'))

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toStrictEqual({ code: 'SERVER_ERROR', message: 'Maç geçmişi alınamadı.' })
    expect(JSON.stringify(json)).not.toContain('mongo patladı')
  })

  it('sunucudan bozuk (şemayla uyuşmayan) veri gelirse 500 döner, ham gövde sızmaz', async () => {
    mockAuth.mockResolvedValue(SESSION)
    // `rated:true` ile `eloDelta:null` matchSchema'nın superRefine'ını ihlal eder.
    mockGetMatchHistory.mockResolvedValue([
      {
        gameId: 'g1',
        finishedAt: 1_700_000_000_000,
        opponent: { userId: 'u2', name: 'Rakip' },
        result: 'win',
        endReason: 'line',
        rated: true,
        eloDelta: null,
      },
    ])

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toStrictEqual({
      code: 'SERVER_ERROR',
      message: 'Maç geçmişi alınamadı.',
    })
  })
})
