import { randomUUID } from 'node:crypto'
import type { Cell, EndReason, Player, WinLineCells } from '@xox/shared'
import { Schema, model, models, type Model } from 'mongoose'

export interface MoveDoc {
  index: number
  by: Player
  at: Date
}

export interface GameDoc {
  _id: string
  roomCode: string
  /** B3 — kimin hangi koltukta oynadığı. */
  players: { X: string; O: string }
  /** `[X.userId, O.userId]` — çok anahtarlı indeks için türetilmiş (§3.6). */
  participants: string[]
  /** Sıralı `${a}|${b}` — KK-113 / KK-126. Yalnız oyun oluşturulurken yazılır. */
  pairKey: string
  board: Cell[]
  moves: MoveDoc[]
  winner: Player | null
  isDraw: boolean
  /** B4 — çizgisiz galibiyet sebebi. */
  endReason: EndReason | null
  /** B1'in kalıcı karşılığı. */
  winLine: WinLineCells | null
  /** B4 — puanlı oyun mu. */
  rated: boolean
  eloDelta: { X: number; O: number }
  finishedAt: Date | null
  /** Stats+ELO uygulandı damgası (KK-053). */
  settledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const moveSchema = new Schema<MoveDoc>(
  {
    index: { type: Number, required: true, min: 0, max: 8 },
    by: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
)

function isThreeIndexTuple(value: number[] | null): boolean {
  return value === null || value.length === 3
}

const gameSchema = new Schema<GameDoc>(
  {
    _id: { type: String, default: (): string => randomUUID() },
    roomCode: { type: String, required: true, index: true },
    players: {
      X: { type: String, required: true },
      O: { type: String, required: true },
    },
    participants: { type: [String], required: true },
    pairKey: { type: String, required: true },
    board: {
      type: [{ type: String, enum: ['X', 'O', null] }],
      default: (): null[] => Array.from({ length: 9 }, () => null),
    },
    moves: { type: [moveSchema], default: (): MoveDoc[] => [] },
    winner: { type: String, enum: ['X', 'O', null], default: null },
    isDraw: { type: Boolean, default: false },
    endReason: {
      type: String,
      enum: ['line', 'resign', 'timeout', 'abandon', null],
      default: null,
    },
    winLine: {
      type: [Number],
      default: null,
      validate: {
        validator: isThreeIndexTuple,
        message: 'winLine tam olarak 3 indeks içermelidir',
      },
    },
    rated: { type: Boolean, default: false },
    eloDelta: {
      X: { type: Number, default: 0 },
      O: { type: Number, default: 0 },
    },
    finishedAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'games', _id: false },
)

// `participants`/`pairKey` üzerindeki bileşik indeksler KK-116/117/113/126'yı karşılar (§3.6).
gameSchema.index({ participants: 1, finishedAt: -1 })
gameSchema.index({ pairKey: 1, finishedAt: -1 })
gameSchema.index({ finishedAt: -1 })

export const Game: Model<GameDoc> =
  (models['Game'] as Model<GameDoc> | undefined) ?? model<GameDoc>('Game', gameSchema)
