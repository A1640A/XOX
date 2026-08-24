import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@xox/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  User: { create: vi.fn() },
}))

vi.mock('@/lib/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
}))

function makeRequest(body: unknown): Request {
  return new Request('https://xox.test/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/register', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('geçerli gövdeyle 201 ve userId döner; passwordHash asla sızmaz', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockResolvedValue({
      _id: 'yeni-kullanici-1',
      name: 'Ayşe',
      email: 'ayse@xox.test',
      passwordHash: '$argon2id$mock-hash',
    } as never)

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'AYSE@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
    )

    expect(response.status).toBe(201)
    const json = (await response.json()) as Record<string, unknown>
    expect(json).toStrictEqual({ userId: 'yeni-kullanici-1' })
    expect(JSON.stringify(json)).not.toContain('passwordHash')
    expect(JSON.stringify(json)).not.toContain('argon2id')
  })

  it('e-postayı küçük harfe çevirip DB çağrısına öyle iletir', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockResolvedValue({ _id: 'x', email: 'ayse@xox.test' } as never)

    const { POST } = await import('./route')
    await POST(
      makeRequest({ email: 'AYSE@XOX.TEST', password: 'test-parola1', displayName: 'Ayşe' }),
    )

    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'ayse@xox.test' }))
  })

  it('kısa parola 400 WEAK_PASSWORD döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'a@xox.test', password: 'kisa', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'WEAK_PASSWORD' })
  })

  it('geçersiz e-posta 400 INVALID_EMAIL döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'gecersiz-eposta', password: 'test-parola1', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_EMAIL' })
  })

  it('çok kısa görünen ad 400 INVALID_NAME döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'a@xox.test', password: 'test-parola1', displayName: 'A' }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_NAME' })
  })

  it('bozuk JSON gövdesi 400 döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://xox.test/api/auth/register', { method: 'POST', body: '{bozuk' }),
    )
    expect(response.status).toBe(400)
  })

  it('e-posta çakışması (E11000) 409 EMAIL_TAKEN döner', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockRejectedValue({ code: 11000 })

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'var@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('beklenmeyen DB hatası 500 SERVER_ERROR döner ve mesajı sızdırmaz', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.create).mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1:27017 gizli-detay'))

    const { POST } = await import('./route')
    const response = await POST(
      makeRequest({ email: 'b@xox.test', password: 'test-parola1', displayName: 'Ayşe' }),
    )
    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toMatchObject({ code: 'SERVER_ERROR' })
    expect(JSON.stringify(json)).not.toContain('10.0.0.1')
  })
})
