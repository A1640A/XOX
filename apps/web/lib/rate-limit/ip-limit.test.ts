import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  createIndex: vi.fn().mockResolvedValue('expireAt_1'),
}))

vi.mock('@xox/db', () => ({
  getDbName: vi.fn().mockReturnValue('xox_test'),
  getMongoClient: vi.fn().mockResolvedValue({
    db: () => ({
      collection: () => ({
        findOneAndUpdate: mocks.findOneAndUpdate,
        createIndex: mocks.createIndex,
      }),
    }),
  }),
}))

process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://xox.test/api/auth/register', { method: 'POST', headers })
}

describe('eşik sabitleri', () => {
  it('SEC-002 kabul kriterinde belirtilen değerlerde SABİTLENİR (elle yazılmış beklenti)', async () => {
    const { IP_RATE_LIMIT_MAX_REQUESTS, IP_RATE_LIMIT_WINDOW_SECONDS } = await import('./ip-limit')
    expect(IP_RATE_LIMIT_MAX_REQUESTS).toBe(20)
    expect(IP_RATE_LIMIT_WINDOW_SECONDS).toBe(60)
  })
})

describe('extractClientIp', () => {
  it('x-forwarded-for içindeki İLK adresi alır (proxy zincirinde istemciye en yakın)', async () => {
    const { extractClientIp } = await import('./ip-limit')
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' })
    expect(extractClientIp(req)).toBe('203.0.113.9')
  })

  it('x-forwarded-for yoksa x-real-ip kullanılır', async () => {
    const { extractClientIp } = await import('./ip-limit')
    const req = makeRequest({ 'x-real-ip': '198.51.100.7' })
    expect(extractClientIp(req)).toBe('198.51.100.7')
  })

  it('hiçbiri yoksa sabit bir gruba düşer (istekler yine BİRLİKTE sınırlanır)', async () => {
    const { extractClientIp } = await import('./ip-limit')
    expect(extractClientIp(makeRequest())).toBe('ip-cozulemedi')
  })
})

describe('checkIpRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sayaç eşiğin ALTINDAYSA allowed=true ve remaining doğru hesaplanır', async () => {
    const expireAt = new Date(Date.now() + 30_000)
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'k', count: 5, expireAt })

    const { checkIpRateLimit, IP_RATE_LIMIT_MAX_REQUESTS } = await import('./ip-limit')
    const result = await checkIpRateLimit(makeRequest(), 'auth-write')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(IP_RATE_LIMIT_MAX_REQUESTS - 5)
  })

  it('sayaç tam sınırdaysa (count === limit) HÂLÂ allowed=true — sınır dahil', async () => {
    const expireAt = new Date(Date.now() + 30_000)
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'k', count: 20, expireAt })

    const { checkIpRateLimit } = await import('./ip-limit')
    const result = await checkIpRateLimit(makeRequest(), 'auth-write')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('sayaç sınırı AŞMIŞSA allowed=false ve retryAfterSeconds pencerenin bitişinden türer', async () => {
    const expireAt = new Date(Date.now() + 42_000)
    mocks.findOneAndUpdate.mockResolvedValue({ _id: 'k', count: 21, expireAt })

    const { checkIpRateLimit } = await import('./ip-limit')
    const result = await checkIpRateLimit(makeRequest(), 'auth-write')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(41)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(42)
  })

  it("_id anahtarı routeGroup + IP'den türetilir, ham IP DEĞİL (hash)", async () => {
    mocks.findOneAndUpdate.mockResolvedValue({
      _id: 'k',
      count: 1,
      expireAt: new Date(Date.now() + 60_000),
    })

    const { checkIpRateLimit } = await import('./ip-limit')
    await checkIpRateLimit(makeRequest({ 'x-forwarded-for': '203.0.113.9' }), 'auth-write')

    const [filter] = mocks.findOneAndUpdate.mock.calls[0] as [{ _id: string }]
    expect(filter._id).toMatch(/^[0-9a-f]{64}$/)
    expect(filter._id).not.toContain('203.0.113.9')
  })

  it('aynı IP + FARKLI routeGroup FARKLI anahtara düşer (bucketlar karışmaz)', async () => {
    mocks.findOneAndUpdate.mockResolvedValue({
      _id: 'k',
      count: 1,
      expireAt: new Date(Date.now() + 60_000),
    })
    const { checkIpRateLimit } = await import('./ip-limit')
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.9' })

    await checkIpRateLimit(req, 'auth-write')
    await checkIpRateLimit(req, 'auth-other')

    const [firstFilter] = mocks.findOneAndUpdate.mock.calls[0] as [{ _id: string }]
    const [secondFilter] = mocks.findOneAndUpdate.mock.calls[1] as [{ _id: string }]
    expect(firstFilter._id).not.toBe(secondFilter._id)
  })
})
