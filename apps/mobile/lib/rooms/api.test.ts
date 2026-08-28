import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoom, fetchRoomState } from './api'

const BASE_URL = 'https://xox.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createRoom', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('201 + { code } döner ve Authorization: Bearer taşır', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'ABC234' }, 201))

    const result = await createRoom(BASE_URL, 'erisim-jetonu', { size: 11, winLength: 5 })

    expect(result).toStrictEqual({ ok: true, data: { code: 'ABC234' } })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/rooms`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer erisim-jetonu' }) as unknown,
        body: JSON.stringify({ size: 11, winLength: 5 }),
      }),
    )
  })

  it('config verilmezse BOŞ gövde gönderir (ADR-0015 — sunucu 3×3e düşer)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'ABC234' }, 201))
    await createRoom(BASE_URL, 't')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: JSON.stringify({}) }),
    )
  })

  it('400 INVALID_BOARD_CONFIG (kapalı boyut) { ok:false, code } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'INVALID_BOARD_CONFIG', message: 'x' }, 400))
    const result = await createRoom(BASE_URL, 't', { size: 11 })
    expect(result).toStrictEqual({ ok: false, code: 'INVALID_BOARD_CONFIG' })
  })

  it('ağ hatasında NETWORK döner', async () => {
    fetchMock.mockRejectedValue(new Error('kopuk'))
    const result = await createRoom(BASE_URL, 't')
    expect(result).toStrictEqual({ ok: false, code: 'NETWORK' })
  })
})

describe('fetchRoomState', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('200 + geçerli gövdede { ok:true, data } döner', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 'ABC234',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
        canJoin: true,
        size: 3,
        winLength: 3,
      }),
    )

    const result = await fetchRoomState(BASE_URL, 't', 'ABC234')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/rooms/ABC234`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer t' }) as unknown,
      }),
    )
  })

  it('404 ROOM_NOT_FOUND { ok:false, code } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'ROOM_NOT_FOUND', message: 'x' }, 404))
    const result = await fetchRoomState(BASE_URL, 't', 'ABC234')
    expect(result).toStrictEqual({ ok: false, code: 'ROOM_NOT_FOUND' })
  })

  it('şemaya uymayan başarı gövdesi SERVER_ERROR döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ garip: true }))
    const result = await fetchRoomState(BASE_URL, 't', 'ABC234')
    expect(result).toStrictEqual({ ok: false, code: 'SERVER_ERROR' })
  })
})
