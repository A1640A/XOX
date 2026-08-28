// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Yalnız `@/auth`'un `auth()` fonksiyonu ve `@xox/db`'nin `getLeaderboardView`
 * çağrısı mock'lanır — `resolveIdentity` GERÇEK kodla çalışır (aynı disiplin:
 * `apps/web/app/api/matches/route.test.ts`, `.../friends/route.test.ts`).
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
const mockGetLeaderboardView = vi.fn()

vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  getLeaderboardView: mockGetLeaderboardView,
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(): Request {
  return new Request('https://xox.test/api/leaderboard')
}

const SESSION = { user: { id: 'me', name: 'Ben' } }

const dbEntry = {
  rank: 1,
  userId: 'u1',
  name: 'Ömer',
  elo: 1240,
  stats: { wins: 4, losses: 1, draws: 0 },
  ratedGames: 5,
}

const dtoEntry = {
  rank: 1,
  userId: 'u1',
  name: 'Ömer',
  elo: 1240,
  wins: 4,
  losses: 1,
  draws: 0,
  ratedGames: 5,
}

describe('GET /api/leaderboard — gerçek resolveIdentity, yalnız auth()+@xox/db mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockGetLeaderboardView.mockReset()
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
    expect(mockGetLeaderboardView).not.toHaveBeenCalled()
  })

  it('oturumluysa ilk 50 satırı düz alanlara (wins/losses/draws) eşleyerek döner', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetLeaderboardView.mockResolvedValue({ top: [dbEntry], self: null })

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({ entries: [dtoEntry], you: null })
    expect(mockGetLeaderboardView).toHaveBeenCalledWith('me')
  })

  it('KK-115: kullanıcı ilk 50 dışındaysa "you" kendi satırını taşır', async () => {
    mockAuth.mockResolvedValue(SESSION)
    const self = { ...dbEntry, rank: 77, userId: 'me' }
    mockGetLeaderboardView.mockResolvedValue({ top: [dbEntry], self })

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    const json = (await response.json()) as { you: { rank: number; userId: string } | null }
    expect(json.you).not.toBeNull()
    expect(json.you?.rank).toBe(77)
    expect(json.you?.userId).toBe('me')
  })

  it('KK-115: kullanıcı ilk 50 içindeyse "you" null döner (aynı satır iki kez gösterilmez)', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetLeaderboardView.mockResolvedValue({ top: [dbEntry], self: null })

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    const json = (await response.json()) as { you: unknown }
    expect(json.you).toBeNull()
  })

  it('sıralamaya giren kimse yoksa boş entries döner', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetLeaderboardView.mockResolvedValue({ top: [], self: null })

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({ entries: [], you: null })
  })

  it('DB katmanı fırlatırsa 500 SERVER_ERROR döner, stack sızmaz', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockGetLeaderboardView.mockRejectedValue(new Error('mongo patladı, gizli detay'))

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toStrictEqual({ code: 'SERVER_ERROR', message: 'Sıralama alınamadı.' })
    expect(JSON.stringify(json)).not.toContain('mongo patladı')
  })

  it('sunucudan bozuk (şemayla uyuşmayan) veri gelirse 500 döner, ham gövde sızmaz', async () => {
    mockAuth.mockResolvedValue(SESSION)
    // negatif `wins` `leaderboardEntrySchema`'nın `nonnegative()`'ini ihlal eder.
    mockGetLeaderboardView.mockResolvedValue({
      top: [{ ...dbEntry, stats: { wins: -1, losses: 0, draws: 0 } }],
      self: null,
    })

    const { GET } = await import('./route')
    const response = await GET(makeRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toStrictEqual({
      code: 'SERVER_ERROR',
      message: 'Sıralama alınamadı.',
    })
  })
})
