import type { Cell, Player, SeatOccupant } from '@xox/shared'
import { ROOM_TTL_SECONDS } from '@xox/shared'
import { Schema, model, models, type Model } from 'mongoose'
import { hasAtMostLength, hasExactLength } from './validators'

const BOARD_SIZE = 9

export type RoomState = 'waiting' | 'playing' | 'finished'

/** Odanın canlı hamle listesindeki tek kayıt (tasarım §3.2). */
export interface RoomMove {
  index: number
  by: Player
  at: Date
}

/**
 * Koltuğun tek geçerli WS bağlantısı. Takeover ve grace instance'lar arası
 * çalışmak zorunda; süreç-içi bir kayıt defteri iki oyuncu iki instance'taysa
 * hiçbir şey bilmez (tasarım §3.2/§5.4).
 */
export interface RoomPresence {
  connId: string
  since: Date
}

/** Rakip koptuğunda geri sayım hedefi — §3.1 / AS-05 (P1). */
export interface RoomDisconnected {
  seat: Player
  at: Date
  graceEndsAt: Date
}

/** Rövanş teklifi `state`'e girer — teklif odadan geçmek zorunda (§2.4). */
export interface RoomRematch {
  by: Player
  expiresAt: Date
}

/** Son emoji — version ARTIRMAZ, yalnız bir sonraki yayında bir kez okunur (P2). */
export interface RoomEmoji {
  from: Player
  emoji: string
  at: Date
}

export interface RoomDoc {
  code: string
  state: RoomState
  /** Koltuk sahibi: kimlik + görünen ad (KK-032 — tek round-trip). */
  seats: { X: SeatOccupant | null; O: SeatOccupant | null }
  /** Aktif WS bağlantısı — takeover ve grace bunun üzerinden çalışır. */
  presence: { X: RoomPresence | null; O: RoomPresence | null }
  board: Cell[]
  moves: RoomMove[]
  turnDeadline: Date | null
  disconnected: RoomDisconnected | null
  rematch: RoomRematch | null
  lastEmoji: RoomEmoji | null
  gameId: string | null
  /** Her durum değiştiren yazmada artar — emoji istisna (§5.5). */
  version: number
  startedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const seatOccupantSchema = new Schema<SeatOccupant>(
  { userId: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
)

const presenceSchema = new Schema<RoomPresence>(
  { connId: { type: String, required: true }, since: { type: Date, required: true } },
  { _id: false },
)

const moveSchema = new Schema<RoomMove>(
  {
    index: { type: Number, required: true, min: 0, max: 8 },
    by: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
)

const disconnectedSchema = new Schema<RoomDisconnected>(
  {
    seat: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, required: true },
    graceEndsAt: { type: Date, required: true },
  },
  { _id: false },
)

const rematchSchema = new Schema<RoomRematch>(
  {
    by: { type: String, enum: ['X', 'O'], required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
)

const emojiSchema = new Schema<RoomEmoji>(
  {
    from: { type: String, enum: ['X', 'O'], required: true },
    emoji: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
)

const roomSchema = new Schema<RoomDoc>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6,
    },
    state: {
      type: String,
      enum: ['waiting', 'playing', 'finished'],
      default: 'waiting',
    },
    seats: {
      X: { type: seatOccupantSchema, default: null },
      O: { type: seatOccupantSchema, default: null },
    },
    presence: {
      X: { type: presenceSchema, default: null },
      O: { type: presenceSchema, default: null },
    },
    board: {
      type: [{ type: String, enum: ['X', 'O', null] }],
      default: (): null[] => Array.from({ length: BOARD_SIZE }, () => null),
      validate: {
        validator: hasExactLength(BOARD_SIZE),
        message: `board tam olarak ${String(BOARD_SIZE)} hücre içermelidir`,
      },
    },
    moves: {
      type: [moveSchema],
      default: (): RoomMove[] => [],
      validate: {
        validator: hasAtMostLength(BOARD_SIZE),
        message: `moves en fazla ${String(BOARD_SIZE)} kayıt içerebilir`,
      },
    },
    turnDeadline: { type: Date, default: null },
    disconnected: { type: disconnectedSchema, default: null },
    rematch: { type: rematchSchema, default: null },
    lastEmoji: { type: emojiSchema, default: null },
    gameId: { type: String, default: null },
    version: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'rooms' },
)

// Terk edilmiş odalar kendiliğinden temizlenir (B10: bilinçli — tasarım §3.6).
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ROOM_TTL_SECONDS })

export const Room: Model<RoomDoc> =
  (models['Room'] as Model<RoomDoc> | undefined) ?? model<RoomDoc>('Room', roomSchema)
