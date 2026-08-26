import { connectDb, createRoom } from '@xox/db'
import { roomCreateResponseSchema, type ErrorCode, type ErrorResponse } from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

/**
 * `— → waiting` (tasarım §4/§7, KK-030/031/035/036). İnce route: kimliği
 * çöz, otoriter geçişi çağır, sonucu HTTP'ye çevir. **Kural yok, koşullu
 * yazma yok** — tamamı `@xox/db`'nin `createRoom`'unda (DB-002).
 *
 * `resolveIdentity` `allowTicket` GEÇMEDEN çağrılır (varsayılan `false`):
 * bilet yalnız WS upgrade'inde geçerlidir, burada değil.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    await connectDb()
    const result = await createRoom({ userId: identity.userId, name: identity.name })

    if (!result.ok) {
      if (result.code === 'CODE_GENERATION_FAILED') {
        return errorJson(
          'CODE_GENERATION_FAILED',
          'Oda kodu üretilemedi, lütfen tekrar deneyin.',
          503,
        )
      }
      // Beklenmeyen bir dal (`createRoom`'un savunmacı SERVER_ERROR'ı gibi) —
      // sürücü ayrıntısı istemciye sızdırılmaz.
      logError('POST /api/rooms beklenmeyen sonuç kodu', { userId: identity.userId }, result.code)
      return errorJson('SERVER_ERROR', 'Oda oluşturulamadı.', 500)
    }

    const body = roomCreateResponseSchema.parse({ code: result.room.code })
    return Response.json(body, { status: 201 })
  } catch (error) {
    logError('POST /api/rooms hata', {}, error)
    return errorJson('SERVER_ERROR', 'Oda oluşturulamadı.', 500)
  }
}
