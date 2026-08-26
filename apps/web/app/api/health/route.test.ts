import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ dbName: 'xox_test' }))

vi.mock('@xox/db', () => ({
  connectDb: vi.fn(),
  getDbName: (): string => mocks.dbName,
}))

const ORIGINAL_VERCEL_ENV = process.env['VERCEL_ENV']

describe('GET /api/health', () => {
  afterEach(() => {
    vi.resetModules()
    mocks.dbName = 'xox_test'
    if (ORIGINAL_VERCEL_ENV === undefined) {
      delete process.env['VERCEL_ENV']
    } else {
      process.env['VERCEL_ENV'] = ORIGINAL_VERCEL_ENV
    }
  })

  it('veritabanı erişilebilirken 200 ve ok:true döner', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockResolvedValue({
      connection: { db: { admin: () => ({ ping: (): Promise<void> => Promise.resolve() }) } },
    } as never)

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, db: 'xox_test' })
  })

  it('veritabanı erişilemezken 503 ve ok:false döner', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValue(new Error('bağlantı reddedildi'))

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false })
  })

  it('Error olmayan bir hata fırlatıldığında da 503 döner', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValue('dize hata')

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, error: 'bilinmeyen hata' })
  })

  /**
   * KK-101 — "ortam karışması testle yakalanır" (OPS-006/OPS-007'nin canlı
   * yaşadığı sınıf: preview'ın MONGODB_DB'si production'ı gösterdiğinde
   * health check ESKİDEN sessizce ok:true derdi). Dört hücreli tablo: doğru
   * eşleşme YEŞİL, çapraz eşleşme KIRMIZI — her iki yön de test edilir.
   */
  it.each([
    { vercelEnv: 'production', db: 'xox_prod', ok: true },
    { vercelEnv: 'preview', db: 'xox_test', ok: true },
    { vercelEnv: 'production', db: 'xox_test', ok: false },
    { vercelEnv: 'preview', db: 'xox_prod', ok: false },
  ])('VERCEL_ENV=$vercelEnv + db=$db → ok:$ok', async ({ vercelEnv, db, ok }) => {
    process.env['VERCEL_ENV'] = vercelEnv
    mocks.dbName = db
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockResolvedValue({
      connection: { db: { admin: () => ({ ping: (): Promise<void> => Promise.resolve() }) } },
    } as never)

    const { GET } = await import('./route')
    const response = await GET()
    const json = await response.json()

    expect(json).toMatchObject({ ok, db })
    expect(response.status).toBe(ok ? 200 : 500)
  })

  it('VERCEL_ENV tanımsızsa (yerel geliştirme) hiçbir db beklenti kontrolü UYGULANMAZ', async () => {
    delete process.env['VERCEL_ENV']
    mocks.dbName = 'xox_dev'
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockResolvedValue({
      connection: { db: { admin: () => ({ ping: (): Promise<void> => Promise.resolve() }) } },
    } as never)

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, db: 'xox_dev' })
  })
})
