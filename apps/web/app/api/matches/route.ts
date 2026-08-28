import { connectDb, getMatchHistory } from '@xox/db'
import { matchesResponseSchema, type ErrorCode, type ErrorResponse } from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

/**
 * KK-116/117 — `/gecmis`in tek REST yüzeyi (`docs/memory/api-contract.md`).
 *
 * **Kimlik `resolveIdentity(req)` ile çözülür, `allowTicket` GEÇİLMEZ** —
 * bilet yalnız WS upgrade'inde geçerlidir (ADR-0006, `GET /api/friends` ile
 * aynı disiplin).
 *
 * Sayfalama YOK: `getMatchHistory` her zaman en son `HISTORY_PAGE_SIZE` (20)
 * bitmiş oyunu döner — tasarım kapsamı bununla sınırlı (KK-116).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    await connectDb()
    const matches = await getMatchHistory(identity.userId)
    const body = matchesResponseSchema.parse({
      matches: matches.map((match) => ({
        gameId: match.gameId,
        finishedAt: match.finishedAt,
        opponent: match.opponent,
        result: match.result,
        endReason: match.endReason,
        rated: match.rated,
        eloDelta: match.eloDelta,
      })),
    })
    return Response.json(body)
  } catch (error) {
    logError('GET /api/matches hata', {}, error)
    return errorJson('SERVER_ERROR', 'Maç geçmişi alınamadı.', 500)
  }
}
