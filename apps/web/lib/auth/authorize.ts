import { connectDb, User } from '@xox/db'
import { emailSchema } from '@xox/shared'
import { z } from 'zod'
import { verifyFakePassword, verifyPassword } from './password'

/**
 * `next-auth`'un Credentials `authorize()` imzasıyla uyumlu, ama `next-auth`'a
 * HİÇBİR bağımlılığı olmayan saf iş mantığı. Bilerek `auth.ts`'ten AYRILDI:
 * `next-auth`'un derlenmiş çıktısı `next/server`'ı uzantısız import ediyor
 * (`@ts-expect-error Next.js does not yet correctly use the package.json#exports
 * field` yorumuyla kendisi de kabul ediyor) — bu, webpack/Turbopack'te sorunsuz
 * çalışır ama Vitest'in native Node ESM yükleyicisinde
 * `Cannot find module '.../next/server'` ile patlar. `authorizeCredentials`'ı
 * gerçek `next-auth` import zincirinden izole ederek KK-005'in gerçek argon2id
 * zamanlamasını ölçen testi çalıştırılabilir kılıyoruz.
 */
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) })

export interface AuthorizedUser {
  id: string
  name: string
  email: string
}

/**
 * KK-005 sabit zamanlı giriş (ADR-0009 D): kullanıcı bulunamazsa da GERÇEK bir
 * argon2id `verify` koşturulur (`verifyFakePassword`), sonra `null` dönülür.
 * Böylece "kayıtsız e-posta" ve "yanlış parola" dalları ölçülebilir biçimde
 * aynı süreyi alır — e-posta numaralandırması kapanır.
 *
 * `credentials` DOĞRUDAN sorguya girmez: `loginSchema.safeParse` başarısız
 * olursa fonksiyon hiçbir DB çağrısı yapmadan `null` döner.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>>,
): Promise<AuthorizedUser | null> {
  const parsed = loginSchema.safeParse(credentials)
  if (!parsed.success) return null
  const { email, password } = parsed.data

  await connectDb()
  const user = await User.findOne({ email }).select('+passwordHash').lean()

  if (user === null) {
    await verifyFakePassword(password)
    return null
  }

  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) return null

  return { id: user._id, name: user.name, email: user.email }
}
