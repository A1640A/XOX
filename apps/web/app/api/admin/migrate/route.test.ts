import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  connectDb: vi.fn(),
  ensureIndexes: vi.fn(),
  getDbName: vi.fn((): string => 'xox_test'),
}))

vi.mock('@xox/db', () => ({
  connectDb: mocks.connectDb,
  ensureIndexes: mocks.ensureIndexes,
  getDbName: mocks.getDbName,
}))

function request(headers: Record<string, string> = {}, query = '?db=xox_test'): Request {
  return new Request(`https://x.test/api/admin/migrate${query}`, { method: 'POST', headers })
}

describe('POST /api/admin/migrate', () => {
  beforeEach(() => {
    mocks.connectDb.mockResolvedValue(undefined)
    mocks.ensureIndexes.mockResolvedValue(undefined)
    mocks.getDbName.mockReturnValue('xox_test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  describe('kimlik doğrulama — sır', () => {
    it('MIGRATION_SECRET tanımsızken 404 döner ve ensureIndexes ÇAĞRILMAZ', async () => {
      vi.stubEnv('MIGRATION_SECRET', undefined)
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'her-sey' }))

      expect(response.status).toBe(404)
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('MIGRATION_SECRET BOŞ DİZEYKEN 404 döner — timingSafeEqual("","") true dönebilir, bu yüzden boş sır ayrıca reddedilir (SEC-008)', async () => {
      vi.stubEnv('MIGRATION_SECRET', '')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': '' }))

      expect(response.status).toBe(404)
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('MIGRATION_SECRET boşken başlık hiç yoksa da 404 döner (SEC-008)', async () => {
      vi.stubEnv('MIGRATION_SECRET', '')
      const { POST } = await import('./route')

      const response = await POST(request())

      expect(response.status).toBe(404)
    })

    it('başlık hiç yokken 404 döner', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const { POST } = await import('./route')

      const response = await POST(request())

      expect(response.status).toBe(404)
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('yanlış sırla 404 döner', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'yanlis-sir' }))

      expect(response.status).toBe(404)
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('farklı uzunlukta bir sırla da 404 döner (uzunluk sızıntısı yok)', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'k' }))

      expect(response.status).toBe(404)
    })

    it('SEC-007: yetkisiz istek loglanır ama SIR DEĞERİ ya da UZUNLUĞU asla loglanmaz', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const { POST } = await import('./route')

      const wrongValue = 'x'.repeat(37) // uzunluğu bariz sahte, tahmin edilebilir bir örnek değer
      await POST(request({ 'x-migration-secret': wrongValue }))

      expect(warn).toHaveBeenCalledTimes(1)
      const [message, meta] = warn.mock.calls[0] ?? []
      expect(message).toBe('migrate: yetkisiz istek reddedildi')
      // Meta nesnesi YALNIZ zaman damgası taşır — değer de, uzunluk (37) da yok.
      expect(Object.keys(meta as object)).toStrictEqual(['at'])
      expect(JSON.stringify(message)).not.toContain(wrongValue)
    })
  })

  describe('SEC-004 — hedef veritabanı pozitif onayı', () => {
    it('db parametresi eksikse 400 döner, ensureIndexes ÇAĞRILMAZ', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }, ''))

      expect(response.status).toBe(400)
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('db parametresi izin listesinde değilse (typo) 400 döner', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }, '?db=xox_prodd'))

      expect(response.status).toBe(400)
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('db parametresi izin listesinde AMA gerçek bağlantıyla eşleşmiyorsa 409 + {expected,actual} döner — MONGODB_DB eksik prod-un xox_dev-i indekslemesini engeller', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      mocks.getDbName.mockReturnValue('xox_dev') // Vercel'de MONGODB_DB unutulmuş senaryosu
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }, '?db=xox_prod'))

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: 'db_mismatch',
        expected: 'xox_dev',
        actual: 'xox_prod',
      })
      expect(mocks.ensureIndexes).not.toHaveBeenCalled()
    })

    it('db parametresi gerçek bağlantıyla eşleşiyorsa devam eder', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      mocks.getDbName.mockReturnValue('xox_prod')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }, '?db=xox_prod'))

      expect(response.status).toBe(200)
      expect(mocks.ensureIndexes).toHaveBeenCalledTimes(1)
    })
  })

  it('doğru sırla ve doğru db ile ensureIndexes çağrılır ve 200 ok:true döner', async () => {
    vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
    const { POST } = await import('./route')

    const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))

    expect(response.status).toBe(200)
    expect(mocks.connectDb).toHaveBeenCalledTimes(1)
    expect(mocks.ensureIndexes).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({ ok: true, db: 'xox_test' })
  })

  describe('SEC-006 — sürücü hatası istemciye/loglara açık sızmaz', () => {
    it('ensureIndexes hata fırlatırsa 503 + sabit kod döner, HAM MESAJ yanıt gövdesinde YOK', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.ensureIndexes.mockRejectedValue(
        new Error('connect ECONNREFUSED shard-00-01.xoxcluster.mongodb.net:27017'),
      )
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))
      const body = (await response.json()) as { ok: boolean; error: string }

      expect(response.status).toBe(503)
      expect(body).toStrictEqual({ ok: false, error: 'migration_failed' })
      expect(JSON.stringify(body)).not.toContain('xoxcluster')
      // Ham hata yalnız sunucu tarafı (private Vercel Runtime Logs) log'una gider.
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('Error olmayan bir hata fırlatıldığında da 503 + sabit kod döner', async () => {
      vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      mocks.ensureIndexes.mockRejectedValue('dize hata')
      const { POST } = await import('./route')

      const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))

      expect(response.status).toBe(503)
      expect(await response.json()).toStrictEqual({ ok: false, error: 'migration_failed' })
    })
  })

  it('SEC-007/SEC-003: ensureIndexes eşzamanlılık kilidine takılırsa 409 + already_running döner (503 DEĞİL — geçici, tekrar denenebilir)', async () => {
    vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.ensureIndexes.mockRejectedValue(
      new Error('ensureIndexes zaten çalışıyor — eşzamanlı ikinci çağrı reddedildi'),
    )
    const { POST } = await import('./route')

    const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toStrictEqual({ ok: false, error: 'already_running' })
  })
})
