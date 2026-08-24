// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { User as UserModel } from '@xox/db'

vi.mock('@xox/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  User: { findOne: vi.fn() },
}))

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

type FindOneReturn = ReturnType<typeof UserModel.findOne>

/**
 * `User.findOne(...).select('+passwordHash').lean()` zincirinin sahte hali.
 * Gerçek mongoose `Query` tipiyle yapısal olarak eşleşmez — üretim kodu
 * yalnız `.select().lean()` çağırdığı için bilerek `as unknown as` ile geçilir.
 */
function mockFindOneResult(doc: unknown): FindOneReturn {
  const lean = vi.fn().mockResolvedValue(doc)
  const select = vi.fn().mockReturnValue({ lean })
  return { select } as unknown as FindOneReturn
}

describe('authorizeCredentials', () => {
  beforeAll(() => {
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('geçerli e-posta+parola için {id,name,email} döner', async () => {
    const { hashPassword } = await import('./password')
    const passwordHash = await hashPassword('dogru-parola-2026')

    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.findOne).mockReturnValue(
      mockFindOneResult({
        _id: 'user-1',
        name: 'Ayşe',
        email: 'ayse@xox.test',
        passwordHash,
      }),
    )

    const { authorizeCredentials } = await import('./authorize')
    const result = await authorizeCredentials({
      email: 'ayse@xox.test',
      password: 'dogru-parola-2026',
    })

    expect(result).toStrictEqual({ id: 'user-1', name: 'Ayşe', email: 'ayse@xox.test' })
  })

  it('yanlış parola null döner', async () => {
    const { hashPassword } = await import('./password')
    const passwordHash = await hashPassword('dogru-parola-2026')

    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.findOne).mockReturnValue(
      mockFindOneResult({ _id: 'user-1', name: 'Ayşe', email: 'ayse@xox.test', passwordHash }),
    )

    const { authorizeCredentials } = await import('./authorize')
    const result = await authorizeCredentials({ email: 'ayse@xox.test', password: 'yanlis-parola' })
    expect(result).toBeNull()
  })

  it('kayıtsız e-posta için null döner ve GERÇEK bir sahte doğrulama koşturur', async () => {
    const { User } = await import('@xox/db')
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    vi.mocked(User.findOne).mockReturnValue(mockFindOneResult(null))

    const passwordModule = await import('./password')
    const spy = vi.spyOn(passwordModule, 'verifyFakePassword')

    const { authorizeCredentials } = await import('./authorize')
    const result = await authorizeCredentials({
      email: 'kayitsiz@xox.test',
      password: 'her-hangi-bir-sey',
    })

    expect(result).toBeNull()
    expect(spy).toHaveBeenCalledWith('her-hangi-bir-sey')
  })

  it('geçersiz gövde (email/password eksik) hiçbir DB çağrısı yapmadan null döner', async () => {
    const { User } = await import('@xox/db')
    const { authorizeCredentials } = await import('./authorize')

    await expect(authorizeCredentials({ email: 'gecersiz-eposta' })).resolves.toBeNull()
    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
    expect(User.findOne).not.toHaveBeenCalled()
  })

  it(
    'KK-005 SABİT ZAMANLI GİRİŞ: "kayıtsız e-posta" ile "yanlış parola" ' +
      'süreleri ±100 ms içinde kalır',
    async () => {
      const { hashPassword } = await import('./password')
      const passwordHash = await hashPassword('gercek-kullanici-parolasi-2026')

      const { User } = await import('@xox/db')
      const { authorizeCredentials } = await import('./authorize')

      const SAMPLES = 5

      async function timeWrongPassword(): Promise<number> {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
        vi.mocked(User.findOne).mockReturnValue(
          mockFindOneResult({
            _id: 'user-1',
            name: 'Ayşe',
            email: 'ayse@xox.test',
            passwordHash,
          }),
        )
        const start = performance.now()
        await authorizeCredentials({ email: 'ayse@xox.test', password: 'kesinlikle-yanlis' })
        return performance.now() - start
      }

      async function timeUnknownEmail(): Promise<number> {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız mock kurulumu/çağrı kaydı okunuyor
        vi.mocked(User.findOne).mockReturnValue(mockFindOneResult(null))
        const start = performance.now()
        await authorizeCredentials({
          email: 'yok-boyle-biri@xox.test',
          password: 'kesinlikle-yanlis',
        })
        return performance.now() - start
      }

      let wrongPasswordTotal = 0
      let unknownEmailTotal = 0
      for (let i = 0; i < SAMPLES; i += 1) {
        wrongPasswordTotal += await timeWrongPassword()
        unknownEmailTotal += await timeUnknownEmail()
      }

      const avgWrongPassword = wrongPasswordTotal / SAMPLES
      const avgUnknownEmail = unknownEmailTotal / SAMPLES
      const diff = Math.abs(avgWrongPassword - avgUnknownEmail)

      console.warn(
        `KK-005 ölçümü — yanlış parola: ${avgWrongPassword.toFixed(2)}ms, ` +
          `kayıtsız e-posta: ${avgUnknownEmail.toFixed(2)}ms, fark: ${diff.toFixed(2)}ms`,
      )

      expect(diff).toBeLessThan(100)
    },
    20_000,
  )
})
