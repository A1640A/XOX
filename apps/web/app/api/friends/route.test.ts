// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Yalnız `@/auth`'un `auth()` fonksiyonu ve `@xox/db`'nin ilgili çağrıları
 * mock'lanır — `resolveIdentity` GERÇEK kodla çalışır (aynı disiplin:
 * `apps/web/app/api/profile/route.test.ts`, `.../rooms/[code]/route.test.ts`).
 * `@xox/db` mock'u BİLEREK `User` modelini HİÇ EXPORT ETMEZ: route bir
 * kullanıcının var olup olmadığını kontrol etmek için `User`'a dokunursa bu
 * test `undefined` üzerinden çağrı hatasıyla KIRILIR — yani "ayrı bir
 * varlık kontrolü yok" iddiası burada mekanik olarak zorlanıyor.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
const mockGetFriendsView = vi.fn()
const mockHasFinishedGameTogether = vi.fn()
const mockRequestFriendship = vi.fn()
const mockRespondToFriendRequest = vi.fn()
const mockRemoveFriend = vi.fn()

vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  getFriendsView: mockGetFriendsView,
  hasFinishedGameTogether: mockHasFinishedGameTogether,
  requestFriendship: mockRequestFriendship,
  respondToFriendRequest: mockRespondToFriendRequest,
  removeFriend: mockRemoveFriend,
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(init: RequestInit = {}): Request {
  return new Request('https://xox.test/api/friends', init)
}

const SESSION = { user: { id: 'me', name: 'Ben' } }

