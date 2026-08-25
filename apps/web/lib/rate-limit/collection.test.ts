import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createIndex: vi.fn(),
}))

vi.mock('@xox/db', () => ({
  getDbName: vi.fn().mockReturnValue('xox_test'),
  getMongoClient: vi.fn().mockResolvedValue({
    db: () => ({
      collection: () => ({ createIndex: mocks.createIndex }),
    }),
  }),
}))

describe('getRateLimitCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // Global önbellek (`globalThis.__xoxRateLimitIndex`) modül yeniden
    // yüklense de HAYATTA KALIR (kasıtlı — client.ts'teki aynı kalıp,
    // Fluid instance kalıcılığını simüle eder). Testler arası SIZINTIYI
    // önlemek için her testte elle temizleniyor.
    delete (globalThis as { __xoxRateLimitIndex?: unknown }).__xoxRateLimitIndex
  })

  it('TTL indeksini expireAt alanında, expireAfterSeconds:0 ile kurar', async () => {
    mocks.createIndex.mockResolvedValue('expireAt_1')
    const { getRateLimitCollection } = await import('./collection')
    await getRateLimitCollection()
    expect(mocks.createIndex).toHaveBeenCalledWith({ expireAt: 1 }, { expireAfterSeconds: 0 })
  })

  it('aynı modül ömrü içinde createIndex YALNIZ BİR KEZ çağrılır (önbellek çalışıyor)', async () => {
    mocks.createIndex.mockResolvedValue('expireAt_1')
    const { getRateLimitCollection } = await import('./collection')
    await getRateLimitCollection()
    await getRateLimitCollection()
    await getRateLimitCollection()
    expect(mocks.createIndex).toHaveBeenCalledTimes(1)
  })

  it(
    'GÜVENLİK DENETİMİ — MEDIUM (kalıcı bozulma): `createIndex` BİR KEZ reddederse ' +
      'çağıran fırlatılan hatayı görür VE önbellek TEMİZLENİR — sonraki çağrı YENİDEN dener, ' +
      'aynı reddedilmiş promise sonsuza dek önbellekte kalmaz',
    async () => {
      mocks.createIndex.mockRejectedValueOnce(new Error('Atlas gecici kesinti'))
      const { getRateLimitCollection } = await import('./collection')

      await expect(getRateLimitCollection()).rejects.toThrow('Atlas gecici kesinti')

      mocks.createIndex.mockResolvedValueOnce('expireAt_1')
      await expect(getRateLimitCollection()).resolves.toBeDefined()

      expect(mocks.createIndex).toHaveBeenCalledTimes(2) // 1. reddedildi, 2. YENİDEN denendi ve başardı
    },
  )
})
