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
const ENABLED_SIZES_ENV = 'XOX_ENABLED_BOARD_SIZES'
const ORIGINAL_ENABLED_SIZES = process.env[ENABLED_SIZES_ENV]

function makeRequest(init: RequestInit = {}): Request {
  return new Request('https://xox.test/api/rooms', { method: 'POST', ...init })
}

function jsonRequest(body: unknown): Request {
  return makeRequest({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
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
    if (ORIGINAL_ENABLED_SIZES === undefined) {
      delete process.env['XOX_ENABLED_BOARD_SIZES']
    } else {
      process.env['XOX_ENABLED_BOARD_SIZES'] = ORIGINAL_ENABLED_SIZES
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
    expect(mockCreateRoom).toHaveBeenCalledWith(
      { userId: 'cerez-kullanici', name: 'Ayşe' },
      { size: 3, winLength: 3 },
    )
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
    expect(mockCreateRoom).toHaveBeenCalledWith(
      { userId: 'bearer-kullanici', name: 'Zeynep' },
      { size: 3, winLength: 3 },
    )
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

  it(
    'API-BOARD-001: GÖVDESİZ POST hâlâ 3×3 oda kurar — req.json() boş gövdede FIRLATIR, ' +
      'try/catch olmadan bu satır bütün oda kurmayı kırar (bugünkü istemcilerin TAMAMI ' +
      'gövdesiz POST atıyor)',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockCreateRoom.mockResolvedValue({
        ok: true,
        room: { code: 'ABC234', seats: { X: { userId: 'user-1', name: 'Ayşe' }, O: null } },
        events: [{ kind: 'created' }],
      })

      const { POST } = await import('./route')
      // Gövde YOK — `Content-Type` bile yok, `req.json()` gerçekten fırlatan durum.
      const response = await POST(makeRequest())

      expect(response.status).toBe(201)
      expect(await response.json()).toStrictEqual({ code: 'ABC234' })
      expect(mockCreateRoom).toHaveBeenCalledWith(
        { userId: 'user-1', name: 'Ayşe' },
        { size: 3, winLength: 3 },
      )
    },
  )

  it('API-BOARD-001: boş JSON gövdesi ({}) de aynı şekilde 3×3 oda kurar', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockCreateRoom.mockResolvedValue({
      ok: true,
      room: { code: 'ABC234', seats: { X: { userId: 'user-1', name: 'Ayşe' }, O: null } },
      events: [{ kind: 'created' }],
    })

    const { POST } = await import('./route')
    const response = await POST(jsonRequest({}))

    expect(response.status).toBe(201)
    expect(mockCreateRoom).toHaveBeenCalledWith(
      { userId: 'user-1', name: 'Ayşe' },
      { size: 3, winLength: 3 },
    )
  })

  it(
    'API-BOARD-001: geçerli, sıfır OLMAYAN bir konfigürasyon (size:6, winLength:4) ' +
      'createRoom-a AYNEN geçirilir (nötr eleman körlüğüne karşı — 3×3 N−K=0 iken ' +
      '6×6/K=4 öyle değil)',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockCreateRoom.mockResolvedValue({
        ok: true,
        room: { code: 'ABC234', seats: { X: { userId: 'user-1', name: 'Ayşe' }, O: null } },
        events: [{ kind: 'created' }],
      })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: 6, winLength: 4 }))

      expect(response.status).toBe(201)
      expect(mockCreateRoom).toHaveBeenCalledWith(
        { userId: 'user-1', name: 'Ayşe' },
        { size: 6, winLength: 4 },
      )
    },
  )

  it('API-BOARD-001: yalnız size gönderilirse (winLength yok) modun varsayılan K değerine düşer', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockCreateRoom.mockResolvedValue({
      ok: true,
      room: { code: 'ABC234', seats: { X: { userId: 'user-1', name: 'Ayşe' }, O: null } },
      events: [{ kind: 'created' }],
    })

    const { POST } = await import('./route')
    const response = await POST(jsonRequest({ size: 11 }))

    expect(response.status).toBe(201)
    expect(mockCreateRoom).toHaveBeenCalledWith(
      { userId: 'user-1', name: 'Ayşe' },
      { size: 11, winLength: 5 },
    )
  })

  it(
    'API-BOARD-001: şema düzeyinde geçersiz gövde (size:4, üçlüde yok) ' +
      '400 INVALID_BOARD_CONFIG döner, createRoom HİÇ ÇAĞRILMAZ',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: 4 }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_BOARD_CONFIG' })
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )

  it(
    'API-BOARD-001: geçerli boyut ama o boyutta İZİNSİZ K kombinasyonu (size:6, winLength:3) ' +
      '— şema tek başına yakalamaz, parseBoardConfig yakalar — 400 INVALID_BOARD_CONFIG',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: 6, winLength: 3 }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_BOARD_CONFIG' })
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )

  it(
    'API-BOARD-001: size sayı yerine dize gelirse ({size:"11"}) şema düzeyinde ' +
      '400 INVALID_BOARD_CONFIG döner (KK-B05 tablosu: size-not-integer)',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: '11', winLength: '5' }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_BOARD_CONFIG' })
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )

  it(
    'API-BOARD-001: gövde bir dizi olursa ([]) 400 INVALID_BOARD_CONFIG döner ' +
      '(KK-B05: not-an-object), createRoom çağrılmaz',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest([]))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_BOARD_CONFIG' })
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )

  it(
    'API-BOARD-001: 3×3 için izin verilmeyen winLength (size:3, winLength:4) ' +
      '400 INVALID_BOARD_CONFIG döner — KK-B16 sıfır-eleman kombinasyonu ayrıca sınanır',
    async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: 3, winLength: 4 }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_BOARD_CONFIG' })
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )

  it(
    'API-BOARD-001: enabledSizes kapısı — kapalı bir boyut REDDEDİLİR (sessizce 3e ' +
      'düşürülmez): XOX_ENABLED_BOARD_SIZES=3 iken size:11 istenirse 400 ' +
      'INVALID_BOARD_CONFIG döner ve createRoom hiç çağrılmaz (kullanıcı 11×11 istedi, ' +
      "3×3'e sessizce düşürülmedi kanıtı)",
    async () => {
      process.env[ENABLED_SIZES_ENV] = '3'
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: 11, winLength: 5 }))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_BOARD_CONFIG' })
      expect(mockCreateRoom).not.toHaveBeenCalled()
    },
  )

  it(
    'API-BOARD-001: enabledSizes kapısı açıkken (varsayılan 3,6,11) aynı size:11 isteği ' +
      'kabul edilir — kapının kendisi doğru çalışıyor kanıtı (yalnız reddi değil kabulü de sına)',
    async () => {
      delete process.env['XOX_ENABLED_BOARD_SIZES']
      mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
      mockCreateRoom.mockResolvedValue({
        ok: true,
        room: { code: 'ABC234', seats: { X: { userId: 'user-1', name: 'Ayşe' }, O: null } },
        events: [{ kind: 'created' }],
      })

      const { POST } = await import('./route')
      const response = await POST(jsonRequest({ size: 11, winLength: 5 }))

      expect(response.status).toBe(201)
      expect(mockCreateRoom).toHaveBeenCalledWith(
        { userId: 'user-1', name: 'Ayşe' },
        { size: 11, winLength: 5 },
      )
    },
  )

  it('API-BOARD-001: bozuk JSON gövdesi (parse edilemeyen metin) da {} gibi ele alınır, 3×3 kurar', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', name: 'Ayşe' } })
    mockCreateRoom.mockResolvedValue({
      ok: true,
      room: { code: 'ABC234', seats: { X: { userId: 'user-1', name: 'Ayşe' }, O: null } },
      events: [{ kind: 'created' }],
    })

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ headers: { 'content-type': 'application/json' }, body: '{not valid json' }),
    )

    expect(response.status).toBe(201)
    expect(mockCreateRoom).toHaveBeenCalledWith(
      { userId: 'user-1', name: 'Ayşe' },
      { size: 3, winLength: 3 },
    )
  })
})
