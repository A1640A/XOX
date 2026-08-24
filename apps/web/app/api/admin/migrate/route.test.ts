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

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://x.test/api/admin/migrate', { method: 'POST', headers })
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

  it('MIGRATION_SECRET tanımsızken 404 döner ve ensureIndexes ÇAĞRILMAZ', async () => {
    vi.stubEnv('MIGRATION_SECRET', undefined)
    const { POST } = await import('./route')

    const response = await POST(request({ 'x-migration-secret': 'her-sey' }))

    expect(response.status).toBe(404)
    expect(mocks.ensureIndexes).not.toHaveBeenCalled()
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

  it('doğru sırla ensureIndexes çağrılır ve 200 ok:true döner', async () => {
    vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
    const { POST } = await import('./route')

    const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))

    expect(response.status).toBe(200)
    expect(mocks.connectDb).toHaveBeenCalledTimes(1)
    expect(mocks.ensureIndexes).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({ ok: true, db: 'xox_test' })
  })

  it('ensureIndexes hata fırlatırsa 503 ve ok:false döner, stack sızdırmaz', async () => {
    vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
    mocks.ensureIndexes.mockRejectedValue(new Error('IndexOptionsConflict'))
    const { POST } = await import('./route')

    const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))

    expect(response.status).toBe(503)
    const body = (await response.json()) as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('IndexOptionsConflict')
  })

  it('Error olmayan bir hata fırlatıldığında da 503 döner', async () => {
    vi.stubEnv('MIGRATION_SECRET', 'dogru-sir')
    mocks.ensureIndexes.mockRejectedValue('dize hata')
    const { POST } = await import('./route')

    const response = await POST(request({ 'x-migration-secret': 'dogru-sir' }))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, error: 'bilinmeyen hata' })
  })
})
