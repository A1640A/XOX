import { randomUUID } from 'node:crypto'
import type { Cell, EndReason, Player, WinLineCells } from '@xox/shared'
import type { Model } from 'mongoose'
import mongoose from 'mongoose'

// mongoose CommonJS: tsx-in ESM yukleyicisi named export-lari goremez
// (`does not provide an export named 'models'`). Vitest calisir cunku Vite
// CJS interop-u farkli yapar — yani birim testler bu kirikligi GIZLER.
const { Schema, model, models } = mongoose
import { buildPairKey, deriveParticipants } from '../pair'
import { hasAtMostLength, hasExactLength, isNullOrExactLength } from './validators'

const BOARD_SIZE = 9

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
      default: (): null[] => Array.from({ length: BOARD_SIZE }, () => null),
      validate: {
        validator: hasExactLength(BOARD_SIZE),
        message: `board tam olarak ${String(BOARD_SIZE)} hücre içermelidir`,
      },
    },
    moves: {
      type: [moveSchema],
      default: (): MoveDoc[] => [],
      validate: {
        validator: hasAtMostLength(BOARD_SIZE),
        message: `moves en fazla ${String(BOARD_SIZE)} kayıt içerebilir`,
      },
    },
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
        validator: isNullOrExactLength(3),
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

/**
 * Bitiş alanları çapraz tutarlı olmak zorunda — reviewer canlıda kanıtladı:
 * `winner:'X'` + `isDraw:true` kabul ediliyordu, `winner:null` +
 * `endReason:'line'` + `winLine:null` de kabul ediliyordu. Üç kural:
 * - `isDraw` ⇒ `winner === null`
 * - `endReason === 'line'` ⇒ `winner !== null && winLine !== null`
 * - `finishedAt === null` ⇒ `winner === null && !isDraw` (oyun sürüyorsa sonuç yok)
 * - `participants`/`pairKey` **`players`'tan türetilenle eşleşir** (DB-002/AC12):
 *   ikisi de yalnız oyun oluşturulurken yazılan türetilmiş alanlardır
 *   (§3.3/§3.6); `buildPairKey`/`deriveParticipants` TEK üretim noktasıdır —
 *   burada elle tekrar hesaplanmaz, o iki fonksiyon çağrılır.
 */
gameSchema.pre('validate', function preValidate(): void {
  if (this.isDraw && this.winner !== null) {
    throw new Error('isDraw=true iken winner null olmalıdır')
  }
  if (this.endReason === 'line' && (this.winner === null || this.winLine === null)) {
    throw new Error("endReason='line' iken winner ve winLine dolu olmalıdır")
  }
  if (this.finishedAt === null && (this.winner !== null || this.isDraw)) {
    throw new Error('finishedAt=null iken winner/isDraw atanamaz (oyun sürüyor)')
  }

  const expectedParticipants = deriveParticipants(this.players)
  const participantsMatch =
    this.participants.length === expectedParticipants.length &&
    this.participants.every((value, i) => value === expectedParticipants[i])
  if (!participantsMatch) {
    throw new Error('participants players alanından türetilenle eşleşmiyor (§3.3/DB-002 AC12)')
  }

  const expectedPairKey = buildPairKey(this.players.X, this.players.O)
  if (this.pairKey !== expectedPairKey) {
    throw new Error('pairKey players alanından türetilenle eşleşmiyor (§3.3/DB-002 AC12)')
  }
})

// `participants`/`pairKey` üzerindeki bileşik indeksler KK-116/117/113/126'yı karşılar (§3.6).
gameSchema.index({ participants: 1, finishedAt: -1 })
gameSchema.index({ pairKey: 1, finishedAt: -1 })
gameSchema.index({ finishedAt: -1 })

export const Game: Model<GameDoc> =
  (models['Game'] as Model<GameDoc> | undefined) ?? model<GameDoc>('Game', gameSchema)
