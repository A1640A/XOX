import { randomUUID } from 'node:crypto'
import { connectDb, User } from '@xox/db'
import {
  registerBodySchema,
  type ErrorCode,
  type ErrorResponse,
  type RegisterBody,
} from '@xox/shared'
import { hashPassword } from '@/lib/auth/password'

export const dynamic = 'force-dynamic'

function fieldErrorCode(field: unknown): ErrorCode {
  if (field === 'email') return 'INVALID_EMAIL'
  if (field === 'password') return 'WEAK_PASSWORD'
  if (field === 'displayName') return 'INVALID_NAME'
  return 'INVALID_MESSAGE'
}

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  )
}

/**
 * KK-001…004 — Auth.js Credentials sağlayıcısı kullanıcı OLUŞTURMAZ; kayıt bu
 * ayrı REST uç noktasıdır (ADR-0009 B). Doğrulama istemciden bağımsız: gövde
 * her zaman `registerBodySchema`'dan geçer, kullanıcı girdisi hiçbir zaman
 * doğrudan Mongo sorgu nesnesine girmez.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorJson('INVALID_MESSAGE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
  }

  const parsed = registerBodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const code = fieldErrorCode(issue?.path[0])
    return errorJson(code, 'Geçersiz kayıt bilgisi.', 400)
  }

  const { email, password, displayName }: RegisterBody = parsed.data

  try {
    await connectDb()
    const passwordHash = await hashPassword(password)
    const created = await User.create({
      _id: randomUUID(),
      name: displayName,
      email,
      passwordHash,
    })
    return Response.json({ userId: created._id }, { status: 201 })
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return errorJson('EMAIL_TAKEN', 'Bu e-posta zaten kayıtlı.', 409)
    }
    return errorJson('SERVER_ERROR', 'Kayıt sırasında bir hata oluştu.', 500)
  }
}
