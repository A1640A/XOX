import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@xox/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  User: { create: vi.fn(), findOne: vi.fn() },
}))

vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
}))

/**
 * SEC-002 — bu dosya `checkIpRateLimit`'i (gerçek Mongo'ya dokunan) mock'lar;
 * IP hız sınırının kendi davranışı `lib/rate-limit/ip-limit.test.ts`te ayrı
 * test edilir. Burada yalnız route'un sınıra UYDUĞU (aşılınca 429, aşılmayınca
 * normal akışa devam) doğrulanır.
 */
vi.mock('@/lib/rate-limit/ip-limit', () => ({
  checkIpRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 20,
    remaining: 19,
    retryAfterSeconds: 60,
  }),
}))

function makeRequest(body: unknown): Request {
  return new Request('https://xox.test/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** `User.findOne(...).select('_id').lean()` zincirinin sahte hali. */
function mockFindOneResolves(doc: unknown): { select: () => { lean: () => Promise<unknown> } } {
  const lean = vi.fn().mockResolvedValue(doc)
  const select = vi.fn().mockReturnValue({ lean })
  return { select }
}

describe('POST /api/auth/register', () => {
  beforeEach(async () => {
    const { User } = await import('@xox/db')
    // Varsayılan: e-posta henüz kayıtlı değil (ön kontrol "yok" görür).
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
    vi.mocked(User.findOne).mockReturnValue(mockFindOneResolves(null) as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('geçerli gövdeyle 201 ve userId döner; passwordHash asla sızmaz', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockResolvedValue({
      _id: 'yeni-kullanici-1',
      name: 'Ayşe',
      email: 'ayse@xox.test',
      passwordHash: '$argon2id$mock-hash',
    } as never)

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'AYSE@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
    )

    expect(response.status).toBe(201)
    const json = (await response.json()) as Record<string, unknown>
    expect(json).toStrictEqual({ userId: 'yeni-kullanici-1' })
    expect(JSON.stringify(json)).not.toContain('passwordHash')
    expect(JSON.stringify(json)).not.toContain('argon2id')
  })

  it('e-postayı küçük harfe çevirip DB çağrısına öyle iletir', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockResolvedValue({ _id: 'x', email: 'ayse@xox.test' } as never)

    const { POST } = await import('./route')
    await POST(
      makeRequest({ email: 'AYSE@XOX.TEST', password: 'test-parola1', displayName: 'Ayşe' }),
    )

    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'ayse@xox.test' }))
  })

  it('kısa parola 400 WEAK_PASSWORD döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'a@xox.test', password: 'kisa', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'WEAK_PASSWORD' })
  })

  it('geçersiz e-posta 400 INVALID_EMAIL döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'gecersiz-eposta', password: 'test-parola1', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_EMAIL' })
  })

  it(
    'GÜVENLİK: 254 karakterden uzun e-posta 400 INVALID_EMAIL döner ' +
      "(Mongo'nun indeks anahtarı sınırını aşıp 500'e dönüşmeden ÖNCE reddedilir)",
    async () => {
      const uzunEposta = `${'a'.repeat(250)}@xox.test`
      expect(uzunEposta.length).toBeGreaterThan(254)

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ email: uzunEposta, password: 'test-parola1', displayName: 'Ayşe' }),
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_EMAIL' })
    },
  )

  it('çok kısa görünen ad 400 INVALID_NAME döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'a@xox.test', password: 'test-parola1', displayName: 'A' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_NAME' })
  })

  it('bozuk JSON gövdesi 400 döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://xox.test/api/auth/register', { method: 'POST', body: '{bozuk' }),
    )
    expect(response.status).toBe(400)
  })

  it(
    'GÜVENLİK (denetim madde 5): e-posta ZATEN kayıtlıysa 409 EMAIL_TAKEN döner ' +
      've argon2id hash HİÇ ÇALIŞTIRILMAZ (pahalı hash duplicate kontrolünden SONRA değil ÖNCE atlanır)',
    async () => {
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
      vi.mocked(User.findOne).mockReturnValue(mockFindOneResolves({ _id: 'zaten-var' }) as never)
      const { hashPassword } = await import('@/lib/auth/password')

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ email: 'var@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
      )

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'EMAIL_TAKEN' })
      expect(hashPassword).not.toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız çağrı kaydı okunuyor
      expect(User.create).not.toHaveBeenCalled()
    },
  )

  it(
    'YARIŞ KOŞULU YEDEĞİ: ön kontrol "yok" görse de eşzamanlı yazma E11000 ile ' +
      'çakışırsa yine 409 EMAIL_TAKEN döner (unique indeks nihai doğruluk kaynağı)',
    async () => {
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      vi.mocked(User.create).mockRejectedValue({ code: 11000 })

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ email: 'yaris@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
      )
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'EMAIL_TAKEN' })
    },
  )

  it(
    'SEC-002: IP hız sınırı AŞILMIŞSA 429 RATE_LIMITED döner, retry-after/' +
      'x-ratelimit-* başlıkları set edilir ve User.findOne HİÇ ÇAĞRILMAZ ' +
      '(argon2/DB maliyeti ödenmeden kısa devre)',
    async () => {
      const { checkIpRateLimit } = await import('@/lib/rate-limit/ip-limit')
      vi.mocked(checkIpRateLimit).mockResolvedValueOnce({
        allowed: false,
        limit: 20,
        remaining: 0,
        retryAfterSeconds: 42,
      })
      const { User } = await import('@xox/db')

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ email: 'sinir@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
      )

      expect(response.status).toBe(429)
      expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' })
      expect(response.headers.get('retry-after')).toBe('42')
      expect(response.headers.get('x-ratelimit-limit')).toBe('20')
      expect(response.headers.get('x-ratelimit-remaining')).toBe('0')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız çağrı kaydı okunuyor
      expect(User.findOne).not.toHaveBeenCalled()
    },
  )

  it('SEC-002: IP hız sınırı eşiğin ALTINDAYSA normal akış devam eder (201)', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockResolvedValue({ _id: 'x', email: 'sinir-altinda@xox.test' } as never)

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({
        email: 'sinir-altinda@xox.test',
        password: 'test-parola1',
        displayName: 'Ayşe',
      }),
    )

    expect(response.status).toBe(201)
  })

  it('beklenmeyen DB hatası 500 SERVER_ERROR döner ve mesajı sızdırmaz', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:27017 gizli-detay'))

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'b@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toMatchObject({ code: 'SERVER_ERROR' })
    expect(JSON.stringify(json)).not.toContain('10.0.0.1')
  })

  /**
   * W2-04 MASKELEME SONDASI (SINIF: parola/e-posta) — bu test kayıt akışının
   * GERÇEK hata yolunu (`route.ts`'in `catch` bloğu, artık `lib/log.ts`'e
   * bağlı) çalıştırır ve `console.error`'a giden ÇIKTIYI yakalar. Parolanın
   * hiçbir zaman `logError`'a context alanı olarak VERİLMEDİĞİ (kod
   * incelemesiyle sabit) + e-postanın `maskText` tarafından temizlendiği aynı
   * anda kanıtlanır — "maskeleme ekledim" değil, ateşlenen çağrının çıktısı.
   */
  it(
    'MASKELEME SONDASI: DB hatası logError üzerinden geçer, parola HİÇ ' +
      'verilmez ve e-posta çıktıda görünmez',
    async () => {
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
      vi.mocked(User.create).mockRejectedValue(
        new Error('duplicate key hatası: gizli-alici@xox.test zaten var'),
      )
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({
          email: 'gizli-alici@xox.test',
          password: 'ÇokGizliParola123!',
          displayName: 'Ayşe',
        }),
      )
      expect(response.status).toBe(500)

      const output = spy.mock.calls.flat().map(String).join(' | ')
      expect(spy).toHaveBeenCalled()
      // Parola context'e HİÇ verilmediği için (route.ts `logError('...', {}, error)`
      // çağırır — `password` değişkeni ikinci argümana asla geçilmez) çıktıda
      // OLAMAZ; bu, regex maskelemesi DEĞİL, API tasarımının garantisidir.
      expect(output).not.toContain('ÇokGizliParola123!')
      // E-posta ise `error.message`'ın İÇİNDE geldi — bunu `maskText` temizler.
      expect(output).not.toContain('gizli-alici@xox.test')
      expect(output).toContain('[E-POSTA_GİZLİ]')

      console.info('[sonda register/route çıktı]', output)
      spy.mockRestore()
    },
  )
})
