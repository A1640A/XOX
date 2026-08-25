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

const IP = '203.0.113.9'

describe('eşik sabitleri', () => {
  it('SEC-002 kabul kriterinde belirtilen değerlerde SABİTLENİR (elle yazılmış beklenti)', async () => {
    const {
      MAX_FAILED_LOGIN_ATTEMPTS,
      LOGIN_LOCK_WINDOW_SECONDS,
      LOGIN_LOCK_DURATION_SECONDS,
      MAX_FAILED_ATTEMPTS_PER_IP,
      IP_EMAIL_LOCK_WINDOW_SECONDS,
      IP_EMAIL_LOCK_DURATION_SECONDS,
    } = await import('./credential-lockout')
    // HIGH-2: hesap-geneli katman GEVŞETİLDİ (5→10 deneme, 15dk→5dk kilit).
    expect(MAX_FAILED_LOGIN_ATTEMPTS).toBe(10)
    expect(LOGIN_LOCK_WINDOW_SECONDS).toBe(15 * 60)
    expect(LOGIN_LOCK_DURATION_SECONDS).toBe(5 * 60)
    // HIGH-2: e-posta+IP bileşik katman YENİ, SIKI ve HIZLI.
    expect(MAX_FAILED_ATTEMPTS_PER_IP).toBe(3)
    expect(IP_EMAIL_LOCK_WINDOW_SECONDS).toBe(15 * 60)
    expect(IP_EMAIL_LOCK_DURATION_SECONDS).toBe(15 * 60)
  })
})

describe('getLoginLockStatus — iki katman (hesap-geneli + e-posta+IP)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteOne.mockResolvedValue({ acknowledged: true })
  })

  it('HİÇBİR katmanda kayıt yoksa kilitli DEĞİLDİR', async () => {
    mocks.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    const { getLoginLockStatus } = await import('./credential-lockout')
    expect(await getLoginLockStatus('a@xox.test', IP)).toStrictEqual({
      locked: false,
      retryAfterSeconds: 0,
    })
    expect(mocks.findOne).toHaveBeenCalledTimes(2)
  })

  it('YALNIZ hesap-geneli katman kilitliyse (diger IPlerden gelen istekler de) kilitli sayilir', async () => {
    mocks.findOne
      .mockResolvedValueOnce({ lockedUntil: new Date(Date.now() + 90_000) }) // hesap-geneli
      .mockResolvedValueOnce(null) // e-posta+IP
    const { getLoginLockStatus } = await import('./credential-lockout')
    const status = await getLoginLockStatus('a@xox.test', IP)
    expect(status.locked).toBe(true)
    expect(status.retryAfterSeconds).toBeGreaterThanOrEqual(89)
  })

  it('YALNIZ e-posta+IP katmani kilitliyse (bu IP bu hesaba karsi cezali) kilitli sayilir', async () => {
    mocks.findOne
      .mockResolvedValueOnce(null) // hesap-geneli
      .mockResolvedValueOnce({ lockedUntil: new Date(Date.now() + 500_000) }) // e-posta+IP
    const { getLoginLockStatus } = await import('./credential-lockout')
    const status = await getLoginLockStatus('a@xox.test', IP)
    expect(status.locked).toBe(true)
    expect(status.retryAfterSeconds).toBeGreaterThanOrEqual(499)
  })

  it('İKİ katman da kilitliyse retryAfterSeconds İKİSİNİN BÜYÜĞÜNÜ döner', async () => {
    mocks.findOne
      .mockResolvedValueOnce({ lockedUntil: new Date(Date.now() + 100_000) })
      .mockResolvedValueOnce({ lockedUntil: new Date(Date.now() + 500_000) })
    const { getLoginLockStatus } = await import('./credential-lockout')
    const status = await getLoginLockStatus('a@xox.test', IP)
    expect(status.locked).toBe(true)
    expect(status.retryAfterSeconds).toBeGreaterThanOrEqual(499)
  })

  it('lockedUntil GEÇMİŞTEYSE (süre dolmuş) o katman kilitli sayılmaz', async () => {
    mocks.findOne
      .mockResolvedValueOnce({ lockedUntil: new Date(Date.now() - 1000) })
      .mockResolvedValueOnce({ lockedUntil: new Date(Date.now() - 1000) })
    const { getLoginLockStatus } = await import('./credential-lockout')
    expect((await getLoginLockStatus('a@xox.test', IP)).locked).toBe(false)
  })

  it(
    'GÜVENLİK: aynı e-posta farklı YAZIM (büyük harf/boşluk) + AYNI IP İLE AYNI ' +
      'anahtarlara düşer — normalize edilmezse kilit atlatılabilir',
    async () => {
      mocks.findOne.mockResolvedValue(null)
      const { getLoginLockStatus } = await import('./credential-lockout')
      await getLoginLockStatus('Ayse@Xox.Test', IP)
      await getLoginLockStatus('  ayse@xox.test  ', IP)

      const [firstAccountFilter] = mocks.findOne.mock.calls[0] as [{ _id: string }]
      const [secondAccountFilter] = mocks.findOne.mock.calls[2] as [{ _id: string }]
      expect(firstAccountFilter._id).toBe(secondAccountFilter._id)

      const [firstIpFilter] = mocks.findOne.mock.calls[1] as [{ _id: string }]
      const [secondIpFilter] = mocks.findOne.mock.calls[3] as [{ _id: string }]
      expect(firstIpFilter._id).toBe(secondIpFilter._id)
    },
  )

  it(
    'GÜVENLİK (BLOCKER-2 ile tutarlılık): AYNI e-posta + FARKLI IP FARKLI ' +
      'e-posta+IP anahtarina duser (bir IPnin cezasi baska IPyi etkilemez)',
    async () => {
      mocks.findOne.mockResolvedValue(null)
      const { getLoginLockStatus } = await import('./credential-lockout')
      await getLoginLockStatus('a@xox.test', '203.0.113.9')
      await getLoginLockStatus('a@xox.test', '198.51.100.7')

      const [firstIpFilter] = mocks.findOne.mock.calls[1] as [{ _id: string }]
      const [secondIpFilter] = mocks.findOne.mock.calls[3] as [{ _id: string }]
      expect(firstIpFilter._id).not.toBe(secondIpFilter._id)
    },
  )
})

