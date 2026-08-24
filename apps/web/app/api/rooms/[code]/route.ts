import { connectDb, Room } from '@xox/db'
import {
  roomCodeSchema,
  roomStateResponseSchema,
  type ErrorCode,
  type ErrorResponse,
} from '@xox/shared'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ code: string }>
}

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

/**
 * Oda özeti — WS upgrade **öncesi** ön kontrol (tasarım §5.1/§7, KK-033).
 * Kimlik gerektirmez: bir kullanıcı giriş yapmadan bile bir kodun geçerli
 * olup olmadığını görebilmeli (davet akışı).
 *
 * Kod **sunucu tarafında** normalleştirilir (trim + büyük harf) — istemci
 * doğrulaması tek savunma hattı değildir. Normalleştirme sonrası
 * `roomCodeSchema` dışı kalan her değer `400 INVALID_CODE` alır.
 */
export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const { code: rawCode } = await params
  const normalized = rawCode.trim().toUpperCase()
  const parsed = roomCodeSchema.safeParse(normalized)
  if (!parsed.success) {
    return errorJson('INVALID_CODE', 'Geçersiz oda kodu.', 400)
  }
  const code = parsed.data

  try {
    await connectDb()
    const room = await Room.findOne({ code }).select('code state seats').lean()
    if (room === null) {
      return errorJson('ROOM_NOT_FOUND', 'Oda bulunamadı.', 404)
    }

    const bosKoltukVar = room.seats.X === null || room.seats.O === null
    const body = roomStateResponseSchema.parse({
      code: room.code,
      state: room.state,
      seats: room.seats,
      canJoin: room.state === 'waiting' && bosKoltukVar,
    })
    return Response.json(body)
  } catch (error) {
    console.error('GET /api/rooms/[code] hata', error)
    return errorJson('SERVER_ERROR', 'Oda bilgisi alınamadı.', 500)
  }
}
