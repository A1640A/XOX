// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * KK-009 mobil köprüsü, adım 2/3. `@/auth` (oturum) ve `@xox/db`
 * (`connectDb`/`MobileRefreshToken.create`) mock'lanır — token üretimi/imzası
 * (`@/lib/auth/tokens`) GERÇEK kodla çalışır, bu yüzden `verifyToken` ile
 * geri doğrulanabilir.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
const mockCreate = vi.fn()
vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  MobileRefreshToken: { create: mockCreate },
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(url: string): Request {
  return new Request(url)
}

describe('GET /api/auth/mobile/callback', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockCreate.mockReset().mockResolvedValue(undefined)
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    vi.resetModules()
  })

  afterAll(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('oturumsuzsa /giris?donus=<bu-URL> ile 307 döner', async () => {
    mockAuth.mockResolvedValue(null)

    const { GET } = await import('./route')
    const response = await GET(
      makeRequest('https://xox.test/api/auth/mobile/callback?state=abc123'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://xox.test/giris?donus=%2Fapi%2Fauth%2Fmobile%2Fcallback%3Fstate%3Dabc123',
    )
  })

  it(
    'oturumluysa xox://auth?token=&refresh=&state= ile 307 döner; token mobile-access, ' +
      'refresh mobile-refresh izleyicisiyle doğrulanabilir ve AYNI userId taşır',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-42', name: 'Zeynep' } })

      const { GET } = await import('./route')
      const response = await GET(
        makeRequest('https://xox.test/api/auth/mobile/callback?state=devlet-42'),
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).not.toBeNull()
      const deepLink = new URL(location!)
      expect(deepLink.protocol).toBe('xox:')
      expect(deepLink.searchParams.get('state')).toBe('devlet-42')

      const token = deepLink.searchParams.get('token')
      const refresh = deepLink.searchParams.get('refresh')
      expect(token).not.toBeNull()
      expect(refresh).not.toBeNull()

      const { verifyToken } = await import('@/lib/auth/tokens')
      const verifiedAccess = await verifyToken(token!, 'mobile-access')
      const verifiedRefresh = await verifyToken(refresh!, 'mobile-refresh')
      expect(verifiedAccess?.userId).toBe('user-42')
      expect(verifiedRefresh?.userId).toBe('user-42')
      // Çapraz kabul imkânsız: erişim jetonu refresh izleyicisiyle geçmez.
      expect(await verifyToken(token!, 'mobile-refresh')).toBeNull()

      expect(mockConnectDb).toHaveBeenCalled()
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ jti: verifiedRefresh?.claims['jti'], userId: 'user-42' }),
      )
    },
  )

  it(
    'DB yazması (MobileRefreshToken.create) başarısız olursa xox://auth?error=SERVER_ERROR ' +
      'ile 307 döner — kullanılamaz bir refresh token ASLA dışarı verilmez',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockCreate.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'))

      const { GET } = await import('./route')
      const response = await GET(makeRequest('https://xox.test/api/auth/mobile/callback?state=s1'))

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      const deepLink = new URL(location!)
      expect(deepLink.protocol).toBe('xox:')
      expect(deepLink.searchParams.get('error')).toBe('SERVER_ERROR')
      expect(deepLink.searchParams.get('state')).toBe('s1')
      expect(location).not.toContain('ECONNREFUSED')
    },
  )

  /**
   * W2-06 — P1 BLOKER: `apps/web/app/api/auth/mobile/callback/route.ts`
   * başarılı girişte KOŞULSUZ `xox://auth?...`e 307 dönüyordu. Web hedefinde
   * (Expo web build, `expo-web-browser`in GERÇEK web implementasyonu —
   * `ExpoWebBrowser.web.ts`, kaynağı okunarak doğrulandı) `xox://` bir şey
   * ifade etmez; tarayıcı bilinmeyen şemaya top-level yönlendirmede
   * "sayfaya ulaşılamıyor" gösterir (E2E-005'te gerçek Chromium'da ölçüldü,
   * `docs/board/reports/E2E-005.md`). Bu describe bloğundaki İLK test
   * DÜZELTMEDEN ÖNCE KIRMIZIYDI — kanıt `docs/board/reports/W2-06.md`de.
   */
  describe('W2-06 — web hedefi: allowlist edilmiş redirect_uri', () => {
    it(
      'oturumluysa VE redirect_uri allowlist origin + /auth ise, xox:// DEĞİL o hedefe ' +
        '(http/https) 307 döner; token/refresh AYNI şekilde doğrulanabilir kalır',
      async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-77', name: 'Web Kullanıcı' } })

        const { GET } = await import('./route')
        const response = await GET(
          makeRequest(
            'https://xox.test/api/auth/mobile/callback?state=web-state-1&' +
              `redirect_uri=${encodeURIComponent('http://localhost:8081/auth')}`,
          ),
        )

        expect(response.status).toBe(307)
        const location = response.headers.get('location')
        expect(location).not.toBeNull()
        const target = new URL(location!)

        // Bugünkü hatanın tam tersi: DEEP LINK DEĞİL, gerçek bir http(s) URL'i.
        expect(target.protocol).toBe('http:')
        expect(target.origin).toBe('http://localhost:8081')
        expect(target.pathname).toBe('/auth')
        expect(target.searchParams.get('state')).toBe('web-state-1')

        const token = target.searchParams.get('token')
        const refresh = target.searchParams.get('refresh')
        expect(token).not.toBeNull()
        expect(refresh).not.toBeNull()

        const { verifyToken } = await import('@/lib/auth/tokens')
        expect((await verifyToken(token!, 'mobile-access'))?.userId).toBe('user-77')
        expect((await verifyToken(refresh!, 'mobile-refresh'))?.userId).toBe('user-77')
      },
    )

    it(
      'redirect_uri allowlist DIŞINDAYSA (açık yönlendirme denemesi) YOK SAYILIR — ' +
        'bugünkü tek davranışa (xox://) düşer, saldırganın hedefine ASLA gitmez',
      async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-78', name: 'Saldırgan Denemesi' } })

        const { GET } = await import('./route')
        const response = await GET(
          makeRequest(
            'https://xox.test/api/auth/mobile/callback?state=s2&' +
              `redirect_uri=${encodeURIComponent('https://evil.example/auth')}`,
          ),
        )

        const location = response.headers.get('location')
        expect(location).not.toBeNull()
        const target = new URL(location!)
        expect(target.protocol).toBe('xox:')
        expect(location).not.toContain('evil.example')
      },
    )

    it('redirect_uri allowlist origin ama path /auth DEĞİLSE YOK SAYILIR', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-79', name: 'X' } })

      const { GET } = await import('./route')
      const response = await GET(
        makeRequest(
          'https://xox.test/api/auth/mobile/callback?state=s3&' +
            `redirect_uri=${encodeURIComponent('http://localhost:8081/baska-yol')}`,
        ),
      )

      const target = new URL(response.headers.get('location')!)
      expect(target.protocol).toBe('xox:')
    })

    it(
      'DB yazması başarısız olursa VE redirect_uri geçerliyse hata da AYNI web hedefine ' +
        'gider (error=SERVER_ERROR) — token/refresh o durumda da hiç üretilmez/sızmaz',
      async () => {
        mockAuth.mockResolvedValue({ user: { id: 'user-80', name: 'Y' } })
        mockCreate.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'))

        const { GET } = await import('./route')
        const response = await GET(
          makeRequest(
            'https://xox.test/api/auth/mobile/callback?state=s4&' +
              `redirect_uri=${encodeURIComponent('http://localhost:8081/auth')}`,
          ),
        )

        const target = new URL(response.headers.get('location')!)
        expect(target.protocol).toBe('http:')
        expect(target.origin).toBe('http://localhost:8081')
        expect(target.searchParams.get('error')).toBe('SERVER_ERROR')
        expect(target.searchParams.get('state')).toBe('s4')
        expect(target.searchParams.get('token')).toBeNull()
        expect(target.searchParams.get('refresh')).toBeNull()
      },
    )
  })
})
