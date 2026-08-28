import { z } from 'zod'
import { EMOJI_PALETTE } from './constants'
import { errorCodeSchema } from './errors'
import { moveRejectionReasonSchema, transportStatusSchema } from './game-status'
import {
  boardSchema,
  boardSizeSchema,
  cellIndexSchema,
  epochMsSchema,
  playerSchema,
  playersSchema,
  roomCodeSchema,
  winLengthSchema,
} from './primitives'

/**
 * Beyaz listeli emoji (KK-123). Serbest metin protokol seviyesinde reddedilir;
 * böylece XSS/istismar yüzeyi tek noktada kapanır ve sunucu yalnızca hız
 * sınırını (KK-124) uygulamak zorunda kalır.
 */
export const emojiSchema = z.enum(EMOJI_PALETTE)

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), roomCode: roomCodeSchema }),
  z.object({ type: z.literal('move'), index: cellIndexSchema }),
  z.object({ type: z.literal('resign') }),
  z.object({ type: z.literal('rematch:offer') }),
  z.object({ type: z.literal('rematch:accept') }),
  z.object({ type: z.literal('chat:emoji'), emoji: emojiSchema }),
  z.object({ type: z.literal('ping') }),
])

export const rematchOfferSchema = z.object({ by: playerSchema, expiresAt: epochMsSchema })

/**
 * Rakibin son oynadığı hücre (ADR-0015 §3, KK-B55) — spec'te YOKTU, tasarım
 * turunda eklendi. `state`'te olmayan her şey Z2 rotasyonundan (en geç 300 sn)
 * sonra kaybolur; `data-son-hamle` 121 hücrede "rakibin hamlesini anında gör"ün
 * tek görsel dayanağıdır. `RoomDoc.moves`'un son elemanından üretilir — `moves`
 * dizisinin tamamı yük bütçesi (KK-B70) yüzünden gönderilmez.
 */
export const lastMoveSchema = z.object({ index: cellIndexSchema, by: playerSchema })

/**
 * Tam durum yayını (tasarım §2.4). Yeniden bağlanan istemcinin gördüğü **tek**
 * gerçek budur: Vercel bağlantıyı en geç 300 sn'de kestiği için (Z2) her
 * istemci düzenli olarak buradan sıfırlanır, dolayısıyla ekranı çizmek için
 * gereken her alan burada olmak zorundadır.
 *
 * `serverTime` olmadan `turnDeadline` işe yaramaz: istemci saati kayıksa geri
 * sayım anında sıfırlanır. İstemci `offset = serverTime - Date.now()` tutar.
 */
export const stateMessageSchema = z.object({
  type: z.literal('state'),
  roomCode: roomCodeSchema,
  board: boardSchema,
  status: transportStatusSchema,
  players: playersSchema,
  /** Alıcının kendi koltuğu — "Kazandın/Kaybettin" ayrımı (KK-050). */
  you: playerSchema,
  /** Monotonik sürüm — istemci iyimser güncellemeyi bununla geri alır. */
  version: z.number().int().nonnegative(),
  /** Epoch ms · P0'da null (AS-08). */
  turnDeadline: epochMsSchema.nullable(),
  /** Rakip kopukken geri sayım hedefi (KK-070). */
  graceEndsAt: epochMsSchema.nullable(),
  /** Rövanş teklifi state'te taşınır — rotasyondan sonra görünür kalsın (§2.4). */
  rematch: rematchOfferSchema.nullable(),
  /** İstemci saat sapmasını düzeltir (spec §3.10). */
  serverTime: epochMsSchema,
  /**
   * Tahtanın kenar uzunluğu — istemci `board.length`'ten türetebilir ama
   * ayrı taşınır, ayrıştırma anında ikisinin tutarlılığı burada değil
   * SUNUCUDA (yazma kapısında) dayatılır (ADR-0015 §4).
   */
  size: boardSizeSchema,
  /** Kazanmak için yan yana gereken taş sayısı — istemci `board.length`'ten TÜRETEMEZ. */
  winLength: winLengthSchema,
  lastMove: lastMoveSchema.nullable(),
})

export const serverMessageSchema = z.discriminatedUnion('type', [
  stateMessageSchema,
  z.object({
    type: z.literal('move:applied'),
    index: cellIndexSchema,
    by: playerSchema,
    version: z.number().int().nonnegative(),
    /**
     * Sıradaki oyuncunun yeni süre hedefi (CTR-004). `state` mesajları
     * ARASINDA geçen her hamlede sayacın bayatlamasını engeller: W2-01
     * `rooms.turnDeadline`'ı her hamlede yeniden yazıyor ama ince yol onu
     * taşımadığı için istemci oyunun BAŞLANGIÇ hedefinde takılı kalıyordu
     * (~60 sn sonra 0 gösteriyor, oysa sunucu hâlâ süre veriyor).
     *
     * Üç ayrı anlamı vardır, ikisi değil:
     *   `number`    → yeni hedef,
     *   `null`      → hedef YOK (hamle oyunu bitirdi; sayaç durur),
     *   ALAN YOK    → sunucu bu bilgiyi göndermiyor (CTR-004 öncesi sürüm);
     *                 istemci son bildiği hedefi KORUR.
     *
     * Bu yüzden `.optional()` — geriye dönük uyumluluğun İKİ yönü de var:
     * eski istemci fazla anahtarı zaten kırpar; yeni istemci ise ESKİ bir
     * sunucunun çerçevesini `turnDeadline` zorunlu olsaydı tümüyle REDDEDER
     * ve yankıyı kaçırıp tahtayı dondururdu.
     *
     * `serverTime` bilerek EKLENMEDİ: saat sapması `state`ten gelen
     * `serverOffsetMs` ile zaten düzeltiliyor ve o değer en geç 300 sn'lik
     * Z2 rotasyonunda tazeleniyor — her hamlede ikinci bir damga taşımak
     * R1 fan-out bütçesini karşılıksız büyütürdü.
     */
    turnDeadline: epochMsSchema.nullable().optional(),
  }),
  z.object({
    type: z.literal('move:rejected'),
    index: cellIndexSchema,
    reason: moveRejectionReasonSchema,
  }),
  z.object({
    type: z.literal('opponent:joined'),
    userId: z.string().min(1),
    seat: playerSchema,
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal('opponent:left'),
    /** Yalnız günlük içindir; istemci `seat` kullanır. */
    userId: z.string().min(1),
    seat: playerSchema,
    graceEndsAt: epochMsSchema.nullable(),
  }),
  z.object({ type: z.literal('opponent:returned'), seat: playerSchema }),
  z.object({ type: z.literal('game:over'), status: transportStatusSchema, endedAt: epochMsSchema }),
  z.object({
    type: z.literal('rematch:offered'),
    by: playerSchema,
    expiresAt: epochMsSchema,
  }),
  z.object({
    type: z.literal('rematch:cancelled'),
    reason: z.enum(['opponent-left', 'expired']),
  }),
  z.object({
    type: z.literal('chat:emoji'),
    from: playerSchema,
    emoji: emojiSchema,
    at: epochMsSchema,
  }),
  z.object({ type: z.literal('error'), code: errorCodeSchema, message: z.string() }),
  z.object({ type: z.literal('pong') }),
])

export type Emoji = z.infer<typeof emojiSchema>
export type RematchOffer = z.infer<typeof rematchOfferSchema>
export type LastMove = z.infer<typeof lastMoveSchema>
export type StateMessage = z.infer<typeof stateMessageSchema>
export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
