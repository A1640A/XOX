import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `@/auth` gerçek `next-auth`'u import eder — Vitest'in native ESM
 * yükleyicisinde ÇALIŞTIRILAMAZ (gotchas.md, conventions.md). Bu yüzden
 * TAMAMEN mock'lanır; bu test dosyası `auth.ts`in KENDİSİNİ değil, bu
 * route'un SARMALAYICI mantığını (hangi koşulda kısa devre yaptığını,
 * hangi koşulda gerçek handler'a devrettiğini) doğrular.
 *
 * `@/lib/rate-limit/credential-request` (extractEmailFromBody/
 * hasSessionCookie) BİLEREK mock'LANMAZ — gerçek koduyla çalışır, böylece
 * BLOCKER-1 (parametre kirliliği) düzeltmesinin route SEVİYESİNDE de
 * (yalnız birim testinde değil) doğru KABLOLANDIĞI kanıtlanır.
 */
const mocks = vi.hoisted(() => ({
  authGET: vi.fn(),
  authPOST: vi.fn(),
  checkIpRateLimit: vi.fn(),
  extractClientIp: vi.fn(),
  getLoginLockStatus: vi.fn(),
  recordLoginFailure: vi.fn(),
  recordLoginSuccess: vi.fn(),
}))

vi.mock('@/auth', () => ({ GET: mocks.authGET, POST: mocks.authPOST }))
vi.mock('@/lib/rate-limit/ip-limit', () => ({
  checkIpRateLimit: mocks.checkIpRateLimit,
  extractClientIp: mocks.extractClientIp,
}))
vi.mock('@/lib/rate-limit/credential-lockout', () => ({
  getLoginLockStatus: mocks.getLoginLockStatus,
  recordLoginFailure: mocks.recordLoginFailure,
  recordLoginSuccess: mocks.recordLoginSuccess,
}))

const ALLOWED_IP_LIMIT = { allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 60 }
const TEST_IP = '203.0.113.9'

function credentialsRequest(rawBody: string): NextRequest {
  return new NextRequest('https://xox.test/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: rawBody,
  })
}

function credentialsRequestFromFields(body: Record<string, string>): NextRequest {
  return credentialsRequest(new URLSearchParams(body).toString())
}

