import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `@/auth` gerçek `next-auth`'u import eder — Vitest'in native ESM
 * yükleyicisinde ÇALIŞTIRILAMAZ (gotchas.md, conventions.md). Bu yüzden
 * TAMAMEN mock'lanır; bu test dosyası `auth.ts`in KENDİSİNİ değil, bu
 * route'un SARMALAYICI mantığını (hangi koşulda kısa devre yaptığını,
 * hangi koşulda gerçek handler'a devrettiğini) doğrular.
 */
const mocks = vi.hoisted(() => ({
  authGET: vi.fn(),
  authPOST: vi.fn(),
  checkIpRateLimit: vi.fn(),
  getLoginLockStatus: vi.fn(),
  recordLoginFailure: vi.fn(),
  recordLoginSuccess: vi.fn(),
}))

vi.mock('@/auth', () => ({ GET: mocks.authGET, POST: mocks.authPOST }))
vi.mock('@/lib/rate-limit/ip-limit', () => ({ checkIpRateLimit: mocks.checkIpRateLimit }))
vi.mock('@/lib/rate-limit/credential-lockout', () => ({
  getLoginLockStatus: mocks.getLoginLockStatus,
  recordLoginFailure: mocks.recordLoginFailure,
  recordLoginSuccess: mocks.recordLoginSuccess,
}))

const ALLOWED_IP_LIMIT = { allowed: true, limit: 20, remaining: 19, retryAfterSeconds: 60 }

function credentialsRequest(body: Record<string, string>): NextRequest {
  return new NextRequest('https://xox.test/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
}

describe('POST /api/auth/[...nextauth] — SEC-002 sarmalayıcı', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkIpRateLimit.mockResolvedValue(ALLOWED_IP_LIMIT)
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
    const response = await POST(credentialsRequest({ email: 'a@xox.test', password: 'x' }))

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
      credentialsRequest({ email: 'kilitli@xox.test', password: 'yanlis' }),
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
        credentialsRequest({ email: 'hic-olmayan@xox.test', password: 'x' }),
      )
      const json = await response.json()
      expect(json).toStrictEqual({
        code: 'RATE_LIMITED',
        message: 'Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin.',
      })
    },
  )

  it('BAŞARILI giriş (set-cookie: authjs.session-token) sonrası recordLoginSuccess çağrılır', async () => {
    mocks.authPOST.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { 'set-cookie': 'authjs.session-token=abc; Path=/; HttpOnly' },
      }),
    )
    const { POST } = await import('./route')

    await POST(credentialsRequest({ email: 'basarili@xox.test', password: 'dogru' }))

    expect(mocks.recordLoginSuccess).toHaveBeenCalledWith('basarili@xox.test')
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
  })

  it('BAŞARISIZ giriş (set-cookie YOK) sonrası recordLoginFailure çağrılır', async () => {
    mocks.authPOST.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://xox.test/giris?error=CredentialsSignin' },
      }),
    )
    const { POST } = await import('./route')

    await POST(credentialsRequest({ email: 'basarisiz@xox.test', password: 'yanlis' }))

    expect(mocks.recordLoginFailure).toHaveBeenCalledWith('basarisiz@xox.test')
    expect(mocks.recordLoginSuccess).not.toHaveBeenCalled()
  })

  it('gövdede email YOKSA (ör. csrfToken eksik/bozuk istek) kilit sayacına hiç dokunulmaz', async () => {
    mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
    const { POST } = await import('./route')

    await POST(credentialsRequest({ password: 'x' }))

    expect(mocks.getLoginLockStatus).not.toHaveBeenCalled()
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled()
    expect(mocks.recordLoginSuccess).not.toHaveBeenCalled()
  })

  it("gerçek handler'a AYNI gövdeyle iletilir (istemcinin gönderdiği email/password KAYBOLMAZ)", async () => {
    mocks.authPOST.mockResolvedValue(new Response(null, { status: 302 }))
    const { POST } = await import('./route')

    await POST(credentialsRequest({ email: 'a@xox.test', password: 'gizli-sifre' }))

    const forwarded = mocks.authPOST.mock.calls[0]?.[0] as Request
    const forwardedText = await forwarded.text()
    expect(forwardedText).toContain('gizli-sifre')
    expect(forwardedText).toContain('a%40xox.test')
  })
})
