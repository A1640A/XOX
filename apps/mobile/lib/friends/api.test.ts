import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFriends } from './api'

const BASE_URL = 'https://xox.test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchFriends', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('200 + geçerli gövdede { ok:true, data } döner ve Bearer taşır', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ friends: [], incoming: [], outgoing: [] }))

    const result = await fetchFriends(BASE_URL, 'erisim-jetonu')

    expect(result).toStrictEqual({ ok: true, data: { friends: [], incoming: [], outgoing: [] } })
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/friends`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bearer erisim-jetonu' }) as unknown,
      }),
    )
  })

  it('401 UNAUTHENTICATED { ok:false, code } döner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'UNAUTHENTICATED', message: 'x' }, 401))
    const result = await fetchFriends(BASE_URL, 't')
    expect(result).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' })
  })

  it('ağ hatasında NETWORK döner', async () => {
    fetchMock.mockRejectedValue(new Error('kopuk'))
    const result = await fetchFriends(BASE_URL, 't')
    expect(result).toStrictEqual({ ok: false, code: 'NETWORK' })
  })
})
