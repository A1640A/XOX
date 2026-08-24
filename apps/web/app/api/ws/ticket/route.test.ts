// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Güvenlik denetimi bulgusu: önceki sürüm `@/lib/auth/identity`'nin
 * TAMAMINI mock'luyordu — rotanın gerçek kimlik kararı (dolayısıyla
 * BLOCKER-2: bilet aklama açığı) HİÇBİR testte sınanmıyordu. Burada
 * yalnız `@/auth`'un `auth()` fonksiyonu mock'lanır (denetçinin canlı
 * sondasında yaptığı gibi) — `resolveIdentity`, `verifyToken`, `signToken`
 * GERÇEK kodla çalışır.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, { method: 'POST', ...init })
}

function jsonBody(body: unknown): RequestInit {
  return { body: JSON.stringify(body) }
}

describe('POST /api/ws/ticket — gerçek resolveIdentity, yalnız auth() mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('oturumsuzsa (auth() null, Bearer/ticket yok) 401 UNAUTHENTICATED döner', async () => {
    mockAuth.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest('https://xox.test/api/ws/ticket', jsonBody({ roomCode: 'ABC234' })),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual({
      code: 'UNAUTHENTICATED',
      message: 'Oturum bulunamadı.',
    })
  })

  it(
    "GÜVENLİK REGRESYONU (BLOCKER-2): URL'deki ?ticket= bu uca kabul EDİLMEZ — " +
      'aksi halde bir bilet sonsuza dek tazelenip hesap devralmaya dönüşür',
    async () => {
      // Önce meşru bir kullanıcı için gerçek bir bilet üretelim.
      mockAuth.mockResolvedValue({ user: { id: 'kurban-42', name: 'Kurban' } })
      const { POST } = await import('./route')
      const first = await POST(
        makeRequest('https://xox.test/api/ws/ticket', jsonBody({ roomCode: 'ABC234' })),
      )
      const { ticket } = (await first.json()) as { ticket: string }

      // Şimdi SALDIRGAN gibi davranalım: oturum YOK, Bearer YOK, yalnız
      // az önce sızdırılmış bileti ?ticket= ile bu uca tekrar gönderiyoruz.
      mockAuth.mockResolvedValue(null)
      const replay = await POST(
        makeRequest(
          `https://xox.test/api/ws/ticket?ticket=${ticket}`,
          jsonBody({ roomCode: 'ABC234' }),
        ),
      )

      // `resolveIdentity` bu uçta `allowTicket` GEÇMEDEN çağrılır —
      // ticket kaynağı devre dışı, istek oturumsuz sayılmak ZORUNDA.
      expect(replay.status).toBe(401)
      expect(await replay.json()).toStrictEqual({
        code: 'UNAUTHENTICATED',
        message: 'Oturum bulunamadı.',
      })
    },
  )

  it('oturumluysa { ticket, expiresIn: 30 } döner — WS_TICKET_TTL_SECONDS', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest('https://xox.test/api/ws/ticket', jsonBody({ roomCode: 'ABC234' })),
    )

    expect(response.status).toBe(200)
    const json = (await response.json()) as { ticket: string; expiresIn: number }
    expect(typeof json.ticket).toBe('string')
    expect(json.ticket.length).toBeGreaterThan(0)
    // Çıplak sayı — WS_TICKET_TTL_SECONDS sabitiyle aynı olmak zorunda.
    expect(json.expiresIn).toBe(30)
  })

  it('döndürülen bilet aud xox-ws ile doğrulanabilir, userId VE oda kodunu (room) taşır', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-99', name: 'Zeynep' } })

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest('https://xox.test/api/ws/ticket', jsonBody({ roomCode: 'ABC234' })),
    )
    const { ticket } = (await response.json()) as { ticket: string }

    const { verifyToken } = await import('@/lib/auth/tokens')
    const verified = await verifyToken(ticket, 'ws-ticket')
    expect(verified?.userId).toBe('user-99')
    expect(verified?.claims['room']).toBe('ABC234')

    // Başka bir izleyiciye karşı reddedilir.
    const rejected = await verifyToken(ticket, 'mobile-access')
    expect(rejected).toBeNull()
  })

  it(
    "YATAY YETKİ: A odası için kesilmiş bir bilet B odası claim'iyle EŞLEŞMEZ " +
      "(WS-001 upgrade handler'ının karşılaştırması için sözleşme)",
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      const { POST } = await import('./route')

      const response = await POST(
        makeRequest('https://xox.test/api/ws/ticket', jsonBody({ roomCode: 'AAAAAA' })),
      )
      const { ticket } = (await response.json()) as { ticket: string }

      const { verifyToken } = await import('@/lib/auth/tokens')
      const verified = await verifyToken(ticket, 'ws-ticket')
      expect(verified?.claims['room']).toBe('AAAAAA')
      expect(verified?.claims['room']).not.toBe('BBBBBB')
    },
  )

  it('geçersiz oda kodu 400 INVALID_CODE döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    const { POST } = await import('./route')

    const response = await POST(
      makeRequest('https://xox.test/api/ws/ticket', jsonBody({ roomCode: 'gecersiz-kod!' })),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_CODE' })
  })

  it('oda kodu eksikse 400 INVALID_CODE döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    const { POST } = await import('./route')

    const response = await POST(makeRequest('https://xox.test/api/ws/ticket', jsonBody({})))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_CODE' })
  })

  it('bozuk JSON gövdesi 400 döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    const { POST } = await import('./route')

    const response = await POST(makeRequest('https://xox.test/api/ws/ticket', { body: '{bozuk' }))

    expect(response.status).toBe(400)
  })

  it('Authorization: Bearer ile de (çerez yokken) bilet alınabilir — mobil istemci yolu', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('@/lib/auth/tokens')
    const { token: accessToken } = await signToken('mobile-access', 'mobil-kullanici', {
      name: 'Mobil',
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest('https://xox.test/api/ws/ticket', {
        ...jsonBody({ roomCode: 'ABC234' }),
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    )

    expect(response.status).toBe(200)
    const { ticket } = (await response.json()) as { ticket: string }
    const { verifyToken } = await import('@/lib/auth/tokens')
    const verified = await verifyToken(ticket, 'ws-ticket')
    expect(verified?.userId).toBe('mobil-kullanici')
  })
})
