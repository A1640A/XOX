import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const dropDatabase = vi.fn()
  const connectDb = vi.fn()
  const disconnectDb = vi.fn()
  const getDbName = vi.fn()
  return { dropDatabase, connectDb, disconnectDb, getDbName }
})

vi.mock('./client', () => ({
  connectDb: mocks.connectDb,
  disconnectDb: mocks.disconnectDb,
  getDbName: mocks.getDbName,
}))

beforeEach(() => {
  vi.resetModules()
  mocks.dropDatabase.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.connectDb.mockImplementation((): Promise<unknown> =>
    Promise.resolve({ connection: { dropDatabase: mocks.dropDatabase } }),
  )
  mocks.disconnectDb.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.getDbName.mockImplementation((): string => 'xox_test')
})

describe('resetDatabase', () => {
  it('xox_test veritabanını düşürür', async () => {
    const { resetDatabase } = await import('./reset')
    await resetDatabase()
    expect(mocks.dropDatabase).toHaveBeenCalledTimes(1)
  })

  it('xox_test dışındaki veritabanını reddeder ve bağlanmaz', async () => {
    mocks.getDbName.mockImplementation((): string => 'xox_prod')
    const { resetDatabase } = await import('./reset')
    await expect(resetDatabase()).rejects.toThrow(/xox_prod/)
    expect(mocks.connectDb).not.toHaveBeenCalled()
    expect(mocks.dropDatabase).not.toHaveBeenCalled()
  })

  it('geliştirme veritabanını da reddeder', async () => {
    mocks.getDbName.mockImplementation((): string => 'xox_dev')
    const { resetDatabase } = await import('./reset')
    await expect(resetDatabase()).rejects.toThrow(/Yalnızca xox_test/)
    expect(mocks.dropDatabase).not.toHaveBeenCalled()
  })
})

describe('CLI girişi', () => {
  it('doğrudan çalıştırıldığında sıfırlar ve bağlantıyı kapatır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const originalArgv = [...process.argv]
    process.argv = ['node', '/repo/packages/db/src/reset.ts']
    try {
      await import('./reset')
    } finally {
      process.argv = originalArgv
    }

    expect(mocks.dropDatabase).toHaveBeenCalledTimes(1)
    expect(mocks.disconnectDb).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('Sıfırlandı: xox_test')
  })

  it('başka bir dosyadan import edildiğinde kendiliğinden çalışmaz', async () => {
    await import('./reset')
    expect(mocks.dropDatabase).not.toHaveBeenCalled()
    expect(mocks.disconnectDb).not.toHaveBeenCalled()
  })
})
