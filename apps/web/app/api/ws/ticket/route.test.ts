// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/identity', () => ({ resolveIdentity: vi.fn() }))

function makeRequest(): Request {
  return new Request('https://xox.test/api/ws/ticket', { method: 'POST' })
}

describe('POST /api/ws/ticket', () => {
  const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

  afterEach(() => {
    vi.clearAllMocks()
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('oturumsuzsa 401 UNAUTHENTICATED döner', async () => {
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
    const { resolveIdentity } = await import('@/lib/auth/identity')
    vi.mocked(resolveIdentity).mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual({
      code: 'UNAUTHENTICATED',
      message: 'Oturum bulunamadı.',
    })
  })

  it('oturumluysa { ticket, expiresIn: 30 } döner — WS_TICKET_TTL_SECONDS', async () => {
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
    const { resolveIdentity } = await import('@/lib/auth/identity')
    vi.mocked(resolveIdentity).mockResolvedValue({ userId: 'user-1', name: 'Ayşe' })

    const { POST } = await import('./route')
    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    const json = (await response.json()) as { ticket: string; expiresIn: number }
    expect(typeof json.ticket).toBe('string')
    expect(json.ticket.length).toBeGreaterThan(0)
    // Çıplak sayı — WS_TICKET_TTL_SECONDS sabitiyle aynı olmak zorunda.
    expect(json.expiresIn).toBe(30)
  })

  it('döndürülen bilet aud xox-ws ile doğrulanabilir ve userId taşır', async () => {
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
    const { resolveIdentity } = await import('@/lib/auth/identity')
    vi.mocked(resolveIdentity).mockResolvedValue({ userId: 'user-99', name: 'Zeynep' })

    const { POST } = await import('./route')
    const response = await POST(makeRequest())
    const { ticket } = (await response.json()) as { ticket: string }

    const { verifyToken } = await import('@/lib/auth/tokens')
    const verified = await verifyToken(ticket, 'ws-ticket')
    expect(verified?.userId).toBe('user-99')

    // Başka bir izleyiciye karşı reddedilir.
    const rejected = await verifyToken(ticket, 'mobile-access')
    expect(rejected).toBeNull()
  })
})