describe('recordLoginFailure — iki katman ayrı ayrı artar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('HER İKİ katman de eşiğin ALTINDAYSA kilitlemez', async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce({ failCount: 4, lockedUntil: null }) // hesap-geneli (eşik 10)
      .mockResolvedValueOnce({ failCount: 2, lockedUntil: null }) // e-posta+IP (eşik 3)
    const { recordLoginFailure } = await import('./credential-lockout')
    expect(await recordLoginFailure('a@xox.test', IP)).toStrictEqual({
      locked: false,
      retryAfterSeconds: 0,
    })
  })

  it(
    'HIGH-2: e-posta+IP katmanı (3 deneme) hesap-geneli katmandan (10 deneme) ÇOK ' +
      'ÖNCE tetiklenir — TEK saldırgan/IP hızlıca durdurulur',
    async () => {
      const ipLockedUntil = new Date(Date.now() + 900_000)
      mocks.findOneAndUpdate
        .mockResolvedValueOnce({ failCount: 3, lockedUntil: null }) // hesap-geneli — HENÜZ kilitli değil
        .mockResolvedValueOnce({ failCount: 3, lockedUntil: ipLockedUntil }) // e-posta+IP — KİLİTLENDİ
      const { recordLoginFailure } = await import('./credential-lockout')
      const status = await recordLoginFailure('a@xox.test', IP)
      expect(status.locked).toBe(true)
      expect(status.retryAfterSeconds).toBeGreaterThan(0)
    },
  )

  it('MAX_FAILED_LOGIN_ATTEMPTS (10) hesap-geneli eşiğine ulaşan başarısızlık kilitler', async () => {
    const lockedUntil = new Date(Date.now() + 300_000)
    mocks.findOneAndUpdate
      .mockResolvedValueOnce({ failCount: 10, lockedUntil })
      .mockResolvedValueOnce({ failCount: 5, lockedUntil: null })
    const { recordLoginFailure } = await import('./credential-lockout')
    const status = await recordLoginFailure('a@xox.test', IP)
    expect(status.locked).toBe(true)
  })

  it(
    'GÜVENLİK (kullanıcı numaralandırması KAPALI): var OLMAYAN bir e-posta da ' +
      'AYNI şekilde sayılır ve kilitlenir — User koleksiyonuna hiç bakılmaz',
    async () => {
      const lockedUntil = new Date(Date.now() + 900_000)
      mocks.findOneAndUpdate
        .mockResolvedValueOnce({ failCount: 1, lockedUntil: null })
        .mockResolvedValueOnce({ failCount: 3, lockedUntil })
      const { recordLoginFailure } = await import('./credential-lockout')
      const status = await recordLoginFailure('hic-olmayan-hesap@xox.test', IP)
      expect(status.locked).toBe(true)
    },
  )
})

describe('recordLoginSuccess', () => {
  it('İKİ kilit kaydını da SİLER (hesap-geneli VE bu e-posta+IP eşleşmesi)', async () => {
    mocks.deleteOne.mockClear()
    const { recordLoginSuccess } = await import('./credential-lockout')
    await recordLoginSuccess('a@xox.test', IP)
    expect(mocks.deleteOne).toHaveBeenCalledTimes(2)
  })
})
