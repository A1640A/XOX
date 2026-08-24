import { Schema, model, models, type Model } from 'mongoose'

export interface MoveDoc {
  index: number
  by: 'X' | 'O'
  at: Date
}

export interface GameDoc {
  roomCode: string
  board: (('X' | 'O') | null)[]
  moves: MoveDoc[]
  winner: 'X' | 'O' | null
  isDraw: boolean
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const moveSchema = new Schema<MoveDoc>(
  {
    index: { type: Number, required: true, min: 0, max: 8 },
    by: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, default: (): Date => new Date() },
  },
  { _id: false },
)

const gameSchema = new Schema<GameDoc>(
  {
    roomCode: { type: String, required: true, index: true },
    board: { type: [String], default: (): null[] => Array.from({ length: 9 }, () => null) },
    moves: { type: [moveSchema], default: (): MoveDoc[] => [] },
    winner: { type: String, enum: ['X', 'O', null], default: null },
    isDraw: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'games' },
)

gameSchema.index({ finishedAt: -1 })

export const Game: Model<GameDoc> =
  (models['Game'] as Model<GameDoc> | undefined) ?? model<GameDoc>('Game', gameSchema)
