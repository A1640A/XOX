import { describe, expect, it, vi } from 'vitest'

vi.mock('@xox/db', () => ({
  connectDb: vi.fn(),
  getDbName: (): string => 'xox_test',
}))

describe('GET /api/health', () => {
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
})