describe('/api/friends — gerçek resolveIdentity, yalnız auth()+@xox/db mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
    mockGetFriendsView.mockReset()
    mockHasFinishedGameTogether.mockReset()
    mockRequestFriendship.mockReset().mockResolvedValue(undefined)
    mockRespondToFriendRequest.mockReset().mockResolvedValue(undefined)
    mockRemoveFriend.mockReset().mockResolvedValue(undefined)
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  describe('GET', () => {
    it('oturumsuzsa 401 UNAUTHENTICATED döner, DB hiç sorgulanmaz', async () => {
      mockAuth.mockResolvedValue(null)

      const { GET } = await import('./route')
      const response = await GET(makeRequest())

      expect(response.status).toBe(401)
      expect(await response.json()).toStrictEqual({
        code: 'UNAUTHENTICATED',
        message: 'Oturum bulunamadı.',
      })
      expect(mockGetFriendsView).not.toHaveBeenCalled()
    })

    it('oturumluysa friends/incoming/outgoing listelerini döner', async () => {
      mockAuth.mockResolvedValue(SESSION)
      mockGetFriendsView.mockResolvedValue({
        friends: [{ userId: 'u2', name: 'Arkadaş', elo: 1200 }],
        incoming: [{ userId: 'u3', name: 'Gelen', elo: 1100 }],
        outgoing: [{ userId: 'u4', name: 'Giden', elo: 1300 }],
      })

      const { GET } = await import('./route')
      const response = await GET(makeRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toStrictEqual({
        friends: [{ userId: 'u2', name: 'Arkadaş', elo: 1200 }],
        incoming: [{ userId: 'u3', name: 'Gelen', elo: 1100 }],
        outgoing: [{ userId: 'u4', name: 'Giden', elo: 1300 }],
      })
      expect(mockGetFriendsView).toHaveBeenCalledWith('me')
    })

    it('DB katmanı fırlatırsa 500 SERVER_ERROR döner, stack sızmaz', async () => {
      mockAuth.mockResolvedValue(SESSION)
      mockGetFriendsView.mockRejectedValue(new Error('mongo patladı, gizli detay'))

      const { GET } = await import('./route')
      const response = await GET(makeRequest())

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json).toStrictEqual({ code: 'SERVER_ERROR', message: 'Arkadaş listesi alınamadı.' })
      expect(JSON.stringify(json)).not.toContain('mongo patladı')
    })
  })

  describe('POST — KK-126 uygunluk + numaralandırma/zamanlama karşıtı', () => {
    it('oturumsuzsa 401 döner, uygunluk hiç sorgulanmaz', async () => {
      mockAuth.mockResolvedValue(null)

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'u2' }) }),
      )

      expect(response.status).toBe(401)
      expect(mockHasFinishedGameTogether).not.toHaveBeenCalled()
    })

    it('geçersiz gövde (userId eksik) 400 INVALID_MESSAGE döner, uygunluk sorgulanmaz', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { POST } = await import('./route')
      const response = await POST(makeRequest({ method: 'POST', body: JSON.stringify({}) }))

      expect(response.status).toBe(400)
      expect(await response.json()).toStrictEqual({
        code: 'INVALID_MESSAGE',
        message: 'Geçersiz istek gövdesi.',
      })
      expect(mockHasFinishedGameTogether).not.toHaveBeenCalled()
    })

    it('ayrıştırılamayan JSON gövdesi 400 INVALID_MESSAGE döner', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { POST } = await import('./route')
      const response = await POST(makeRequest({ method: 'POST', body: '{geçersiz' }))

      expect(response.status).toBe(400)
      expect(await response.json()).toStrictEqual({
        code: 'INVALID_MESSAGE',
        message: 'Gövde JSON olarak ayrıştırılamadı.',
      })
    })

    it('uygun (birlikte bitmiş oyunu olan) çift için istek gönderilir, 200 ok döner', async () => {
      mockAuth.mockResolvedValue(SESSION)
      mockHasFinishedGameTogether.mockResolvedValue(true)

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'u2' }) }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toStrictEqual({ ok: true })
      expect(mockHasFinishedGameTogether).toHaveBeenCalledWith('me', 'u2')
      expect(mockRequestFriendship).toHaveBeenCalledWith('me', 'u2')
    })

    it(
      'KK-126: uygun OLMAYAN (birlikte bitmiş oyunu yok) bir userId için 403 ' +
        'NOT_FRIENDS_ELIGIBLE döner, istek veritabanına hiç yazılmaz',
      async () => {
        mockAuth.mockResolvedValue(SESSION)
        mockHasFinishedGameTogether.mockResolvedValue(false)

        const { POST } = await import('./route')
        const response = await POST(
          makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'u-hic-oynamadik' }) }),
        )

        expect(response.status).toBe(403)
        expect(await response.json()).toStrictEqual({
          code: 'NOT_FRIENDS_ELIGIBLE',
          message: 'Yalnızca birlikte oyun bitirdiğin oyuncuları ekleyebilirsin.',
        })
        expect(mockRequestFriendship).not.toHaveBeenCalled()
      },
    )

    it(
      'Numaralandırma/zamanlama karşıtı: var OLMAYAN bir userId ile var olan ama ' +
        'uygun OLMAYAN bir userId AYNI 403 gövdesini üretir ve İKİSİ DE yalnız TEK ' +
        'sorgu yolundan (hasFinishedGameTogether) geçer — ayrı bir "kullanıcı var mı" ' +
        'çağrısı YAPILMAZ (mock @xox/db, User modelini hiç export etmiyor; öyle bir çağrı ' +
        'olsaydı bu test undefined üzerinden çağrı hatasıyla KIRILIRDI)',
      async () => {
        mockAuth.mockResolvedValue(SESSION)
        mockHasFinishedGameTogether.mockResolvedValue(false)

        const { POST } = await import('./route')

        const ghostResponse = await POST(
          makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'hic-var-olmayan-id' }) }),
        )
        const existingButIneligibleResponse = await POST(
          makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'var-ama-uygun-degil' }) }),
        )

        expect(ghostResponse.status).toBe(existingButIneligibleResponse.status)
        expect(await ghostResponse.json()).toStrictEqual(await existingButIneligibleResponse.json())
        expect(mockHasFinishedGameTogether).toHaveBeenCalledTimes(2)
      },
    )

    it('kendine istek göndermek de aynı 403 yoluna düşer (özel bir dal yok)', async () => {
      mockAuth.mockResolvedValue(SESSION)
      mockHasFinishedGameTogether.mockResolvedValue(false)

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'me' }) }),
      )

      expect(response.status).toBe(403)
      expect(mockHasFinishedGameTogether).toHaveBeenCalledWith('me', 'me')
      expect(mockRequestFriendship).not.toHaveBeenCalled()
    })

    it('DB katmanı fırlatırsa 500 SERVER_ERROR döner', async () => {
      mockAuth.mockResolvedValue(SESSION)
      mockHasFinishedGameTogether.mockRejectedValue(new Error('gizli hata'))

      const { POST } = await import('./route')
      const response = await POST(
        makeRequest({ method: 'POST', body: JSON.stringify({ userId: 'u2' }) }),
      )

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(JSON.stringify(json)).not.toContain('gizli hata')
    })
  })

  describe('PATCH — kabul/reddet, idempotans', () => {
    it('oturumsuzsa 401 döner', async () => {
      mockAuth.mockResolvedValue(null)

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ userId: 'u2', action: 'accept' }) }),
      )

      expect(response.status).toBe(401)
      expect(mockRespondToFriendRequest).not.toHaveBeenCalled()
    })

    it('geçersiz action 400 INVALID_MESSAGE döner', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ userId: 'u2', action: 'sil' }) }),
      )

      expect(response.status).toBe(400)
      expect(mockRespondToFriendRequest).not.toHaveBeenCalled()
    })

    it('accept: oturum sahibi alıcı olarak kabul eder, 200 ok döner', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ userId: 'u2', action: 'accept' }) }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toStrictEqual({ ok: true })
      expect(mockRespondToFriendRequest).toHaveBeenCalledWith('me', 'u2', 'accept')
    })

    it('reject: 200 ok döner', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ userId: 'u2', action: 'reject' }) }),
      )

      expect(response.status).toBe(200)
      expect(mockRespondToFriendRequest).toHaveBeenCalledWith('me', 'u2', 'reject')
    })

    it(
      'idempotans: var olmayan/kendi gönderdiği bir isteğe yanıt vermek de 200 ' +
        'döner (respondToFriendRequest sessizce no-op olabilir, route hatayı ' +
        'ayırt ETMEZ — numaralandırma yüzeyi yok)',
      async () => {
        mockAuth.mockResolvedValue(SESSION)
        mockRespondToFriendRequest.mockResolvedValue(undefined)

        const { PATCH } = await import('./route')
        const response = await PATCH(
          makeRequest({
            method: 'PATCH',
            body: JSON.stringify({ userId: 'hic-istek-yok', action: 'accept' }),
          }),
        )

        expect(response.status).toBe(200)
      },
    )
  })

  describe('DELETE — KK-127, idempotans', () => {
    it('oturumsuzsa 401 döner', async () => {
      mockAuth.mockResolvedValue(null)

      const { DELETE } = await import('./route')
      const response = await DELETE(
        makeRequest({ method: 'DELETE', body: JSON.stringify({ userId: 'u2' }) }),
      )

      expect(response.status).toBe(401)
      expect(mockRemoveFriend).not.toHaveBeenCalled()
    })

    it('geçerli gövdeyle 200 ok döner ve removeFriend(me, userId) çağrılır', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { DELETE } = await import('./route')
      const response = await DELETE(
        makeRequest({ method: 'DELETE', body: JSON.stringify({ userId: 'u2' }) }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toStrictEqual({ ok: true })
      expect(mockRemoveFriend).toHaveBeenCalledWith('me', 'u2')
    })

    it('geçersiz gövde 400 INVALID_MESSAGE döner, DB hiç yazılmaz', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { DELETE } = await import('./route')
      const response = await DELETE(makeRequest({ method: 'DELETE', body: JSON.stringify({}) }))

      expect(response.status).toBe(400)
      expect(mockRemoveFriend).not.toHaveBeenCalled()
    })

    it('var olmayan bir ilişkiyi silmeye çalışmak da idempotent 200 döner', async () => {
      mockAuth.mockResolvedValue(SESSION)

      const { DELETE } = await import('./route')
      const response = await DELETE(
        makeRequest({ method: 'DELETE', body: JSON.stringify({ userId: 'hic-arkadas-degil' }) }),
      )

      expect(response.status).toBe(200)
    })
  })
})
