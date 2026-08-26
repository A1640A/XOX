// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Yalnız `@/auth`'un `auth()` fonksiyonu ve `@xox/db`'nin `connectDb`/
 * `getRoomSummary` çağrıları mock'lanır — `resolveIdentity`, `verifyToken`
 * GERÇEK kodla çalışır (aynı disiplin: `apps/web/app/api/rooms/route.test.ts`).
 * Güvenlik incelemesi bulgusu sonrası bu uç nokta kimlik istiyor; testin
 * kendisi de artık bunu GERÇEK `resolveIdentity` üzerinden kanıtlıyor.
 *
 * DB-003: route artık `Room` modeline doğrudan erişmiyor, projeksiyon/koltuk
 * şekli bilgisi `@xox/db`'nin `getRoomSummary`'sinde yaşıyor — o yüzden bu
 * testler `Room.findOne().select().lean()` zincirini DEĞİL, `getRoomSummary`'yi
 * mock'lar. Projeksiyon dizesinin doğruluğu artık `packages/db`'nin
 * `rooms/summary.test.ts`'inin sorumluluğu.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
const mockGetRoomSummary = vi.fn()

vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  getRoomSummary: mockGetRoomSummary,
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(rawCode: string, init: RequestInit = {}): Request {
  return new Request(`https://xox.test/api/rooms/${encodeURIComponent(rawCode)}`, init)
}

function context(code: string): { params: Promise<{ code: string }> } {
  return { params: Promise.resolve({ code }) }
}

