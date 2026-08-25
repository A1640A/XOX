import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  it('x-real-ip VARSA HER ZAMAN önceliklidir (edge-kaynaklı, istemci tarafından yazılamaz)', async () => {
    const { extractClientIp } = await import('./ip-limit')
    const req = makeRequest({ 'x-real-ip': '198.51.100.7' })
    expect(extractClientIp(req)).toBe('198.51.100.7')
  })

  it(
    'GÜVENLİK DENETİMİ — BLOCKER-2: x-real-ip VE x-forwarded-for BİRLİKTE geldiğinde ' +
      'x-real-ip KAZANIR — uydurma bir XFF ilk halkası artık HİÇBİR ŞEYİ DEĞİŞTİRMEZ',
    async () => {
      const { extractClientIp } = await import('./ip-limit')
      const req = makeRequest({
        'x-real-ip': '198.51.100.7',
        'x-forwarded-for': 'rastgele-uydurma-deger, 198.51.100.7',
      })
      expect(extractClientIp(req)).toBe('198.51.100.7')
    },
  )

  it(
    'BLOCKER-2 REGRESYON — ONCESI/SONRASI: eski kod XFFin ILK (istemci kontrolundeki) ' +
      'halkasini okurdu; yeni kod x-real-ip degerini (veya yoksa XFFin SON halkasini) okur',
    async () => {
      const { extractClientIp } = await import('./ip-limit')
      const req = makeRequest({
        'x-real-ip': '198.51.100.7',
        'x-forwarded-for': 'saldirgan-uydurmasi-1, saldirgan-uydurmasi-2',
      })
      const eskiDavranis = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const simdikiDavranis = extractClientIp(req)
      expect(eskiDavranis).toBe('saldirgan-uydurmasi-1')
      expect(simdikiDavranis).toBe('198.51.100.7')
      expect(eskiDavranis).not.toBe(simdikiDavranis)
    },
  )

  it('x-real-ip YOKSA x-forwarded-for zincirinin SON (edge tarafından eklenen) halkası kullanılır', async () => {
    const { extractClientIp } = await import('./ip-limit')
    const req = makeRequest({ 'x-forwarded-for': 'istemci-uydurmasi, 203.0.113.9' })
    expect(extractClientIp(req)).toBe('203.0.113.9')
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

/**
 * GÜVENLİK DENETİMİ — eksik test (pencere kayması). Yukarıdaki testler
 * `findOneAndUpdate`e ELLE VERİLMİŞ bir sonuç enjekte ediyor — Mongo'nun
 * aggregation-pipeline `$cond`ının KENDİSİNİ hiç ÇALIŞTIRMIYOR. Aşağıdaki
 * blok, gerçek pipeline'ımızın gövdesindeki AYNI koşulu (`expireAt > now`
 * ise artır, değilse 1'e sıfırla) durum-bilgili bir sahte koleksiyonda
 * TEKRARLAYIP `vi.useFakeTimers()` ile pencere sınırını GERÇEKTEN aşıyor —
 * "pencere sonunda 1'e resetlenir" iddiasını artık BİR ŞEY sınıyor.
 * (Gerçek Mongo'ya karşı canlı kanıt: SEC-002 raporundaki preview
 * denemesinde 60 sn beklendikten sonra sayaç fiilen 1'den başladı.)
 */
describe('pencere kayması (durum bilgili sahte Mongo, gerçek pipeline koşulu tekrarlanır)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pencere içinde ardışık istekler sayacı ARTIRIR; pencere süresi DOLUNCA sayaç 1 değerine RESETLENİR', async () => {
    const store = new Map<string, { count: number; expireAt: Date }>()
    mocks.findOneAndUpdate.mockImplementation(
      (filter: { _id: string }): { _id: string; count: number; expireAt: Date } => {
        const now = new Date()
        const existing = store.get(filter._id)
        const doc =
          existing !== undefined && existing.expireAt.getTime() > now.getTime()
            ? { _id: filter._id, count: existing.count + 1, expireAt: existing.expireAt }
            : { _id: filter._id, count: 1, expireAt: new Date(now.getTime() + 60_000) }
        store.set(filter._id, doc)
        return doc
      },
    )

    const { checkIpRateLimit } = await import('./ip-limit')
    const req = makeRequest({ 'x-real-ip': '203.0.113.50' })

    const first = await checkIpRateLimit(req, 'pencere-testi')
    expect(first.remaining).toBe(19) // count=1

    const second = await checkIpRateLimit(req, 'pencere-testi')
    expect(second.remaining).toBe(18) // count=2 — AYNI pencerede birikiyor

    vi.advanceTimersByTime(61_000) // pencereyi (60 sn) geçir

    const third = await checkIpRateLimit(req, 'pencere-testi')
    expect(third.remaining).toBe(19) // count YENİDEN 1 — RESETLENDİ, 3 DEĞİL
  })
})
