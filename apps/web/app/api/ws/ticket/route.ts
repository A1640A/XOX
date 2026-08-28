import { connectDb, recordWsTicket } from '@xox/db'
import { roomCodeSchema, type WsTicketResponse } from '@xox/shared'
import { z } from 'zod'
import { resolveIdentity } from '@/lib/auth/identity'
import { signToken } from '@/lib/auth/tokens'
import { errorJson } from '@/lib/http/error-json'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

const ticketBodySchema = z.object({ roomCode: roomCodeSchema })

/**
 * KK-010 / ADR-0006 — bilet (1) Bearer ya da (2) Auth.js çerezi ile
 * kimliklenir. `resolveIdentity` `allowTicket` GEÇMEDEN çağrılır (varsayılan
 * `false`): bu uç nokta bir bileti KABUL ETMEZ, yalnız ÜRETİR — aksi halde
 * bir saldırgan aynı bileti tekrar tekrar bu uca POST ederek 30 saniyelik
 * bir sızıntıyı süresiz hesap devralmaya çevirebilirdi (güvenlik denetimi
 * bulgusu). Tek çözücüden geçmek, kimlik kararını WS route'uyla AYNI kod
 * yolundan almasını garanti eder.
 *
 * Bilet, İSTENEN oda koduna BAĞLANIR (`room` claim): A odası için kesilmiş
 * bir bilet B odasında kabul edilmemeli (yatay yetki). WS upgrade route'u
 * (WS-001) `identity.room`'u URL'deki oda koduyla KARŞILAŞTIRMAK ZORUNDADIR.
 *
 * SEC-003: bilet TEK KULLANIMLIKTIR. `signToken('ws-ticket', ...)` her
 * çağrıda yeni bir `jti` üretir; bu fonksiyon o `jti`yi `@xox/db`'ye
 * `usedAt: null` olarak KAYDEDER — tüketimin (`consumeWsTicket`, WS upgrade
 * route'unun `resolveIdentity`'si üzerinden) karşılaştıracağı kayıt budur.
 * Kayıt yazılmadan dönen bir bilet asla `ok:true` ile tüketilemez
 * (`tickets.ts`'in fail-closed tasarımı), bu yüzden DB yazması BAŞARISIZ
 * olursa istemciye kullanılamaz bir bilet vermek yerine 500 döneriz.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorJson('INVALID_CODE', 'Gövde JSON olarak ayrıştırılamadı.', 400)
    }

    const parsed = ticketBodySchema.safeParse(body)
    if (!parsed.success) {
      return errorJson('INVALID_CODE', 'Geçersiz oda kodu.', 400)
    }

    const { token, expiresIn, jti } = await signToken('ws-ticket', identity.userId, {
      name: identity.name,
      room: parsed.data.roomCode,
    })

    await connectDb()
    await recordWsTicket({
      jti,
      userId: identity.userId,
      room: parsed.data.roomCode,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    })

    return Response.json({ ticket: token, expiresIn } satisfies WsTicketResponse)
  } catch (error) {
    logError('POST /api/ws/ticket hata', {}, error)
    return errorJson('SERVER_ERROR', 'Bilet üretilemedi.', 500)
  }
}
