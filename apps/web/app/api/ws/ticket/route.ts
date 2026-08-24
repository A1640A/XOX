import {
  roomCodeSchema,
  type ErrorCode,
  type ErrorResponse,
  type WsTicketResponse,
} from '@xox/shared'
import { z } from 'zod'
import { resolveIdentity } from '@/lib/auth/identity'
import { signToken } from '@/lib/auth/tokens'

export const dynamic = 'force-dynamic'

const ticketBodySchema = z.object({ roomCode: roomCodeSchema })

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

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
 */
export async function POST(req: Request): Promise<Response> {
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

  const { token, expiresIn } = await signToken('ws-ticket', identity.userId, {
    name: identity.name,
    room: parsed.data.roomCode,
  })

  return Response.json({ ticket: token, expiresIn } satisfies WsTicketResponse)
}
