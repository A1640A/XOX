// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockConnectDb = vi.fn()
const mockLean = vi.fn()
const mockSelect = vi.fn(() => ({ lean: mockLean }))
const mockFindOne = vi.fn(() => ({ select: mockSelect }))

vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  Room: { findOne: mockFindOne },
}))

function makeRequest(rawCode: string): Request {
  return new Request(`https://xox.test/api/rooms/${encodeURIComponent(rawCode)}`)
}

function context(code: string): { params: Promise<{ code: string }> } {
  return { params: Promise.resolve({ code }) }
}

describe('GET /api/rooms/[code]', () => {
  beforeEach(() => {
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockFindOne.mockClear()
    mockSelect.mockClear()
    mockLean.mockReset()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it(
    'AC5: kod SUNUCU tarafında normalleştirilir — " abc234 " -> "ABC234" ile sorgulanır ' +
      '(gerçek çıktı: findOne çağrısına giden argüman)',
    async () => {
      mockLean.mockResolvedValue({
        code: 'ABC234',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
      })

      const { GET } = await import('./route')
      const response = await GET(makeRequest(' abc234 '), context(' abc234 '))

      expect(response.status).toBe(200)
      expect(mockFindOne).toHaveBeenCalledWith({ code: 'ABC234' })
      expect(await response.json()).toStrictEqual({
        code: 'ABC234',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
        canJoin: true,
      })
    },
  )

  it('AC4: { code, state, seats, canJoin } döner — bekleyen + boş koltuklu oda canJoin:true', async () => {
    mockLean.mockResolvedValue({
      code: 'ABC234',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ canJoin: true })
  })

  it('canJoin: bitmiş oda ya da her iki koltuk doluysa false döner', async () => {
    mockLean.mockResolvedValue({
      code: 'ABC234',
      state: 'finished',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Mehmet' } },
    })

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ canJoin: false })
  })

  it('AC4: var olmayan (ya da TTL ile silinmiş) kod 404 ROOM_NOT_FOUND döner', async () => {
    mockLean.mockResolvedValue(null)

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(404)
    expect(await response.json()).toStrictEqual({
      code: 'ROOM_NOT_FOUND',
      message: 'Oda bulunamadı.',
    })
  })

  it('AC5: roomCodeSchema dışı karakter 400 INVALID_CODE döner, DB hiç sorgulanmaz', async () => {
    const { GET } = await import('./route')
    const response = await GET(makeRequest('abc!23'), context('abc!23'))

    expect(response.status).toBe(400)
    expect(await response.json()).toStrictEqual({
      code: 'INVALID_CODE',
      message: 'Geçersiz oda kodu.',
    })
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('AC5: yanlış uzunluktaki kod 400 INVALID_CODE döner', async () => {
    const { GET } = await import('./route')
    const response = await GET(makeRequest('AB'), context('AB'))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_CODE' })
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('DB hatası fırlatırsa 500 SERVER_ERROR döner, sürücü ayrıntısı sızmaz', async () => {
    mockLean.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'))

    const { GET } = await import('./route')
    const response = await GET(makeRequest('ABC234'), context('ABC234'))

    expect(response.status).toBe(500)
    const body: unknown = await response.json()
    expect(body).toMatchObject({ code: 'SERVER_ERROR' })
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
  })
})
