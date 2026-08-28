import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SEC-005 — `revokeTicketsOnSignOut`'un GERÇEK çağıranı: `auth.ts`in
 * `events.signOut` kancası. `@xox/db` TAMAMEN mock'lanır (Mongo'ya bağlanmaz,
 * bu bir birim testi) — entegrasyon zaten `packages/db/src/tickets.test.ts`te
 * (SEC-003) var.
 */
const mocks = vi.hoisted(() => ({
  connectDb: vi.fn(),
  revokeWsTicketsForUser: vi.fn(),
}))

vi.mock('@xox/db', () => ({
  connectDb: mocks.connectDb,
  revokeWsTicketsForUser: mocks.revokeWsTicketsForUser,
}))

describe('revokeTicketsOnSignOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.connectDb.mockResolvedValue(undefined)
    mocks.revokeWsTicketsForUser.mockResolvedValue(2)
  })

  it('userId TANIMLIYSA connectDb + revokeWsTicketsForUser SIRAYLA çağrılır', async () => {
    const { revokeTicketsOnSignOut } = await import('./signout-cleanup')

    await revokeTicketsOnSignOut('cikis-yapan-kullanici')

    expect(mocks.connectDb).toHaveBeenCalledTimes(1)
    expect(mocks.revokeWsTicketsForUser).toHaveBeenCalledWith('cikis-yapan-kullanici')
  })

  it('userId undefined İSE hiçbir DB çağrısı YAPILMAZ (jwt.decode başarısız olduğunda token null olabilir)', async () => {
    const { revokeTicketsOnSignOut } = await import('./signout-cleanup')

    await revokeTicketsOnSignOut(undefined)

    expect(mocks.connectDb).not.toHaveBeenCalled()
    expect(mocks.revokeWsTicketsForUser).not.toHaveBeenCalled()
  })

  it('userId boş string İSE hiçbir DB çağrısı YAPILMAZ', async () => {
    const { revokeTicketsOnSignOut } = await import('./signout-cleanup')

    await revokeTicketsOnSignOut('')

    expect(mocks.connectDb).not.toHaveBeenCalled()
    expect(mocks.revokeWsTicketsForUser).not.toHaveBeenCalled()
  })

  it(
    'GÜVENLİK/UPTIME: revokeWsTicketsForUser REDDEDİLSE bile (DB erişilemez) ' +
      'fonksiyon FIRLATMAZ — çıkış akışını asla bloklamaz/kırmaz',
    async () => {
      mocks.revokeWsTicketsForUser.mockRejectedValue(new Error('Mongo erişilemez'))
      const { revokeTicketsOnSignOut } = await import('./signout-cleanup')

      await expect(revokeTicketsOnSignOut('kullanici-x')).resolves.toBeUndefined()
    },
  )

  it('connectDb REDDEDİLSE bile fonksiyon FIRLATMAZ', async () => {
    mocks.connectDb.mockRejectedValue(new Error('bağlantı havuzu dolu'))
    const { revokeTicketsOnSignOut } = await import('./signout-cleanup')

    await expect(revokeTicketsOnSignOut('kullanici-y')).resolves.toBeUndefined()
    expect(mocks.revokeWsTicketsForUser).not.toHaveBeenCalled()
  })
})
