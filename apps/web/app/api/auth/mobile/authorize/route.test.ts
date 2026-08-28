// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * KK-009 mobil köprüsü, adım 1/3. Yalnız `@/auth`'un `auth()` fonksiyonu
 * mock'lanır — yönlendirme kararının kendisi GERÇEK kodla alınır.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

function makeRequest(url: string): Request {
  return new Request(url)
}

describe('GET /api/auth/mobile/authorize', () => {
  beforeEach(() => {
    mockAuth.mockReset()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('oturumsuzsa /giris?donus=<bu-URL-encoded> ile 307 döner', async () => {
    mockAuth.mockResolvedValue(null)

    const { GET } = await import('./route')
    const response = await GET(
      makeRequest('https://xox.test/api/auth/mobile/authorize?state=abc123'),
    )

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toBe(
      'https://xox.test/giris?donus=%2Fapi%2Fauth%2Fmobile%2Fauthorize%3Fstate%3Dabc123',
    )
  })

  it('oturumluysa /api/auth/mobile/callback?state=<state> ile 307 döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

    const { GET } = await import('./route')
    const response = await GET(
      makeRequest('https://xox.test/api/auth/mobile/authorize?state=xyz789'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://xox.test/api/auth/mobile/callback?state=xyz789',
    )
  })

  it('state eksikse boş state ile devam eder — çökmez', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('https://xox.test/api/auth/mobile/authorize'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://xox.test/api/auth/mobile/callback?state=',
    )
  })
})
