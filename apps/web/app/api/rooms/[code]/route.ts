import { connectDb, getRoomSummary } from '@xox/db'
import {
  roomCodeSchema,
  roomStateResponseSchema,
  type ErrorCode,
  type ErrorResponse,
} from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ code: string }>
}

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

/**
 * Oda özeti — WS upgrade **öncesi** ön kontrol (tasarım §5.1/§7, KK-033).
 *
 * **Kimlik zorunludur** (lead kararı, güvenlik incelemesi bulgusu): yanıt
 * `seats.X/O.userId`'yi (gerçek ad eşliğinde) taşıyor ve bu değer
 * `POST /api/friends`'in `{userId}` gövdesinin birebir kabul ettiği şey —
 * kimliksiz bir çağıran, sızmış TEK bir oda kodundan hedeflenebilir bir
 * kimlik + gerçek ad çıkarabilir. Bugün hiçbir istemci bu uca kimliksiz
 * erişmiyor (davet akışı `/oda/[kod]`e doğrudan yönleniyor, WS'e bağlanıyor),
 * yani `canJoin` bile şu an tüketilmiyor — kapatmanın maliyeti sıfır.
 * `resolveIdentity` `allowTicket` GEÇMEDEN çağrılır (`POST /api/rooms`'la
 * aynı disiplin): bilet yalnız WS upgrade'inde geçerlidir.
 *
 * Sıra ÖNEMLİDİR: önce kimlik, sonra kod doğrulama — aksi hâlde kimliksiz
 * çağıran "bu kod geçerli formatta mı" bilgisini hâlâ öğrenebilirdi.
 *
 * Kod **sunucu tarafında** normalleştirilir (trim + büyük harf) — istemci
 * doğrulaması tek savunma hattı değildir. Normalleştirme sonrası
 * `roomCodeSchema` dışı kalan her değer `400 INVALID_CODE` alır.
 *
 * Projeksiyon dizesi ve koltuk şekli bilgisi burada YOKTUR — `@xox/db`'nin
 * `getRoomSummary`'sine devredilmiştir (DB-003). Bu route yalnız `RoomSummary`
 * dar tipini görür ve `canJoin`'i ondan türetir; Mongoose modeline (`Room`)
 * doğrudan erişmez.
 */
export async function GET(req: Request, { params }: RouteContext): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    const { code: rawCode } = await params
    const normalized = rawCode.trim().toUpperCase()
    const parsed = roomCodeSchema.safeParse(normalized)
    if (!parsed.success) {
      return errorJson('INVALID_CODE', 'Geçersiz oda kodu.', 400)
    }
    const code = parsed.data

    await connectDb()
    const room = await getRoomSummary(code)
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
