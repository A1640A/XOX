import { connectDb, getLeaderboardView, type LeaderboardEntry } from '@xox/db'
import {
  leaderboardResponseSchema,
  type LeaderboardEntry as LeaderboardEntryDto,
  type ErrorCode,
  type ErrorResponse,
} from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

/**
 * `@xox/db`nin iç görünümü (`stats: {wins,losses,draws}`) ile REST sözleşmesinin
 * düz alanlarını (`wins`/`losses`/`draws`) ayıran TEK dönüşüm noktası — sorgu
 * mantığı burada YENİDEN YAZILMAZ, yalnızca şekil eşlenir (`getMatchHistory`'nin
 * `route.ts`'teki `.map`'iyle aynı ilke).
 */
function toEntryDto(entry: LeaderboardEntry): LeaderboardEntryDto {
  return {
    rank: entry.rank,
    userId: entry.userId,
    name: entry.name,
    elo: entry.elo,
    wins: entry.stats.wins,
    losses: entry.stats.losses,
    draws: entry.stats.draws,
    ratedGames: entry.ratedGames,
  }
}

/**
 * KK-115/117 — `/siralama`'nın tek REST yüzeyi (`docs/memory/api-contract.md`).
 *
 * **Kimlik `resolveIdentity(req)` ile çözülür, `allowTicket` GEÇİLMEZ** — bilet
 * yalnız WS upgrade'inde geçerlidir (ADR-0006, `GET /api/matches`/`GET
 * /api/friends` ile aynı disiplin). Sunucu middleware'e GÜVENMEZ (KK-003):
 * oturumsuz istek `GET /api/matches`/`GET /api/friends` ile AYNI şekilde 401
 * `UNAUTHENTICATED` alır — `getLeaderboardView`'ın `viewerUserId: null` yolu
 * (kendi dosyasında belgelendiği gibi "şu an tüm rotalar kimlik ister")
 * bugün bu route'tan hiç TETİKLENMEZ, yalnız sözleşmenin ileride gevşemesi
 * için hazır bekliyor.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    await connectDb()
    const view = await getLeaderboardView(identity.userId)
    const body = leaderboardResponseSchema.parse({
      entries: view.top.map(toEntryDto),
      you: view.self === null ? null : toEntryDto(view.self),
    })
    return Response.json(body)
  } catch (error) {
    logError('GET /api/leaderboard hata', {}, error)
    return errorJson('SERVER_ERROR', 'Sıralama alınamadı.', 500)
  }
}
