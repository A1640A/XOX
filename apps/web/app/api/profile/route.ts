import { connectDb, User, type UserDoc } from '@xox/db'
import {
  profileUpdateBodySchema,
  type ErrorCode,
  type ErrorResponse,
  type ProfileResponse,
  type ProfileUpdateBody,
} from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

type ProfileFields = Pick<UserDoc, 'name' | 'email' | 'stats' | 'elo' | 'ratedGames' | 'theme'>

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

function toProfileResponse(user: ProfileFields): ProfileResponse {
  return {
    name: user.name,
    email: user.email,
    stats: user.stats,
    elo: user.elo,
    ratedGames: user.ratedGames,
    theme: user.theme,
  }
}

/**
 * KK-080/081 — `stats`/`elo`/`ratedGames` her zaman `users` koleksiyonundan
 * OKUNUR, ayrı bir sayaç TUTULMAZ; `passwordHash` (`select:false`, bkz.
 * `packages/db/src/models/user.ts`) `.lean()` çıktısına hiç girmez.
 */
export async function GET(req: Request): Promise<Response> {
  const identity = await resolveIdentity(req)
  if (identity === null) {
    return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
  }

  await connectDb()
  const user = await User.findById(identity.userId).lean()
  if (user === null) {
    return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
  }

  return Response.json(toProfileResponse(user) satisfies ProfileResponse)
}

function fieldErrorCode(field: unknown): ErrorCode {
  if (field === 'name') return 'INVALID_NAME'
  return 'INVALID_MESSAGE'
}

/**
 * KK-082/083 — yalnız `name`/`theme` kısmi olarak güncellenebilir
 * (`profileUpdateBodySchema` bir `strictObject`, bilinmeyen alan reddeder).
 * Doğrulama SUNUCUDA yapılır (KK-003 ilkesiyle aynı): istemci kısıtı tek
 * savunma değildir, `displayNameSchema` (2..40) burada da uygulanır.
 */
export async function PATCH(req: Request): Promise<Response> {
  const identity = await resolveIdentity(req)
  if (identity === null) {
    return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errorJson('INVALID_MESSAGE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
  }

  const parsed = profileUpdateBodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorJson(fieldErrorCode(issue?.path[0]), 'Geçersiz profil güncellemesi.', 400)
  }

  const { name, theme }: ProfileUpdateBody = parsed.data
  if (name === undefined && theme === undefined) {
    return errorJson('INVALID_MESSAGE', 'Güncellenecek alan yok.', 400)
  }

  await connectDb()
  const update: Partial<Pick<UserDoc, 'name' | 'theme'>> = {
    ...(name !== undefined ? { name } : {}),
    ...(theme !== undefined ? { theme } : {}),
  }

  const updated = await User.findByIdAndUpdate(identity.userId, update, { new: true }).lean()
  if (updated === null) {
    return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
  }

  return Response.json(toProfileResponse(updated) satisfies ProfileResponse)
}
