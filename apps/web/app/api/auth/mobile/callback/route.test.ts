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
})
