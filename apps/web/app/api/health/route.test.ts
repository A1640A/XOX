import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ dbName: 'xox_test' }))

vi.mock('@xox/db', () => ({
  connectDb: vi.fn(),
  getDbName: (): string => mocks.dbName,
}))

const ORIGINAL_VERCEL_ENV = process.env['VERCEL_ENV']
const ORIGINAL_SKEW_FLAG = process.env['VERCEL_SKEW_PROTECTION_ENABLED']
const ORIGINAL_DEPLOYMENT_ID = process.env['VERCEL_DEPLOYMENT_ID']

function restoreSkewFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env['VERCEL_SKEW_PROTECTION_ENABLED']
  } else {
    process.env['VERCEL_SKEW_PROTECTION_ENABLED'] = value
  }
}

function restoreDeploymentId(value: string | undefined): void {
  if (value === undefined) {
    delete process.env['VERCEL_DEPLOYMENT_ID']
  } else {
    process.env['VERCEL_DEPLOYMENT_ID'] = value
  }
}

describe('GET /api/health', () => {
  afterEach(() => {
    vi.resetModules()
    mocks.dbName = 'xox_test'
    if (ORIGINAL_VERCEL_ENV === undefined) {
      delete process.env['VERCEL_ENV']
    } else {
      process.env['VERCEL_ENV'] = ORIGINAL_VERCEL_ENV
    }
    restoreSkewFlag(ORIGINAL_SKEW_FLAG)
    restoreDeploymentId(ORIGINAL_DEPLOYMENT_ID)
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

  /**
   * ROLLOUT-BOARD-001 · ADR-0018 §3 — skew sondası. Dört hücre: bayrak/kimlik
   * her ayrı açık/kapalı kombinasyonunda DOĞRU booleanı üretir. DEĞER hiçbir
   * zaman yanıta yazılmaz — yalnız `deploymentIdPresent`/`skewProtectionEnabled`
   * booleanları, `VERCEL_DEPLOYMENT_ID`'nin KENDİSİ değil.
   */
  it.each([
    {
      skewFlag: undefined,
      deploymentId: undefined,
      skewProtectionEnabled: false,
      deploymentIdPresent: false,
    },
    {
      skewFlag: '1',
      deploymentId: undefined,
      skewProtectionEnabled: true,
      deploymentIdPresent: false,
    },
    {
      skewFlag: undefined,
      deploymentId: 'dpl_abc123',
      skewProtectionEnabled: false,
      deploymentIdPresent: true,
    },
    {
      skewFlag: '1',
      deploymentId: 'dpl_abc123',
      skewProtectionEnabled: true,
      deploymentIdPresent: true,
    },
    {
      skewFlag: '0',
      deploymentId: undefined,
      skewProtectionEnabled: false,
      deploymentIdPresent: false,
    },
  ])(
    'VERCEL_SKEW_PROTECTION_ENABLED=$skewFlag + VERCEL_DEPLOYMENT_ID set=$deploymentId → ' +
      'skewProtectionEnabled=$skewProtectionEnabled, deploymentIdPresent=$deploymentIdPresent',
    async ({ skewFlag, deploymentId, skewProtectionEnabled, deploymentIdPresent }) => {
      restoreSkewFlag(skewFlag)
      restoreDeploymentId(deploymentId)
      const { connectDb } = await import('@xox/db')
      vi.mocked(connectDb).mockResolvedValue({
        connection: { db: { admin: () => ({ ping: (): Promise<void> => Promise.resolve() }) } },
      } as never)

      const { GET } = await import('./route')
      const response = await GET()
      const json = await response.json()

      expect(json).toMatchObject({ skewProtectionEnabled, deploymentIdPresent })
      expect(JSON.stringify(json)).not.toContain('dpl_abc123')
    },
  )

  it('db erişilemezken (503) de skew sinyalleri yanıtta bulunur — sonda db durumundan bağımsızdır', async () => {
    restoreSkewFlag('1')
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValue(new Error('bağlantı reddedildi'))

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      ok: false,
      skewProtectionEnabled: true,
      deploymentIdPresent: false,
    })
  })
})
