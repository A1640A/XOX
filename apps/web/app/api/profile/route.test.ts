// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Yalnız `@/auth`'un `auth()` fonksiyonu ve `@xox/db`'nin `connectDb`/`User`
 * çağrıları mock'lanır — `resolveIdentity` GERÇEK kodla çalışır (aynı
 * disiplin: `apps/web/app/api/rooms/route.test.ts`, `.../rooms/[code]/route.test.ts`).
 * `resolveIdentity`'nin TAMAMINI mock'lamak kendi mock'unu doğrulayan bir
 * test üretirdi (KK-010 dersi).
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const mockConnectDb = vi.fn()
vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  User: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

const BASE_PROFILE_DOC = {
  _id: 'u1',
  name: 'Ayşe Yılmaz',
  email: 'ayse@xox.test',
  stats: { wins: 3, losses: 1, draws: 2 },
  elo: 1234,
  ratedGames: 6,
  theme: 'acik' as const,
}

/** `User.findById(...).lean()` / `.findByIdAndUpdate(...).lean()` zincirinin sahte hali. */
function mockLeanResolves(doc: unknown): { lean: () => Promise<unknown> } {
  return { lean: vi.fn().mockResolvedValue(doc) }
}

function makeRequest(init: RequestInit = {}): Request {
  return new Request('https://xox.test/api/profile', init)
}

describe('GET/PATCH /api/profile — gerçek resolveIdentity, yalnız auth()+@xox/db mock', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockConnectDb.mockReset().mockResolvedValue(undefined)
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
    it('oturumsuzsa (çerez yok, Bearer yok) 401 UNAUTHENTICATED döner, DB hiç sorgulanmaz', async () => {
      mockAuth.mockResolvedValue(null)
      const { User } = await import('@xox/db')

      const { GET } = await import('./route')
      const response = await GET(makeRequest())

      expect(response.status).toBe(401)
      expect(await response.json()).toStrictEqual({
        code: 'UNAUTHENTICATED',
        message: 'Oturum bulunamadı.',
      })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findById).not.toHaveBeenCalled()
    })

    it('oturumluysa profili {name,email,stats,elo,ratedGames,theme} biçiminde döner, passwordHash sızmaz', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
      vi.mocked(User.findById).mockReturnValue(mockLeanResolves(BASE_PROFILE_DOC) as never)

      const { GET } = await import('./route')
      const response = await GET(makeRequest())

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json).toStrictEqual({
        name: 'Ayşe Yılmaz',
        email: 'ayse@xox.test',
        stats: { wins: 3, losses: 1, draws: 2 },
        elo: 1234,
        ratedGames: 6,
        theme: 'acik',
      })
      expect(JSON.stringify(json)).not.toContain('passwordHash')
    })

    it("kullanıcı DB'de yoksa (silindi ama çerez hâlâ geçerli) 401 UNAUTHENTICATED döner", async () => {
      mockAuth.mockResolvedValue({ user: { id: 'silinmis-kullanici', name: 'x' } })
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
      vi.mocked(User.findById).mockReturnValue(mockLeanResolves(null) as never)

      const { GET } = await import('./route')
      const response = await GET(makeRequest())

      expect(response.status).toBe(401)
    })
  })

  describe('PATCH', () => {
    it('oturumsuzsa 401 UNAUTHENTICATED döner, DB hiç yazılmaz', async () => {
      mockAuth.mockResolvedValue(null)
      const { User } = await import('@xox/db')

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ name: 'Yeni Ad' }) }),
      )

      expect(response.status).toBe(401)
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('KK-082: geçerli ad ile günceller ve güncel profili döner', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
      vi.mocked(User.findByIdAndUpdate).mockReturnValue(
        mockLeanResolves({ ...BASE_PROFILE_DOC, name: 'Yeni Ad' }) as never,
      )

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ name: 'Yeni Ad' }) }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ name: 'Yeni Ad' })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { name: 'Yeni Ad' }, { new: true })
    })

    it("KK-082: 2..40 aralığı DIŞINDA bir ad SUNUCUDA 400 INVALID_NAME ile reddedilir, DB'ye hiç yazılmaz", async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ name: 'a' }) }),
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toStrictEqual({
        code: 'INVALID_NAME',
        message: 'Geçersiz profil güncellemesi.',
      })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('KK-083: geçerli tema ile günceller', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu
      vi.mocked(User.findByIdAndUpdate).mockReturnValue(
        mockLeanResolves({ ...BASE_PROFILE_DOC, theme: 'koyu' }) as never,
      )

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ theme: 'koyu' }) }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ theme: 'koyu' })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('u1', { theme: 'koyu' }, { new: true })
    })

    it('geçersiz tema değeri 400 INVALID_MESSAGE döner (strictObject bilinmeyen/geçersiz değeri reddeder)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ theme: 'mavi' }) }),
      )

      expect(response.status).toBe(400)
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it("bilinmeyen alan (ör. email) strictObject tarafından reddedilir — 400, DB'ye yazılmaz", async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')

      const { PATCH } = await import('./route')
      const response = await PATCH(
        makeRequest({ method: 'PATCH', body: JSON.stringify({ email: 'baska@xox.test' }) }),
      )

      expect(response.status).toBe(400)
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('boş gövde {} 400 INVALID_MESSAGE döner — güncellenecek alan yok', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })
      const { User } = await import('@xox/db')

      const { PATCH } = await import('./route')
      const response = await PATCH(makeRequest({ method: 'PATCH', body: JSON.stringify({}) }))

      expect(response.status).toBe(400)
      expect(await response.json()).toStrictEqual({
        code: 'INVALID_MESSAGE',
        message: 'Güncellenecek alan yok.',
      })
      // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('ayrıştırılamayan JSON gövdesi 400 INVALID_MESSAGE döner', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ayşe' } })

      const { PATCH } = await import('./route')
      const response = await PATCH(makeRequest({ method: 'PATCH', body: '{geçersiz' }))

      expect(response.status).toBe(400)
      expect(await response.json()).toStrictEqual({
        code: 'INVALID_MESSAGE',
        message: 'Gövde JSON olarak ayrıştırılamadı.',
      })
    })
  })
})