describe('POST /api/auth/[...nextauth] — SEC-002 sarmalayıcı', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkIpRateLimit.mockResolvedValue(ALLOWED_IP_LIMIT)
    mocks.extractClientIp.mockReturnValue(TEST_IP)
    mocks.getLoginLockStatus.mockResolvedValue({ locked: false, retryAfterSeconds: 0 })
  })

  it("IP hız sınırı AŞILMIŞSA 429 döner ve gerçek NextAuth handler'ı HİÇ ÇAĞRILMAZ", async () => {
    mocks.checkIpRateLimit.mockResolvedValue({
      allowed: false,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 33,
    })

    const { POST } = await import('./route')
    const response = await POST(
      credentialsRequestFromFields({ email: 'a@xox.test', password: 'x' }),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('33')
    expect(mocks.authPOST).not.toHaveBeenCalled()
  })

  it('/callback/credentials DIŞINDAKİ bir POST yolu (ör. /api/auth/signout) doğrudan devredilir', async () => {
    mocks.authPOST.mockResolvedValue(new Response(null, { status: 200 }))
    const { POST } = await import('./route')
    const req = new NextRequest('https://xox.test/api/auth/signout', { method: 'POST' })

    await POST(req)

    expect(mocks.authPOST).toHaveBeenCalledTimes(1)
    expect(mocks.getLoginLockStatus).not.toHaveBeenCalled()
  })

  it('kimlik KİLİTLİYSE 429 döner ve argon2/authorize ÇALIŞTIRILMADAN (authPOST çağrılmadan) kısa devre yapar', async () => {
    mocks.getLoginLockStatus.mockResolvedValue({ locked: true, retryAfterSeconds: 120 })

    const { POST } = await import('./route')
    const response = await POST(
      credentialsRequestFromFields({ email: 'kilitli@xox.test', password: 'yanlis' }),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('120')
    expect(mocks.authPOST).not.toHaveBeenCalled()
  })

  it(
    'GÜVENLİK: kilit mesajı var-olmayan/var-olan hesabı AYIRT ETMEZ — ' +
      'User koleksiyonuna hiç bakılmadan aynı kod/mesaj döner',
    async () => {
      mocks.getLoginLockStatus.mockResolvedValue({ locked: true, retryAfterSeconds: 60 })
      const { POST } = await import('./route')

      const response = await POST(
        credentialsRequestFromFields({ email: 'hic-olmayan@xox.test', password: 'x' }),
      )
      const json = await response.json()
      expect(json).toStrictEqual({
        code: 'RATE_LIMITED',
        message: 'Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin.',
      })
    },
  )

  it('kilit kontrolü VE kayıt e-posta+IP ile birlikte çağrılır (HIGH-2 iki katman)', async () => {
    mocks.authPOST.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { 'set-cookie': 'authjs.session-token=abc; Path=/; HttpOnly' },
      }),
    )
    const { POST } = await import('./route')

    await POST(credentialsRequestFromFields({ email: 'basarili@xox.test', password: 'dogru' }))

    expect(mocks.getLoginLockStatus).toHaveBeenCalledWith('basarili@xox.test', TEST_IP)
    expect(mocks.recordLoginSuccess).toHaveBeenCalledWith('basarili@xox.test', TEST_IP)
  })

  it('BAŞARILI giriş (set-cookie: authjs.session-token) sonrası recordLoginSuccess çağrılır', async () => {
    mocks.authPOST.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { 'set-cookie': 'authjs.session-token=abc; Path=/; HttpOnly' },
      }),
    )
    const { POST } = await import('./route')

    await POST(credentialsRequestFromFields({ email: 'basarili@xox.test', password: 'dogru' }))

    expect(mocks.recordLoginSuccess).toHaveBeenCalledWith('basarili@xox.test', TEST_IP)
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
  })

  it(
    'BAŞARILI giriş — BÖLÜNMÜŞ (chunked) oturum çerezinde de recordLoginSuccess ' +
      'çağrılır (HIGH-1: `.0` sonekli set-cookie tek parça değildir, KAÇIRILMAMALI)',
    async () => {
      mocks.authPOST.mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { 'set-cookie': '__Secure-authjs.session-token.0=parcali-jwt; Path=/; Secure' },
        }),
      )
      const { POST } = await import('./route')

      await POST(credentialsRequestFromFields({ email: 'basarili@xox.test', password: 'dogru' }))

      expect(mocks.recordLoginSuccess).toHaveBeenCalledWith('basarili@xox.test', TEST_IP)
      expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
    },
  )

  it('BAŞARISIZ giriş (set-cookie YOK) sonrası recordLoginFailure e-posta+IP ile çağrılır', async () => {
    mocks.authPOST.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://xox.test/giris?error=CredentialsSignin' },
      }),
    )
    const { POST } = await import('./route')

    await POST(credentialsRequestFromFields({ email: 'basarisiz@xox.test', password: 'yanlis' }))

    expect(mocks.recordLoginFailure).toHaveBeenCalledWith('basarisiz@xox.test', TEST_IP)
    expect(mocks.recordLoginSuccess).not.toHaveBeenCalled()
  })

  it('gövdede email YOKSA (ör. csrfToken eksik/bozuk istek) kilit sayacına hiç dokunulmaz', async () => {
    mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
    const { POST } = await import('./route')

    await POST(credentialsRequestFromFields({ password: 'x' }))

    expect(mocks.getLoginLockStatus).not.toHaveBeenCalled()
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
    expect(mocks.recordLoginSuccess).not.toHaveBeenCalled()
  })

  it("gerçek handler'a AYNI gövdeyle iletilir (istemcinin gönderdiği email/password KAYBOLMAZ)", async () => {
    mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
    const { POST } = await import('./route')

    await POST(credentialsRequestFromFields({ email: 'a@xox.test', password: 'gizli-sifre' }))

    const forwarded = mocks.authPOST.mock.calls[0]?.[0] as Request
    const forwardedText = await forwarded.text()
    expect(forwardedText).toContain('gizli-sifre')
    expect(forwardedText).toContain('a%40xox.test')
  })

  it(
    'GÜVENLİK DENETİMİ — BLOCKER-1 (parametre kirliliği), UÇTAN UCA: çift `email` ' +
      'alanı içeren GERÇEK bir gövdede kilit kontrolü Auth.jsin GERÇEKTE göreceği ' +
      '(SONUNCU) e-postaya karşı çalışır — İLK (çöp) değere DEĞİL',
    async () => {
      mocks.getLoginLockStatus.mockResolvedValue({ locked: false, retryAfterSeconds: 0 })
      mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
      const { POST } = await import('./route')

      const poisoned =
        'email=cop%2B1@attacker.test&password=guess&email=kurban@xox.test&csrfToken=x'
      await POST(credentialsRequest(poisoned))

      expect(mocks.getLoginLockStatus).toHaveBeenCalledWith('kurban@xox.test', TEST_IP)
      expect(mocks.getLoginLockStatus).not.toHaveBeenCalledWith('cop+1@attacker.test', TEST_IP)
    },
  )

  it(
    'BLOCKER-1 ters yön: BİRİNCİ alan kurban, İKİNCİ alan çöpse yine SONUNCUYU ' +
      '(çöpü) kullanır — kurban artık YANLIŞLIKLA kilitlenmez',
    async () => {
      mocks.getLoginLockStatus.mockResolvedValue({ locked: false, retryAfterSeconds: 0 })
      mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
      const { POST } = await import('./route')

      const poisoned = 'email=kurban@xox.test&password=guess&email=cop%2B1@attacker.test'
      await POST(credentialsRequest(poisoned))

      expect(mocks.getLoginLockStatus).toHaveBeenCalledWith('cop+1@attacker.test', TEST_IP)
      expect(mocks.recordLoginFailure).toHaveBeenCalledWith('cop+1@attacker.test', TEST_IP)
      expect(mocks.getLoginLockStatus).not.toHaveBeenCalledWith('kurban@xox.test', TEST_IP)
    },
  )

  it(
    'GÜVENLİK DENETİMİ — BLOCKER-2 kablolaması: kilit/IP-sınırı çağrıları AYNI ' +
      '`extractClientIp` sonucunu kullanır (uydurma XFF senaryosu birim testinde ' +
      '`ip-limit.test.ts`te ayrıca kanıtlanır)',
    async () => {
      mocks.extractClientIp.mockReturnValue('198.51.100.7')
      mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
      const { POST } = await import('./route')

      await POST(credentialsRequestFromFields({ email: 'a@xox.test', password: 'x' }))

      expect(mocks.getLoginLockStatus).toHaveBeenCalledWith('a@xox.test', '198.51.100.7')
      expect(mocks.recordLoginFailure).toHaveBeenCalledWith('a@xox.test', '198.51.100.7')
    },
  )
})
