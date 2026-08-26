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

/**
 * Tahta uzunluğu: 9 (3×3) .. 121 (11×11). Şema **şekil** korur, kural motoru
 * değildir — `board.length === size²` odanın kendi konfigürasyonuna karşı
 * SUNUCUDA kontrol edilir (ayrıştırma anında oda konfigürasyonu erişilebilir
 * değildir). Sınırlar (9, 121) ÇIPLAK yazılır, `game-core`'un `BOARD_MODES`
 * değerlerinden türetilmez (CTR-BOARD-001, gotcha örüntü 2) — barrel'dan
 * `game-core` değeri yeniden dışa vermek `@xox/shared`'ın her tüketicisine
 * `game-core`'u sokardı (D8).
 */
export const boardSchema = z.array(cellSchema).min(9).max(121)

/**
 * Tahta indeksi: 0..120 tam sayı (CTR-BOARD-001). Hem hamle hem kazanan çizgi
 * bunu kullanır. Aralık üst sınırı en büyük tahtanın (11×11 = 121 hücre) son
 * indeksidir; oda boyutuna göre daraltma SUNUCUDADIR — aşan indeks mevcut
 * `move:rejected reason:'out-of-range'` ile reddedilir, protokole yeni bir
 * reddetme sebebi eklenmez (ADR-0015 §4).
 */
export const cellIndexSchema = z.number().int().min(0).max(120)

/** Tahta kenar uzunluğu — donmuş üçlü (spec §0.1: "başka boyut yok"). */
export const boardSizeSchema = z.union([z.literal(3), z.literal(6), z.literal(11)])

/** Kazanmak için yan yana gereken taş sayısı (K). 3..6 arası (ADR-0010 §2). */
export const winLengthSchema = z.number().int().min(3).max(6)

/**
 * Tahta konfigürasyonu — REST gövdesinin tam (opsiyonel olmayan) şekli.
 * `roomCreateBodySchema` bunun `.partial()`'ıdır (gövde tamamen yok da
 * olabilir, KK-B14/B15). Bu şema `game-core`'un `BoardConfig`'iyle **aynı
 * şekli** taşır ama ondan türetilmez — `shared` `game-core`'u import edemez.
 */
export const boardConfigSchema = z.object({ size: boardSizeSchema, winLength: winLengthSchema })

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
export type BoardSize = z.infer<typeof boardSizeSchema>
export type WinLength = z.infer<typeof winLengthSchema>
export type BoardConfigShape = z.infer<typeof boardConfigSchema>
