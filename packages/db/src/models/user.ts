import { Schema, model, models, type Model } from 'mongoose'

export interface UserDoc {
  _id: string
  name: string
  email: string
  image?: string
  stats: { wins: number; losses: number; draws: number }
  elo: number
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, lowercase: true, index: true },
    image: { type: String },
    stats: {
      wins: { type: Number, default: 0, min: 0 },
      losses: { type: Number, default: 0, min: 0 },
      draws: { type: Number, default: 0, min: 0 },
    },
    elo: { type: Number, default: 1200, index: true },
  },
  { timestamps: true, collection: 'users', _id: false },
)

export const User: Model<UserDoc> =
  (models['User'] as Model<UserDoc> | undefined) ?? model<UserDoc>('User', userSchema)
