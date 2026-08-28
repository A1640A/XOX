import {
  connectDb,
  getFriendsView,
  hasFinishedGameTogether,
  removeFriend,
  requestFriendship,
  respondToFriendRequest,
} from '@xox/db'
import { friendActionBodySchema, friendRequestBodySchema, friendsResponseSchema } from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { errorJson } from '@/lib/http/error-json'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function parseJsonBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() }
  } catch {
    return { ok: false }
  }
}

/**
 * KK-125/126/127 — `/arkadaslar` ve oyun-sonu panelindeki "Arkadaş ekle"
 * için tek REST yüzeyi (`docs/memory/api-contract.md`).
 *
 * **Kimlik her metotta `resolveIdentity(req)` ile çözülür, `allowTicket`
 * GEÇİLMEZ** — bilet yalnız WS upgrade'inde geçerlidir (ADR-0006, güvenlik
 * incelemesi dersi).
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    await connectDb()
    const view = await getFriendsView(identity.userId)
    const body = friendsResponseSchema.parse(view)
    return Response.json(body)
  } catch (error) {
    logError('GET /api/friends hata', {}, error)
    return errorJson('SERVER_ERROR', 'Arkadaş listesi alınamadı.', 500)
  }
}

/**
 * KK-126 — YALNIZ birlikte BİTMİŞ bir oyunu olan kullanıcıya istek gönderilebilir.
 *
 * **Numaralandırma karşıtı tasarım (güvenlik incelemesi dersi):** var olmayan
 * bir `userId` ile var olan ama uygun OLMAYAN bir `userId` arasında yanıt YA
 * DA zamanlama farkı YOKTUR — ikisi de `hasFinishedGameTogether`'ın TEK
 * `games.pairKey` sorgusundan geçer (kullanıcının var olup olmadığına dair
 * AYRI bir DB çağrısı yoktur), ikisi de aynı 403 `NOT_FRIENDS_ELIGIBLE`
 * yanıtını alır. Kendine istek göndermek de aynı yoldan reddedilir — bir
 * kullanıcının kendisiyle bitmiş bir oyunu asla yoktur (`Game.players.X !==
 * players.O` zorunluluğu oyun oluşturma tarafında garanti edilir), yani
 * ayrı bir "kendine gönderemez" dalı YOKTUR — özel durum genel kuraldan
 * kendiliğinden çıkar.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) {
      return errorJson('INVALID_MESSAGE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
    }

    const parsed = friendRequestBodySchema.safeParse(parsedBody.body)
    if (!parsed.success) {
      return errorJson('INVALID_MESSAGE', 'Geçersiz istek gövdesi.', 400)
    }

    await connectDb()
    const eligible = await hasFinishedGameTogether(identity.userId, parsed.data.userId)
    if (!eligible) {
      return errorJson(
        'NOT_FRIENDS_ELIGIBLE',
        'Yalnızca birlikte oyun bitirdiğin oyuncuları ekleyebilirsin.',
        403,
      )
    }

    await requestFriendship(identity.userId, parsed.data.userId)
    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    logError('POST /api/friends hata', {}, error)
    return errorJson('SERVER_ERROR', 'Arkadaşlık isteği gönderilemedi.', 500)
  }
}

/**
 * KK-125 — bekleyen bir isteği kabul/reddet. `userId` isteği GÖNDEREN
 * tarafı gösterir (alıcı her zaman oturum sahibidir). Var olmayan bir
 * isteğe ya da kendi gönderdiğin bir isteğe yanıt vermek sessizce hiçbir
 * şeyi DEĞİŞTİRMEZ (idempotans + numaralandırma karşıtı — `respondToFriendRequest`
 * bkz. `packages/db/src/queries/friends.ts`), her durumda 200 döner.
 */
export async function PATCH(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) {
      return errorJson('INVALID_MESSAGE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
    }

    const parsed = friendActionBodySchema.safeParse(parsedBody.body)
    if (!parsed.success) {
      return errorJson('INVALID_MESSAGE', 'Geçersiz istek gövdesi.', 400)
    }

    await connectDb()
    await respondToFriendRequest(identity.userId, parsed.data.userId, parsed.data.action)
    return Response.json({ ok: true })
  } catch (error) {
    logError('PATCH /api/friends hata', {}, error)
    return errorJson('SERVER_ERROR', 'İstek işlenemedi.', 500)
  }
}

/**
 * KK-127 — listeden çıkarma, İKİ TARAF için de siler (paylaşılan tek
 * sıralı-çift kaydı). `userId` bulunamasa/zaten çıkarılmış olsa bile
 * idempotent şekilde 200 döner.
 */
export async function DELETE(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    const parsedBody = await parseJsonBody(req)
    if (!parsedBody.ok) {
      return errorJson('INVALID_MESSAGE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
    }

    const parsed = friendRequestBodySchema.safeParse(parsedBody.body)
    if (!parsed.success) {
      return errorJson('INVALID_MESSAGE', 'Geçersiz istek gövdesi.', 400)
    }

    await connectDb()
    await removeFriend(identity.userId, parsed.data.userId)
    return Response.json({ ok: true })
  } catch (error) {
    logError('DELETE /api/friends hata', {}, error)
    return errorJson('SERVER_ERROR', 'Arkadaş çıkarılamadı.', 500)
  }
}
