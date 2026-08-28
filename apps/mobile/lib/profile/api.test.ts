import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchProfile } from './api'

const BASE_URL = 'https://xox.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchProfile', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('200 + geçerli gövdede { ok:true, data } döner ve Bearer taşır', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        name: 'Ayşe',
        email: 'ayse@xox.test',
        stats: { wins: 1, losses: 2, draws: 0 },
        elo: 1200,
        ratedGames: 3,
        theme: 'acik',
      }),
    )

    const result = await fetchProfile(BASE_URL, 'erisim-jetonu')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/profile`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer erisim-jetonu' }) as unknown,
      }),
    )
  })

  it('401 UNAUTHENTICATED { ok:false, code } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401))
    const result = await fetchProfile(BASE_URL, 't')
    expect(result).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' })
  })

  it('ağ hatasında NETWORK döner', async () => {
    fetchMock.mockRejectedValue(new Error('kopuk'))
    const result = await fetchProfile(BASE_URL, 't')
    expect(result).toStrictEqual({ ok: false, code: 'NETWORK' })
  })
})
