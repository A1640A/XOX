import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn().mockResolvedValue({ acknowledged: true }),
  createIndex: vi.fn().mockResolvedValue('expireAt_1'),
}))

vi.mock('@xox/db', () => ({
  getDbName: vi.fn().mockReturnValue('xox_test'),
  getMongoClient: vi.fn().mockResolvedValue({
    db: () => ({
      collection: () => ({
        findOne: mocks.findOne,
        findOneAndUpdate: mocks.findOneAndUpdate,
        deleteOne: mocks.deleteOne,
        createIndex: mocks.createIndex,
      }),
    }),
  }),
}))

process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'

describe('eşik sabitleri', () => {
  it('SEC-002 kabul kriterinde belirtilen değerlerde SABİTLENİR (elle yazılmış beklenti)', async () => {
    const { MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCK_WINDOW_SECONDS, LOGIN_LOCK_DURATION_SECONDS } =
      await import('./credential-lockout')
    expect(MAX_FAILED_LOGIN_ATTEMPTS).toBe(5)
    expect(LOGIN_LOCK_WINDOW_SECONDS).toBe(15 * 60)
    expect(LOGIN_LOCK_DURATION_SECONDS).toBe(15 * 60)
  })
})

describe('getLoginLockStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteOne.mockResolvedValue({ acknowledged: true })
  })

  it('kayıt yoksa kilitli DEĞİLDİR', async () => {
    mocks.findOne.mockResolvedValue(null)
    const { getLoginLockStatus } = await import('./credential-lockout')
    expect(await getLoginLockStatus('a@xox.test')).toStrictEqual({
      locked: false,
      retryAfterSeconds: 0,
    })
  })

  it('lockedUntil GELECEKTEYSE kilitlidir ve kalan süreyi saniyeye yuvarlar', async () => {
    mocks.findOne.mockResolvedValue({ lockedUntil: new Date(Date.now() + 90_000) })
    const { getLoginLockStatus } = await import('./credential-lockout')
    const status = await getLoginLockStatus('a@xox.test')
    expect(status.locked).toBe(true)
    expect(status.retryAfterSeconds).toBeGreaterThanOrEqual(89)
    expect(status.retryAfterSeconds).toBeLessThanOrEqual(90)
  })

  it('lockedUntil GEÇMİŞTEYSE (süre dolmuş) kilitli değildir', async () => {
    mocks.findOne.mockResolvedValue({ lockedUntil: new Date(Date.now() - 1000) })
    const { getLoginLockStatus } = await import('./credential-lockout')
    expect((await getLoginLockStatus('a@xox.test')).locked).toBe(false)
  })

  it(
    'GÜVENLİK: aynı e-posta farklı YAZIM (büyük harf/boşluk) İLE AYNI anahtara düşer ' +
      '— normalize edilmezse kilit atlatılabilir',
    async () => {
      mocks.findOne.mockResolvedValue(null)
      const { getLoginLockStatus } = await import('./credential-lockout')
      await getLoginLockStatus('Ayse@Xox.Test')
      await getLoginLockStatus('  ayse@xox.test  ')

      const [firstFilter] = mocks.findOne.mock.calls[0] as [{ _id: string }]
      const [secondFilter] = mocks.findOne.mock.calls[1] as [{ _id: string }]
      expect(firstFilter._id).toBe(secondFilter._id)
    },
  )
})

describe('recordLoginFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('eşiğin ALTINDA kalan başarısızlık kilitlemez', async () => {
    mocks.findOneAndUpdate.mockResolvedValue({ failCount: 3, lockedUntil: null })
    const { recordLoginFailure } = await import('./credential-lockout')
    expect(await recordLoginFailure('a@xox.test')).toStrictEqual({
      locked: false,
      retryAfterSeconds: 0,
    })
  })

  it("MAX_FAILED_LOGIN_ATTEMPTS'e ULAŞAN başarısızlık kilitler", async () => {
    const lockedUntil = new Date(Date.now() + 900_000)
    mocks.findOneAndUpdate.mockResolvedValue({ failCount: 5, lockedUntil })
    const { recordLoginFailure } = await import('./credential-lockout')
    const status = await recordLoginFailure('a@xox.test')
    expect(status.locked).toBe(true)
    expect(status.retryAfterSeconds).toBeGreaterThan(0)
  })

  it(
    'GÜVENLİK (kullanıcı numaralandırması KAPALI): var OLMAYAN bir e-posta da ' +
      'AYNI şekilde sayılır ve kilitlenir — User koleksiyonuna hiç bakılmaz',
    async () => {
      const lockedUntil = new Date(Date.now() + 900_000)
      mocks.findOneAndUpdate.mockResolvedValue({ failCount: 5, lockedUntil })
      const { recordLoginFailure } = await import('./credential-lockout')
      const status = await recordLoginFailure('hic-olmayan-hesap@xox.test')
      expect(status.locked).toBe(true)
    },
  )
})

describe('recordLoginSuccess', () => {
  it('kilit kaydını SİLER (başarılı girişten sonra sayaç sıfırlanır)', async () => {
    mocks.deleteOne.mockClear()
    const { recordLoginSuccess } = await import('./credential-lockout')
    await recordLoginSuccess('a@xox.test')
    expect(mocks.deleteOne).toHaveBeenCalledTimes(1)
  })
})
