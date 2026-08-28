import { connectDb, getRoomSummary } from '@xox/db'
import { canJoinRoom, roomCodeSchema, roomStateResponseSchema } from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { errorJson } from '@/lib/http/error-json'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ code: string }>
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
 * dar tipini görür; Mongoose modeline (`Room`) doğrudan erişmez.
 *
 * `canJoin` BURADA HESAPLANMAZ — tek kaynak `@xox/shared`'ın `canJoinRoom`'u
 * (CTR-003, `rest-contract.ts`). Route yerel bir `&&` kopyası TUTMAZ; aksi
 * hâlde bu route ile `roomStateResponseSchema`'nın kendi `superRefine`
 * değişmezi ayrı ayrı güncellenip birbirinden sapabilir (CTR-001'in kusuru
 * tam buydu). `size`/`winLength` de kendi tek kaynağından (`resolveBoardConfig`,
 * `getRoomSummary` içinde zaten uygulanmış) gelir — burada `?? 3` gibi bir
 * üçüncü kopya YAZILMAZ, `room.size`/`room.winLength` doğrudan aktarılır.
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

    const body = roomStateResponseSchema.parse({
      code: room.code,
      state: room.state,
      seats: room.seats,
      canJoin: canJoinRoom(room.state, room.seats),
      size: room.size,
      winLength: room.winLength,
    })
    return Response.json(body)
  } catch (error) {
    logError('GET /api/rooms/[code] hata', {}, error)
    return errorJson('SERVER_ERROR', 'Oda bilgisi alınamadı.', 500)
  }
}
