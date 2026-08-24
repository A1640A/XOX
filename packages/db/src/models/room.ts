import { ROOM_TTL_SECONDS } from '@xox/shared'
import { Schema, model, models, type Model } from 'mongoose'

export type RoomState = 'waiting' | 'playing' | 'finished'

export interface RoomDoc {
  code: string
  state: RoomState
  seats: { X: string | null; O: string | null }
  gameId: string | null
  /** Her yazma işleminde artar — istemci iyimser güncellemeyi bununla uzlaştırır. */
  version: number
  createdAt: Date
  updatedAt: Date
}

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
      index: true,
    },
    seats: {
      X: { type: String, default: null },
      O: { type: String, default: null },
    },
    gameId: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'rooms' },
)

// Terk edilmiş odalar kendiliğinden temizlenir.
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ROOM_TTL_SECONDS })

export const Room: Model<RoomDoc> =
  (models['Room'] as Model<RoomDoc> | undefined) ?? model<RoomDoc>('Room', roomSchema)
