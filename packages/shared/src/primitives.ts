import { z } from 'zod'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants'

/**
 * Protokolün en küçük yapı taşları. `game-status.ts` ve `ws-protocol.ts`'in
 * ikisi de bunlara ihtiyaç duyar; ortak bir modülde durmasalardı
 * `ws-protocol -> game-status -> ws-protocol` döngüsü oluşurdu
 * (`import-x/no-cycle` bunu zaten reddeder).
 */
export const playerSchema = z.enum(['X', 'O'])
export const cellSchema = playerSchema.nullable()
export const boardSchema = z.array(cellSchema).length(9)

/** Tahta indeksi: 0..8 tam sayı. Hem hamle hem kazanan çizgi bunu kullanır. */
export const cellIndexSchema = z.number().int().min(0).max(8)

/**
 * Kabul edilen karakter kümesi `ROOM_CODE_ALPHABET`'ten **türetilir**, elle
 * yazılmaz: aksi hâlde alfabeye bir karakter eklendiğinde `POST /api/rooms`
 * kodu üretir ama şema reddeder — oda kurulur, katılınamaz. Regex yerine küme
 * kontrolü kullanılıyor; alfabe bir gün regex özel karakteri içerirse bile
 * kaçış sorunu doğmaz.
 */
export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .refine((code) => {
    // `charAt` bilinçli: dizgiyi yaymak (`[...code]`) emoji/çift baytlı
    // karakterlerde farklı davranır ve lint tarafından da reddedilir.
    for (let i = 0; i < code.length; i += 1) {
      if (!ROOM_CODE_ALPHABET.includes(code.charAt(i))) return false
    }
    return true
  }, 'Oda kodu yalnızca karışmayan büyük harf ve rakam içerir')

/** Epoch milisaniye — istemci saat sapması `state.serverTime` ile düzeltilir. */
export const epochMsSchema = z.number().int()

/**
 * Koltuk sahibi: kimlik + **görünen ad** (KK-032 — tek round-trip).
 * Burada durur çünkü iki ayrı yüzey okuyor: WS `state.players` ve REST
 * `GET /api/rooms/[code]` `seats`. REST'in WS protokolünden import etmesi,
 * `players`'a eklenen bir WS alanının (ör. presence) REST yanıtından sızması
 * demekti; tasarım ikisini bilerek ayrı adlandırmış.
 */
export const seatOccupantSchema = z.object({ userId: z.string().min(1), name: z.string().min(1) })
export const playersSchema = z.object({
  X: seatOccupantSchema.nullable(),
  O: seatOccupantSchema.nullable(),
})

export type Player = z.infer<typeof playerSchema>
export type SeatOccupant = z.infer<typeof seatOccupantSchema>
export type Players = z.infer<typeof playersSchema>
export type Cell = z.infer<typeof cellSchema>
export type BoardCells = z.infer<typeof boardSchema>
export type RoomCode = z.infer<typeof roomCodeSchema>
