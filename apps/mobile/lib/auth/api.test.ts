import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWsTicket, refreshTokenPair, registerAccount } from './api'

const BASE_URL = 'https://xox.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('registerAccount', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('201 + geçerli gövdede { ok:true, data:{userId} } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ userId: 'user-1' }, 201))

    const result = await registerAccount(BASE_URL, {
      email: 'a@b.com',
      password: 'sifre1234',
      displayName: 'Ayşe',
    })

    expect(result).toStrictEqual({ ok: true, data: { userId: 'user-1' } })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/auth/register`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('409 EMAIL_TAKEN gövdesinde { ok:false, code } döner', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'EMAIL_TAKEN', message: 'Bu e-posta zaten kayıtlı.' }, 409),
    )

    const result = await registerAccount(BASE_URL, {
      email: 'a@b.com',
      password: 'sifre1234',
      displayName: 'Ayşe',
    })

    expect(result).toStrictEqual({ ok: false, code: 'EMAIL_TAKEN' })
  })

  it('ağ hatasında NETWORK döner', async () => {
    fetchMock.mockRejectedValue(new Error('kopuk'))

    const result = await registerAccount(BASE_URL, {
      email: 'a@b.com',
      password: 'sifre1234',
      displayName: 'Ayşe',
    })

    expect(result).toStrictEqual({ ok: false, code: 'NETWORK' })
  })

  it('beklenmeyen/şemaya uymayan başarı gövdesi SERVER_ERROR döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ garip: true }, 201))

    const result = await registerAccount(BASE_URL, {
      email: 'a@b.com',
      password: 'sifre1234',
      displayName: 'Ayşe',
    })

    expect(result).toStrictEqual({ ok: false, code: 'SERVER_ERROR' })
  })

  it('hata gövdesi errorResponseSchema dışıysa SERVER_ERROR döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ garip: true }, 500))

    const result = await registerAccount(BASE_URL, {
      email: 'a@b.com',
      password: 'sifre1234',
      displayName: 'Ayşe',
    })

    expect(result).toStrictEqual({ ok: false, code: 'SERVER_ERROR' })
  })
})

describe('refreshTokenPair', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('200 + geçerli gövdede { ok:true, data } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 't', refresh: 'r', expiresIn: 900 }))

    const result = await refreshTokenPair(BASE_URL, 'eski-refresh')

    expect(result).toStrictEqual({
      ok: true,
      data: { token: 't', refresh: 'r', expiresIn: 900 },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/auth/mobile/refresh`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refresh: 'eski-refresh' }),
      }),
    )
  })

  it('401 (yeniden kullanım tespiti) { ok:false, code:UNAUTHENTICATED } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401))

    const result = await refreshTokenPair(BASE_URL, 'zaten-kullanilmis')

    expect(result).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' })
  })
})

describe('fetchWsTicket', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Authorization: Bearer başlığıyla POST eder ve { ok:true, data } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ticket: 'jwt-bilet', expiresIn: 30 }))

    const result = await fetchWsTicket(BASE_URL, 'access-token', 'ABC234')

    expect(result).toStrictEqual({ ok: true, data: { ticket: 'jwt-bilet', expiresIn: 30 } })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/ws/ticket`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer access-token' }) as unknown,
        body: JSON.stringify({ roomCode: 'ABC234' }),
      }),
    )
  })

  it('401 UNAUTHENTICATED döner (süresi dolmuş access token)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401))

    const result = await fetchWsTicket(BASE_URL, 'suresi-dolmus', 'ABC234')

    expect(result).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' })
  })
})
