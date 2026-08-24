// @vitest-environment node
//
// jose'nin `SignJWT`/`jwtVerify` webapi derlemesi `instanceof Uint8Array` kontrolü
// yapıyor; jsdom ortamı ayrı bir realm (vm) kullandığı için o realm'in
// `Uint8Array`si Node'unkiyle FARKLI bir yapıcı fonksiyon olabiliyor ve kontrol
// sessizce `TypeError: payload must be an instance of Uint8Array` ile patlıyor.
// Bu dosya saf sunucu mantığı test ettiği için 'node' ortamına sabitlenir.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

describe('tokens', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('AUTH_SECRET tanımlı değilse imzalama fırlatır', async () => {
    delete process.env['AUTH_SECRET']
    const { signToken } = await import('./tokens')
    await expect(signToken('ws-ticket', 'user-1')).rejects.toThrow('AUTH_SECRET')
  })

  it(
    'GÜVENLİK: AUTH_SECRET 32 karakterden KISAYSA imzalama fırlatır — ' +
      'kısa bir sır dakikalar içinde kırılıp sahte token üretilebilir',
    async () => {
      process.env['AUTH_SECRET'] = 'x'
      const { signToken } = await import('./tokens')
      await expect(signToken('ws-ticket', 'user-1')).rejects.toThrow('32')
    },
  )

  it('AUTH_SECRET tam 32 karakterse KABUL edilir (sınır değeri)', async () => {
    process.env['AUTH_SECRET'] = 'a'.repeat(32)
    const { signToken } = await import('./tokens')
    await expect(signToken('ws-ticket', 'user-1')).resolves.toMatchObject({ expiresIn: 30 })
  })

  it('WS bileti tam olarak WS_TICKET_TTL_SECONDS (30) saniye ömürlü döner', async () => {
    const { signToken } = await import('./tokens')
    const { expiresIn } = await signToken('ws-ticket', 'user-1')
    // Çıplak sayı — sabitten türetilmiş beklenti sabit değişince kör kalır (gotchas.md).
    expect(expiresIn).toBe(30)
  })

  it('mobil access tokenı 900 (15 dk) saniye ömürlü döner', async () => {
    const { signToken } = await import('./tokens')
    const { expiresIn } = await signToken('mobile-access', 'user-1')
    expect(expiresIn).toBe(900)
  })

  it('mobil refresh tokenı 2_592_000 (30 gün) saniye ömürlü döner', async () => {
    const { signToken } = await import('./tokens')
    const { expiresIn } = await signToken('mobile-refresh', 'user-1')
    expect(expiresIn).toBe(2_592_000)
  })

  it('imzalanan userId ve ek iddialar (örn. name) doğrulamadan geri gelir', async () => {
    const { signToken, verifyToken } = await import('./tokens')
    const { token } = await signToken('ws-ticket', 'user-42', { name: 'Ayşe' })
    const verified = await verifyToken(token, 'ws-ticket')
    expect(verified?.userId).toBe('user-42')
    expect(verified?.claims['name']).toBe('Ayşe')
  })

  it('KRİTİK: bir izleyici için imzalanan token BAŞKA izleyiciye karşı reddedilir', async () => {
    const { signToken, verifyToken } = await import('./tokens')
    const { token: accessToken } = await signToken('mobile-access', 'user-7')
    const { token: refreshToken } = await signToken('mobile-refresh', 'user-7')
    const { token: ticket } = await signToken('ws-ticket', 'user-7')

    // Üç kombinasyonun HİÇBİRİ çapraz kabul edilmez.
    await expect(verifyToken(accessToken, 'mobile-refresh')).resolves.toBeNull()
    await expect(verifyToken(accessToken, 'ws-ticket')).resolves.toBeNull()
    await expect(verifyToken(refreshToken, 'mobile-access')).resolves.toBeNull()
    await expect(verifyToken(refreshToken, 'ws-ticket')).resolves.toBeNull()
    await expect(verifyToken(ticket, 'mobile-access')).resolves.toBeNull()
    await expect(verifyToken(ticket, 'mobile-refresh')).resolves.toBeNull()

    // Doğru izleyiciyle üçü de kabul edilir.
    await expect(verifyToken(accessToken, 'mobile-access')).resolves.toMatchObject({
      userId: 'user-7',
    })
    await expect(verifyToken(refreshToken, 'mobile-refresh')).resolves.toMatchObject({
      userId: 'user-7',
    })
    await expect(verifyToken(ticket, 'ws-ticket')).resolves.toMatchObject({ userId: 'user-7' })
  })

  it('bozuk/uydurma token reddedilir (null)', async () => {
    const { verifyToken } = await import('./tokens')
    await expect(verifyToken('uydurma.token.degeri', 'ws-ticket')).resolves.toBeNull()
  })

  it('algorithms allowlist: HS256 dışında imzalanmış bir token (aynı sırla) reddedilir', async () => {
    const { SignJWT } = await import('jose')
    const secret = process.env['AUTH_SECRET']
    if (secret === undefined) throw new Error('test kurulum hatası')
    const key = new TextEncoder().encode(secret)
    const hs384Token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS384' })
      .setSubject('user-1')
      .setAudience('xox-ws')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 30)
      .sign(key)

    const { verifyToken } = await import('./tokens')
    await expect(verifyToken(hs384Token, 'ws-ticket')).resolves.toBeNull()
  })

  it('süresi dolmuş token reddedilir', async () => {
    vi.useFakeTimers()
    const { signToken, verifyToken } = await import('./tokens')
    const { token } = await signToken('ws-ticket', 'user-1')
    vi.advanceTimersByTime(31_000)
    await expect(verifyToken(token, 'ws-ticket')).resolves.toBeNull()
  })
})
