import { z } from 'zod'
import { EMOJI_PALETTE } from './constants'
import { errorCodeSchema } from './errors'
import { moveRejectionReasonSchema, transportStatusSchema } from './game-status'
import {
  boardSchema,
  cellIndexSchema,
  epochMsSchema,
  playerSchema,
  roomCodeSchema,
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

/** Koltuk sahibi: kimlik + **görünen ad** (KK-032 — tek round-trip). */
export const seatOccupantSchema = z.object({ userId: z.string().min(1), name: z.string().min(1) })
export const playersSchema = z.object({
  X: seatOccupantSchema.nullable(),
  O: seatOccupantSchema.nullable(),
})

export const rematchOfferSchema = z.object({ by: playerSchema, expiresAt: epochMsSchema })

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
})

export const serverMessageSchema = z.discriminatedUnion('type', [
  stateMessageSchema,
  z.object({
    type: z.literal('move:applied'),
    index: cellIndexSchema,
    by: playerSchema,
    version: z.number().int().nonnegative(),
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
export type SeatOccupant = z.infer<typeof seatOccupantSchema>
export type Players = z.infer<typeof playersSchema>
export type RematchOffer = z.infer<typeof rematchOfferSchema>
export type StateMessage = z.infer<typeof stateMessageSchema>
export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
