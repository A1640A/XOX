import { Schema, model, models, type Model } from 'mongoose'

/** ADR-0005 döndürmeli (rotating) mobil refresh token kaydı. */
export interface MobileRefreshTokenDoc {
  /** JWT ID — tek kullanımlık, benzersiz. */
  jti: string
  userId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const mobileRefreshTokenSchema = new Schema<MobileRefreshTokenDoc>(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'mobileRefreshTokens' },
)

// TTL = 0: doküman `expiresAt` anında silinir, cron gerekmez.
mobileRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const MobileRefreshToken: Model<MobileRefreshTokenDoc> =
  (models['MobileRefreshToken'] as Model<MobileRefreshTokenDoc> | undefined) ??
  model<MobileRefreshTokenDoc>('MobileRefreshToken', mobileRefreshTokenSchema)
