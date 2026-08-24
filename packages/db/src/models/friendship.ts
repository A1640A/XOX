import { Schema, model, models, type Model } from 'mongoose'

export type FriendshipStatus = 'pending' | 'accepted'

export interface FriendshipDoc {
  /** Sıralı çift — `userA` her zaman `userB`'den küçüktür (tasarım §3.5). */
  userA: string
  userB: string
  status: FriendshipStatus
  requestedBy: string
  createdAt: Date
  updatedAt: Date
}

const friendshipSchema = new Schema<FriendshipDoc>(
  {
    userA: { type: String, required: true },
    userB: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    requestedBy: { type: String, required: true },
  },
  { timestamps: true, collection: 'friendships' },
)

// Sıralı anahtar değişmezi: KK-125…127'nin `$or`sız tekil sorgulanabilmesi buna dayanır.
friendshipSchema.pre('validate', function preValidate(): void {
  if (this.userA >= this.userB) {
    throw new Error('userA, userB-den küçük olmalıdır (sıralı çift değişmezi)')
  }
})

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true })
friendshipSchema.index({ userB: 1, status: 1 })

export const Friendship: Model<FriendshipDoc> =
  (models['Friendship'] as Model<FriendshipDoc> | undefined) ??
  model<FriendshipDoc>('Friendship', friendshipSchema)
