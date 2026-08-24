import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rawClient = { tag: 'raw-mongo-client' }
  const getClient = vi.fn()
  const disconnect = vi.fn()
  const connect = vi.fn()
  const fake = { connect, connection: { getClient }, disconnect }
  return { rawClient, getClient, disconnect, connect, fake }
})

vi.mock('mongoose', () => ({ default: mocks.fake }))

const globalCache = globalThis as unknown as { __xoxMongoose?: unknown }

/** Her test taze modül kapsamıyla başlar; global önbellek testler arası sızmamalı. */
async function loadClient() {
  return import('./client')
}

beforeEach(() => {
  vi.resetModules()
  delete globalCache.__xoxMongoose
  mocks.connect.mockImplementation((): Promise<unknown> => Promise.resolve(mocks.fake))
  mocks.getClient.mockImplementation((): unknown => mocks.rawClient)
  mocks.disconnect.mockImplementation((): Promise<void> => Promise.resolve())
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017')
  vi.stubEnv('MONGODB_DB', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getMongoUri', () => {
  it('ortam değişkenindeki URI değerini döndürür', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://example:27017')
    const { getMongoUri } = await loadClient()
    expect(getMongoUri()).toBe('mongodb://example:27017')
  })

  it('MONGODB_URI tanımsızsa hata fırlatır', async () => {
    vi.stubEnv('MONGODB_URI', undefined)
    const { getMongoUri } = await loadClient()
    expect(() => getMongoUri()).toThrow(/MONGODB_URI/)
  })

  it('MONGODB_URI boş dizeyse hata fırlatır', async () => {
    vi.stubEnv('MONGODB_URI', '')
    const { getMongoUri } = await loadClient()
    expect(() => getMongoUri()).toThrow(/MONGODB_URI/)
  })
})

describe('getDbName', () => {
  it('MONGODB_DB tanımsızsa xox_dev varsayılanını döndürür', async () => {
    const { getDbName } = await loadClient()
    expect(getDbName()).toBe('xox_dev')
  })

  it('MONGODB_DB tanımlıysa onu döndürür', async () => {
    vi.stubEnv('MONGODB_DB', 'xox_test')
    const { getDbName } = await loadClient()
    expect(getDbName()).toBe('xox_test')
  })
})

describe('connectDb', () => {
  it('mongoose.connect çağrısını URI ve veritabanı adıyla yapar', async () => {
    vi.stubEnv('MONGODB_DB', 'xox_test')
    const { connectDb } = await loadClient()
    await connectDb()
    expect(mocks.connect).toHaveBeenCalledWith('mongodb://localhost:27017', {
      dbName: 'xox_test',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    })
  })

  it('ikinci çağrıda önbelleği kullanır — ikinci havuz açmaz', async () => {
    const { connectDb } = await loadClient()
    const first = await connectDb()
    const second = await connectDb()
    expect(second).toBe(first)
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })

  it('eşzamanlı çağrılarda tek bir bağlantı sözü paylaşılır', async () => {
    const { connectDb } = await loadClient()
    await Promise.all([connectDb(), connectDb(), connectDb()])
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })
})

describe('getMongoClient', () => {
  it('mongoose bağlantısının altındaki ham istemciyi paylaşır', async () => {
    const { getMongoClient } = await loadClient()
    const client = await getMongoClient()
    expect(client).toBe(mocks.rawClient)
  })

  it('ikinci bağlantı havuzu açmaz', async () => {
    const { connectDb, getMongoClient } = await loadClient()
    await connectDb()
    await getMongoClient()
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })
})

describe('disconnectDb', () => {
  it('hiç bağlanılmadıysa hiçbir şey yapmaz', async () => {
    const { disconnectDb } = await loadClient()
    await disconnectDb()
    expect(mocks.disconnect).not.toHaveBeenCalled()
  })

  it('bağlantıyı kapatır ve önbelleği temizler — sonraki çağrı yeniden bağlanır', async () => {
    const { connectDb, disconnectDb } = await loadClient()
    await connectDb()
    await disconnectDb()
    expect(mocks.disconnect).toHaveBeenCalledTimes(1)

    await connectDb()
    expect(mocks.connect).toHaveBeenCalledTimes(2)
  })
})
