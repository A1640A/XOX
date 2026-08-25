// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()

vi.mock('@/auth', () => ({ auth: mockAuth }))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

describe('resolveIdentity — KK-010 tek çözücü', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuth.mockReset()
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('hiçbir kaynak yoksa null döner', async () => {
    mockAuth.mockResolvedValue(null)
    const { resolveIdentity } = await import('./identity')
    const req = makeRequest('https://xox.test/api/ws/ticket')
    await expect(resolveIdentity(req)).resolves.toBeNull()
  })

  it('1) Authorization: Bearer geçerliyse userId+name döner', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('mobile-access', 'user-bearer', { name: 'Bearer Kullanıcı' })
    const req = makeRequest('https://xox.test/api/ws/ticket', { authorization: `Bearer ${token}` })
    await expect(resolveIdentity(req)).resolves.toStrictEqual({
      userId: 'user-bearer',
      name: 'Bearer Kullanıcı',
    })
  })

  it('Bearer başlığı VARSA ama geçersizse çerez/ticket-a düşmez — null döner', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'cerez-kullanici', name: 'Çerez' } })
    const { resolveIdentity } = await import('./identity')
    const req = makeRequest('https://xox.test/api/ws/ticket', { authorization: 'Bearer uydurma' })
    await expect(resolveIdentity(req)).resolves.toBeNull()
  })

  it('2) Bearer yokken Auth.js çerez oturumu kullanılır', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-cerez', name: 'Çerez Kullanıcı' } })
    const { resolveIdentity } = await import('./identity')
    const req = makeRequest('https://xox.test/api/ws/ticket')
    await expect(resolveIdentity(req)).resolves.toStrictEqual({
      userId: 'user-cerez',
      name: 'Çerez Kullanıcı',
    })
  })

  describe('3) ?ticket= — YALNIZ allowTicket:true iken (güvenlik denetimi BLOCKER-2)', () => {
    it(
      'VARSAYILAN çağrıda (`allowTicket` geçilmez) geçerli bir ticket bile ' +
        "YOK SAYILIR — null döner. Önceki sürüm ticket'ı HER çağrıda kabul " +
        "ediyordu; bu, POST /api/ws/ticket'ın kendisine ?ticket= eklenerek " +
        '30 saniyelik bir bileti 25 saniyede bir tazeleyip SÜRESİZ hesap ' +
        'devralmaya çevirmeyi mümkün kılıyordu.',
      async () => {
        mockAuth.mockResolvedValue(null)
        const { signToken } = await import('./tokens')
        const { resolveIdentity } = await import('./identity')
        const { token } = await signToken('ws-ticket', 'saldirgan-hedefi', { room: 'ABC234' })
        const req = makeRequest(`https://xox.test/api/ws/ticket?ticket=${token}`)

        await expect(resolveIdentity(req)).resolves.toBeNull()
      },
    )

    it('`{ allowTicket: true }` AÇIKÇA geçilirse ticket kabul edilir (yalnız WS upgrade route’u kullanmalı)', async () => {
      mockAuth.mockResolvedValue(null)
      const { signToken } = await import('./tokens')
      const { resolveIdentity } = await import('./identity')
      const { token } = await signToken('ws-ticket', 'user-ticket', {
        name: 'Bilet Kullanıcı',
        room: 'ABC234',
      })
      const req = makeRequest(`https://xox.test/api/rooms/ABC234/ws?ticket=${token}`)
      await expect(resolveIdentity(req, { allowTicket: true })).resolves.toStrictEqual({
        userId: 'user-ticket',
        name: 'Bilet Kullanıcı',
        room: 'ABC234',
      })
    })

    it("bilette `room` claim'i varsa sonuçta `room` alanı olarak taşınır (yatay yetki sözleşmesi)", async () => {
      mockAuth.mockResolvedValue(null)
      const { signToken } = await import('./tokens')
      const { resolveIdentity } = await import('./identity')
      const { token } = await signToken('ws-ticket', 'user-oda', { name: 'Ad', room: 'ABC234' })
      const req = makeRequest(`https://xox.test/api/rooms/ABC234/ws?ticket=${token}`)
      await expect(resolveIdentity(req, { allowTicket: true })).resolves.toStrictEqual({
        userId: 'user-oda',
        name: 'Ad',
        room: 'ABC234',
      })
    })

    it("bilette `room` claim'i YOKSA bilet HİÇ kabul edilmez (fail-open kapandı)", async () => {
      // ⚠️ Bu test daha önce TERS davranışı kilitliyordu ("room yoksa identity
      // yine dönsün, yalnız alan olmasın"). O biçim fail-open'dı: `room`
      // taşımayan bir ws-ticket üreten ikinci bir yol eklendiği an o bilet
      // HER odada geçerli olurdu ve hiçbir kapı çalmazdı. Artık kapsam
      // eksikliği bir DOĞRULAMA HATASI (güvenlik denetimi bulgusu).
      mockAuth.mockResolvedValue(null)
      const { signToken } = await import('./tokens')
      const { resolveIdentity } = await import('./identity')
      const { token } = await signToken('ws-ticket', 'user-odasiz')
      const req = makeRequest(`https://xox.test/x?ticket=${token}`)
      await expect(resolveIdentity(req, { allowTicket: true })).resolves.toBeNull()
    })

    it('`allowTicket: false` AÇIKÇA geçilse de ticket yok sayılır (varsayılanla aynı davranış)', async () => {
      mockAuth.mockResolvedValue(null)
      const { signToken } = await import('./tokens')
      const { resolveIdentity } = await import('./identity')
      const { token } = await signToken('ws-ticket', 'user-x', { room: 'ABC234' })
      const req = makeRequest(`https://xox.test/x?ticket=${token}`)
      await expect(resolveIdentity(req, { allowTicket: false })).resolves.toBeNull()
    })
  })

  it('SABİT SIRA: bearer ve çerez birlikte varsa bearer kazanır', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'cerez-kullanici', name: 'Çerez' } })
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('mobile-access', 'bearer-kullanici', { name: 'Bearer' })
    const req = makeRequest('https://xox.test/api/ws/ticket', { authorization: `Bearer ${token}` })
    const identity = await resolveIdentity(req)
    expect(identity?.userId).toBe('bearer-kullanici')
  })

  it('SABİT SIRA: çerez ve ticket birlikte varsa (bearer yok, allowTicket:true) çerez kazanır', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'cerez-kullanici', name: 'Çerez' } })
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('ws-ticket', 'bilet-kullanici', { room: 'ABC234' })
    const req = makeRequest(`https://xox.test/api/rooms/ABC234/ws?ticket=${token}`)
    const identity = await resolveIdentity(req, { allowTicket: true })
    expect(identity?.userId).toBe('cerez-kullanici')
  })

  it('KK-010: aynı userId üç kaynaktan da AYNI kimliğe çözülür', async () => {
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const userId = 'ayni-kullanici-42'

    mockAuth.mockResolvedValue(null)
    const { token: accessToken } = await signToken('mobile-access', userId)
    const viaBearer = await resolveIdentity(
      makeRequest('https://xox.test/x', { authorization: `Bearer ${accessToken}` }),
    )

    mockAuth.mockResolvedValue({ user: { id: userId, name: '' } })
    const viaCookie = await resolveIdentity(makeRequest('https://xox.test/x'))

    mockAuth.mockResolvedValue(null)
    const { token: ticket } = await signToken('ws-ticket', userId, { room: 'ABC234' })
    const viaTicket = await resolveIdentity(makeRequest(`https://xox.test/x?ticket=${ticket}`), {
      allowTicket: true,
    })

    expect(viaBearer?.userId).toBe(userId)
    expect(viaCookie?.userId).toBe(userId)
    expect(viaTicket?.userId).toBe(userId)
  })

  it('geçersiz ticket (allowTicket:true) null döner', async () => {
    mockAuth.mockResolvedValue(null)
    const { resolveIdentity } = await import('./identity')
    const req = makeRequest('https://xox.test/x?ticket=uydurma-bilet')
    await expect(resolveIdentity(req, { allowTicket: true })).resolves.toBeNull()
  })

  it('auth() null dönerse (oturum yok) ve allowTicket:true ise sıradaki kaynağa (ticket) geçer', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('ws-ticket', 'yedek-kullanici', { room: 'ABC234' })
    const req = makeRequest(`https://xox.test/x?ticket=${token}`)
    await expect(resolveIdentity(req, { allowTicket: true })).resolves.toStrictEqual({
      userId: 'yedek-kullanici',
      name: '',
      room: 'ABC234',
    })
  })
})