describe('GET /api/rooms/[code] — gerçek resolveIdentity, yalnız auth()+@xox/db mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockGetRoomSummary.mockReset()
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    vi.resetModules()
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it(
    'GÜVENLİK: oturumsuzsa (çerez yok, Bearer yok) 401 UNAUTHENTICATED döner — ' +
      'kimlik reddedilince getRoomSummary HİÇ ÇAĞRILMAZ (kod geçerliliği bile sızmaz)',
    async () => {
      mockAuth.mockResolvedValue(null)

      const { GET } = await import('./route')
      const response = await GET(makeRequest('ABC234'), context('ABC234'))

      expect(response.status).toBe(401)
      expect(await response.json()).toStrictEqual({
        code: 'UNAUTHENTICATED',
        message: 'Oturum bulunamadı.',
      })
      expect(mockGetRoomSummary).not.toHaveBeenCalled()
    },
  )

  it(
    'GÜVENLİK: kimliksiz istekte GEÇERSİZ kod bile 401 verir, 400 değil — ' +
      'sıra kimlik ÖNCE, kod doğrulama SONRA olmalı',
    async () => {
      mockAuth.mockResolvedValue(null)

      const { GET } = await import('./route')
      const response = await GET(makeRequest('abc!23'), context('abc!23'))

      expect(response.status).toBe(401)
      expect(mockGetRoomSummary).not.toHaveBeenCalled()
    },
  )

  it('Auth.js çerezi ile 200 + { code, state, seats, canJoin, size, winLength } döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockGetRoomSummary.mockResolvedValue({
      code: 'ABC234',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
      size: 3,
      winLength: 3,
    })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(200)
    expect(await response.json()).toStrictEqual({
      code: 'ABC234',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
      canJoin: true,
      size: 3,
      winLength: 3,
    })
  })

  it('Authorization: Bearer ile de (çerez yokken) 200 döner — mobil istemci yolu', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('@/lib/auth/tokens')
    const { token } = await signToken('mobile-access', 'bearer-kullanici', { name: 'Zeynep' })
    mockGetRoomSummary.mockResolvedValue({
      code: 'ABC234',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
      size: 3,
      winLength: 3,
    })

    const { GET } = await import('./route')
    const response = await GET(
      makeRequest('ABC234', { headers: { authorization: `Bearer ${token}` } }),
      context('ABC234'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ code: 'ABC234' })
  })

  it(
    'AC5: kod SUNUCU tarafında normalleştirilir — " abc234 " -> "ABC234" ile sorgulanır ' +
      '(gerçek çıktı: getRoomSummary çağrısına giden argüman); size/winLength de ' +
      'DEFAULT (3/3) OLMAYAN bir değerle geçirilir — route bu alanları sabitlemiyor, ' +
      '`getRoomSummary`den geldiği gibi taşıyor kanıtı (nötr eleman körlüğüne karşı)',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockGetRoomSummary.mockResolvedValue({
        code: 'ABC234',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
        size: 6,
        winLength: 4,
      })

      const { GET } = await import('./route')
      const response = await GET(makeRequest(' abc234 '), context(' abc234 '))

      expect(response.status).toBe(200)
      expect(mockGetRoomSummary).toHaveBeenCalledWith('ABC234')
      expect(await response.json()).toStrictEqual({
        code: 'ABC234',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
        canJoin: true,
        size: 6,
        winLength: 4,
      })
    },
  )

  it('AC4: { code, state, seats, canJoin } döner — bekleyen + boş koltuklu oda canJoin:true', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockGetRoomSummary.mockResolvedValue({
      code: 'ABC234',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
      size: 3,
      winLength: 3,
    })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ canJoin: true })
  })

  it(
    'MAJOR-1 fix: canJoin false — state waiting DEĞİL, koltuk boş (TEK operand false) ' +
      '— "state===waiting" kontrolü düşerse bu test kırmızı olur',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockGetRoomSummary.mockResolvedValue({
        code: 'ABC234',
        state: 'playing',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
        size: 3,
        winLength: 3,
      })

      const { GET } = await import('./route')
      const response = await GET(makeRequest('ABC234'), context('ABC234'))

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ canJoin: false })
    },
  )

  it(
    'MAJOR-1 fix: canJoin false — state waiting AMA koltuk boş DEĞİL (TEK operand false) ' +
      '— "boş koltuk var" kontrolü düşerse bu test kırmızı olur',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockGetRoomSummary.mockResolvedValue({
        code: 'ABC234',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Mehmet' } },
        size: 3,
        winLength: 3,
      })

      const { GET } = await import('./route')
      const response = await GET(makeRequest('ABC234'), context('ABC234'))

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ canJoin: false })
    },
  )

  it('canJoin: bitmiş oda ve her iki koltuk doluysa da false döner (iki operand birden false)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockGetRoomSummary.mockResolvedValue({
      code: 'ABC234',
      state: 'finished',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Mehmet' } },
      size: 3,
      winLength: 3,
    })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ canJoin: false })
  })

  it('AC4: var olmayan (ya da TTL ile silinmiş) kod 404 ROOM_NOT_FOUND döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockGetRoomSummary.mockResolvedValue(null)

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(404)
    expect(await response.json()).toStrictEqual({
      code: 'ROOM_NOT_FOUND',
      message: 'Oda bulunamadı.',
    })
  })

  it('AC5: roomCodeSchema dışı karakter 400 INVALID_CODE döner, DB hiç sorgulanmaz', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('abc!23'), context('abc!23'))

    expect(response.status).toBe(400)
    expect(await response.json()).toStrictEqual({
      code: 'INVALID_CODE',
      message: 'Geçersiz oda kodu.',
    })
    expect(mockGetRoomSummary).not.toHaveBeenCalled()
  })

  it('AC5: yanlış uzunluktaki kod 400 INVALID_CODE döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('AB'), context('AB'))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_CODE' })
    expect(mockGetRoomSummary).not.toHaveBeenCalled()
  })

  it('connectDb() DB sorgusundan ÖNCE çağrılır', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockGetRoomSummary.mockResolvedValue({
      code: 'ABC234',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    })

    const { GET } = await import('./route')
    await GET(makeRequest('ABC234'), context('ABC234'))

    expect(mockConnectDb).toHaveBeenCalled()
  })

  it('DB hatası fırlatırsa 500 SERVER_ERROR döner, sürücü ayrıntısı sızmaz', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockGetRoomSummary.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'))

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(500)
    const body: unknown = await response.json()
    expect(body).toMatchObject({ code: 'SERVER_ERROR' })
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
  })

  it(
    'MINOR-3 fix: resolveIdentity fırlatırsa (ör. AUTH_SECRET eksik) sözleşme BİÇİMİ korunur ' +
      '— generic Next 500 değil, { code, message } zarfı',
    async () => {
      mockAuth.mockRejectedValue(new Error('boom'))

      const { GET } = await import('./route')
      const response = await GET(makeRequest('ABC234'), context('ABC234'))

      expect(response.status).toBe(500)
      expect(await response.json()).toMatchObject({ code: 'SERVER_ERROR' })
    },
  )
})
