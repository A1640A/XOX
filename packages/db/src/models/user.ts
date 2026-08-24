import { DISPLAY_NAME_MAX, ELO_START, LEADERBOARD_MIN_RATED_GAMES } from '@xox/shared'
import { Schema, model, models, type Model } from 'mongoose'

export type Theme = 'acik' | 'koyu'

export interface UserDoc {
  /** randomUUID — Auth.js adapter'ın ObjectId'siyle çakışmaz (ADR-0009). */
  _id: string
  name: string
  email: string
  image?: string
  /** B6 — `{ select: false }`. `authorize()` bilerek `.select('+passwordHash')` yazar. */
  passwordHash: string
  stats: { wins: number; losses: number; draws: number }
  elo: number
  /** KK-115 eşiği için sayaç; sıralama indeksinin kısmi filtresi bunu kullanır. */
  ratedGames: number
  /** KK-083 — sunucuda saklanır, cihazlar arası tutarlı. */
  theme: Theme
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: DISPLAY_NAME_MAX },
    email: { type: String, required: true, lowercase: true, unique: true },
    image: { type: String },
    passwordHash: { type: String, required: true, select: false },
    stats: {
      wins: { type: Number, default: 0, min: 0 },
      losses: { type: Number, default: 0, min: 0 },
      draws: { type: Number, default: 0, min: 0 },
    },
    elo: { type: Number, default: ELO_START },
    ratedGames: { type: Number, default: 0, min: 0 },
    theme: { type: String, enum: ['acik', 'koyu'], default: 'acik' },
  },
  { timestamps: true, collection: 'users', _id: false },
)

// KK-117: sorgu yüklemi bu filtreyle birebir olduğu için planlayıcı IXSCAN seçer.
// Mongo kısmi indeks filtresi `$ne` desteklemez — `$gte` kullanılır (§3.6 / gotcha).
userSchema.index(
  { elo: -1 },
  { partialFilterExpression: { ratedGames: { $gte: LEADERBOARD_MIN_RATED_GAMES } } },
)

/**
 * `select: false` yalnız `find*` sorgu ara katmanını kapsar (KK-004). `aggregate()`
 * o katmanın dışındadır ve gerçek `xox_test`e karşı kanıtlandığı gibi
 * `passwordHash`i olduğu gibi döndürür — liderlik tablosu/profil gibi bir
 * `$lookup`/`aggregate` ucu bir gün eklenirse hash doğrudan JSON yanıtına
 * düşer, hiçbir mevcut test bunu yakalamaz. Varsayılan olarak her pipeline'ın
 * BAŞINA `$unset` eklenir; hash'e gerçekten ihtiyaç duyan bir kullanım
 * bugün yok — çıkarsa açıkça `.pipeline()`'ına kendi `$project`'ini ekler.
 */
userSchema.pre('aggregate', function preAggregate(): void {
  this.pipeline().unshift({ $unset: 'passwordHash' })
})

export const User: Model<UserDoc> =
  (models['User'] as Model<UserDoc> | undefined) ?? model<UserDoc>('User', userSchema)
