import { z } from 'zod'
import {
  boardConfigSchema,
  boardSizeSchema,
  playersSchema,
  roomCodeSchema,
  winLengthSchema,
} from '../primitives'

// ─── POST /api/rooms · GET /api/rooms/[code] ──────────────────────────────
export const roomStateSchema = z.enum(['waiting', 'playing', 'finished'])
export type RoomState = z.infer<typeof roomStateSchema>
export const roomCreateResponseSchema = z.object({ code: roomCodeSchema })
/**
 * `POST /api/rooms` gövdesi (KK-B14/B15, ADR-0015 §2). `boardConfigSchema`'nın
 * `.partial()`'ı — gövde tamamen yok da olabilir (`req.json()` patlarsa `{}`),
 * bu durumda sunucu `parseBoardConfig(undefined)` ile `{3,3}`'e düşer ve
 * bugünkü davranış bit düzeyinde korunur.
 */
export const roomCreateBodySchema = boardConfigSchema.partial()
export type RoomCreateBody = z.infer<typeof roomCreateBodySchema>

/**
 * CTR-003 payı (tasarım §12.5, bu pencerede ÜCRETSİZ kapatılır — ADR-0015 §7):
 * oda katılabilirliğinin TEK türetme noktası. Yalnız `waiting` durumdaki VE
 * en az bir boş koltuğu olan oda katılınabilir (§4 yaşam döngüsü).
 *
 * CTR-001'in bilinen kusuru tam buydu: mantık `apps/web/app/api/rooms/[code]/
 * route.ts`'te YEREL yazılmıştı, `packages/shared` dondurulduğu için
 * `ROOM-API-001` onu değiştiremedi. Bu kartta fonksiyon `shared`'a çıkar;
 * route BAĞLAMASI (bu fonksiyonu çağırmak) `CTR-003`'te kalır — o kart artık
 * ikinci bir unfreeze GEREKTİRMEZ.
 *
 * `roomStateResponseSchema`'nın kendi değişmezi de AYNI fonksiyonu çağırır:
 * iki yerde aynı mantığın iki kopyası olursa biri güncellenip diğeri
 * unutulabilir (bkz. "sabitin regex kopyası" gotcha örüntüsü).
 */
export function canJoinRoom(
  state: z.infer<typeof roomStateSchema>,
  seats: Pick<z.infer<typeof playersSchema>, 'X' | 'O'>,
): boolean {
  const bosKoltukVar = seats.X === null || seats.O === null
  return state === 'waiting' && bosKoltukVar
}

/**
 * `canJoin` türetilmiş bir alandır, bağımsız bir bayrak değil: **yalnız**
 * `waiting` odada ve boş koltuk varsa doğrudur (§4 yaşam döngüsü). Değişmez
 * dayatılmazsa "bitmiş + iki koltuk dolu + canJoin:true" gibi bir yanıt
 * sözleşmeye uyar, istemci katıl düğmesini açar ve WS 4403 ile kapanır.
 *
 * `size`/`winLength` ZORUNLU alanlardır (SB-09, US-B03): katılan oyuncu
 * odaya girmeden önce hangi oyunu oynayacağını görebilmelidir.
 */
export const roomStateResponseSchema = z
  .object({
    code: roomCodeSchema,
    state: roomStateSchema,
    seats: playersSchema,
    canJoin: z.boolean(),
    size: boardSizeSchema,
    winLength: winLengthSchema,
  })
  .superRefine((room, ctx) => {
    if (room.canJoin !== canJoinRoom(room.state, room.seats)) {
      ctx.addIssue({
        code: 'custom',
        message: 'canJoin yalnız bekleyen ve boş koltuğu olan odada true olabilir',
      })
    }
  })
export type RoomStateResponse = z.infer<typeof roomStateResponseSchema>
