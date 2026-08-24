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

  it('3) Bearer ve çerez yokken ?ticket= kullanılır', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('ws-ticket', 'user-ticket', { name: 'Bilet Kullanıcı' })
    const req = makeRequest(`https://xox.test/api/rooms/ABC234/ws?ticket=${token}`)
    await expect(resolveIdentity(req)).resolves.toStrictEqual({
      userId: 'user-ticket',
      name: 'Bilet Kullanıcı',
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

  it('SABİT SIRA: çerez ve ticket birlikte varsa (bearer yok) çerez kazanır', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'cerez-kullanici', name: 'Çerez' } })
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('ws-ticket', 'bilet-kullanici')
    const req = makeRequest(`https://xox.test/api/rooms/ABC234/ws?ticket=${token}`)
    const identity = await resolveIdentity(req)
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
    const { token: ticket } = await signToken('ws-ticket', userId)
    const viaTicket = await resolveIdentity(makeRequest(`https://xox.test/x?ticket=${ticket}`))

    expect(viaBearer?.userId).toBe(userId)
    expect(viaCookie?.userId).toBe(userId)
    expect(viaTicket?.userId).toBe(userId)
  })

  it('geçersiz ticket null döner', async () => {
    mockAuth.mockResolvedValue(null)
    const { resolveIdentity } = await import('./identity')
    const req = makeRequest('https://xox.test/x?ticket=uydurma-bilet')
    await expect(resolveIdentity(req)).resolves.toBeNull()
  })

  it('auth() null dönerse (oturum yok) sıradaki kaynağa (ticket) geçer', async () => {
    mockAuth.mockResolvedValue(null)
    const { signToken } = await import('./tokens')
    const { resolveIdentity } = await import('./identity')
    const { token } = await signToken('ws-ticket', 'yedek-kullanici')
    const req = makeRequest(`https://xox.test/x?ticket=${token}`)
    await expect(resolveIdentity(req)).resolves.toStrictEqual({
      userId: 'yedek-kullanici',
      name: '',
    })
  })
})
