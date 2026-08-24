import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const connectDb = vi.fn()
  const disconnectDb = vi.fn()
  const ensureIndexes = vi.fn()
  const getDbName = vi.fn()
  return { connectDb, disconnectDb, ensureIndexes, getDbName }
})

vi.mock('./client', () => ({
  connectDb: mocks.connectDb,
  disconnectDb: mocks.disconnectDb,
  getDbName: mocks.getDbName,
}))

vi.mock('./indexes', () => ({
  ensureIndexes: mocks.ensureIndexes,
}))

beforeEach(() => {
  vi.resetModules()
  mocks.connectDb.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.disconnectDb.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.ensureIndexes.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.getDbName.mockImplementation((): string => 'xox_test')
})

describe('migrate', () => {
  it('önce bağlanır, sonra ensureIndexes çağırır — sıra testle kilitli', async () => {
    const { migrate } = await import('./migrate')

    const result = await migrate()

    expect(mocks.connectDb).toHaveBeenCalledTimes(1)
    expect(mocks.ensureIndexes).toHaveBeenCalledTimes(1)
    const connectOrder = mocks.connectDb.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    const ensureOrder = mocks.ensureIndexes.mock.invocationCallOrder[0] ?? -1
    expect(connectOrder).toBeLessThan(ensureOrder)
    expect(result).toStrictEqual({ db: 'xox_test' })
  })

  it('ensureIndexes reddederse hata olduğu gibi yukarı fırlatılır', async () => {
    mocks.ensureIndexes.mockRejectedValue(new Error('IndexKeySpecsConflict'))
    const { migrate } = await import('./migrate')

    await expect(migrate()).rejects.toThrow('IndexKeySpecsConflict')
  })
})

describe('CLI girişi', () => {
  it('doğrudan çalıştırıldığında migrate çalıştırır, bağlantıyı kapatır ve sonucu loglar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const originalArgv = [...process.argv]
    process.argv = ['node', '/repo/packages/db/src/migrate.ts']
    try {
      await import('./migrate')
    } finally {
      process.argv = originalArgv
    }

    expect(mocks.ensureIndexes).toHaveBeenCalledTimes(1)
    expect(mocks.disconnectDb).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('İndeksler kuruldu: xox_test')
  })

  it('başka bir dosyadan import edildiğinde kendiliğinden çalışmaz', async () => {
    await import('./migrate')
    expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    expect(mocks.disconnectDb).not.toHaveBeenCalled()
  })
})
