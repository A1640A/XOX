// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Yalnız `@/auth`'un `auth()` fonksiyonu ve `@xox/db`'nin otoriter geçişi
 * mock'lanır (KK-010'un dersleri: `resolveIdentity`'nin TAMAMINI mock'lamak
 * kendi mock'unu doğrulayan bir test üretir). `resolveIdentity`, `verifyToken`
 * GERÇEK kodla çalışır — çerez VE Bearer yollarının AYNI userId'ye çözüldüğü
 * (AC2) bu yüzden gerçekten sınanabiliyor.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
const mockCreateRoom = vi.fn()
vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  createRoom: mockCreateRoom,
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(init: RequestInit = {}): Request {
  return new Request('https://xox.test/api/rooms', { method: 'POST', ...init })
}

describe('POST /api/rooms — gerçek resolveIdentity, yalnız auth()+createRoom mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockCreateRoom.mockReset()
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('AC2: oturumsuzsa (çerez yok, Bearer yok) 401 UNAUTHENTICATED döner, createRoom hiç çağrılmaz', async () => {
    mockAuth.mockResolvedValue(null)

    const { POST } = await import('./route')
    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toStrictEqual({
      code: 'UNAUTHENTICATED',
      message: 'Oturum bulunamadı.',
    })
    expect(mockCreateRoom).not.toHaveBeenCalled()
  })

  it('AC1/AC2: Auth.js çerezi ile 201 + { code } döner, kurucu X koltuğuna oturur', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'cerez-kullanici', name: 'Ayşe' } })
    mockCreateRoom.mockResolvedValue({
      ok: true,
      room: { code: 'ABC234', seats: { X: { userId: 'cerez-kullanici', name: 'Ayşe' }, O: null } },
      events: [{ kind: 'created' }],
    })

    const { POST } = await import('./route')
    const response = await POST(makeRequest())

    expect(response.status).toBe(201)
    expect(await response.json()).toStrictEqual({ code: 'ABC234' })
    expect(mockCreateRoom).toHaveBeenCalledWith({ userId: 'cerez-kullanici', name: 'Ayşe' })
    expect(mockConnectDb).toHaveBeenCalled()
  })

  it('AC2: Authorization Bearer ile de AYNI userId createRoom-a geçirilir (çerezle eşdeğer yol)', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('@/lib/auth/tokens')
    const { token } = await signToken('mobile-access', 'bearer-kullanici', { name: 'Zeynep' })
    mockCreateRoom.mockResolvedValue({
      ok: true,
      room: {
        code: 'XYZ789',
        seats: { X: { userId: 'bearer-kullanici', name: 'Zeynep' }, O: null },
      },
      events: [{ kind: 'created' }],
    })

    const { POST } = await import('./route')
    const response = await POST(makeRequest({ headers: { authorization: `Bearer ${token}` } }))

    expect(response.status).toBe(201)
    expect(await response.json()).toStrictEqual({ code: 'XYZ789' })
    expect(mockCreateRoom).toHaveBeenCalledWith({ userId: 'bearer-kullanici', name: 'Zeynep' })
  })

  it(
    'AC3: createRoom 5 denemede de çakışırsa (packages/db zorlanmış çakışma sondası) ' +
      '503 CODE_GENERATION_FAILED döner',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockCreateRoom.mockResolvedValue({ ok: false, code: 'CODE_GENERATION_FAILED' })

      const { POST } = await import('./route')
      const response = await POST(makeRequest())

      expect(response.status).toBe(503)
      expect(await response.json()).toStrictEqual({
        code: 'CODE_GENERATION_FAILED',
        message: 'Oda kodu üretilemedi, lütfen tekrar deneyin.',
      })
    },
  )

  it('createRoom istisna fırlatırsa 500 SERVER_ERROR döner, sürücü ayrıntısı sızmaz', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockCreateRoom.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'))

    const { POST } = await import('./route')
    const response = await POST(makeRequest())

    expect(response.status).toBe(500)
    const body: unknown = await response.json()
    expect(body).toMatchObject({ code: 'SERVER_ERROR' })
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
  })

  it('createRoom beklenmeyen bir ok:false kodu dönerse 500 SERVER_ERROR döner (savunmacı dal)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockCreateRoom.mockResolvedValue({ ok: false, code: 'SERVER_ERROR' })

    const { POST } = await import('./route')
    const response = await POST(makeRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toStrictEqual({
      code: 'SERVER_ERROR',
      message: 'Oda oluşturulamadı.',
    })
  })

  it(
    'MINOR-3 fix: resolveIdentity fırlatırsa (ör. AUTH_SECRET eksik/kısa, @auth/core ' +
      'MissingSecret) sözleşme BİÇİMİ korunur — generic Next 500 değil, { code, message } zarfı',
    async () => {
      mockAuth.mockRejectedValue(new Error('MissingSecret'))

      const { POST } = await import('./route')
      const response = await POST(makeRequest())

      expect(response.status).toBe(500)
      const body: unknown = await response.json()
      expect(body).toMatchObject({ code: 'SERVER_ERROR' })
      expect(JSON.stringify(body)).not.toContain('MissingSecret')
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )
})
