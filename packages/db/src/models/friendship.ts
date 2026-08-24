import { Schema, model, models, type Model, type Query } from 'mongoose'

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

const SORT_ORDER_ERROR = 'userA, userB-den küçük olmalıdır (sıralı çift değişmezi)'

// Sıralı anahtar değişmezi: KK-125…127'nin `$or`sız tekil sorgulanabilmesi buna dayanır.
// `doc.save()`/`insertMany` yolu için (document middleware).
friendshipSchema.pre('validate', function preValidate(): void {
  if (this.userA >= this.userB) {
    throw new Error(SORT_ORDER_ERROR)
  }
})

/**
 * `pre('validate')` YALNIZ `save()`/`insertMany` yolunda çalışır — `updateOne`/
 * `findOneAndUpdate` (özellikle `upsert:true`) onu tamamen atlar (gerçek
 * `xox_test`e karşı kanıtlandı: reviewer ters sıralı bir çifti `updateOne`
 * ile sorunsuz yazdırdı). Değişmezi YAZMA YOLUNA değil VERİYE bağlamak için
 * ayrıca bir sorgu middleware'i gerekir: nihai `userA`/`userB` ya `$set`'ten
 * ya (upsert'te) sorgu filtresinden gelir — ikisi de kontrol edilir.
 */
function readOrderCandidate(
  query: Query<unknown, FriendshipDoc>,
  field: 'userA' | 'userB',
): string | undefined {
  // Bu hook yalnız updateOne/findOneAndUpdate/replaceOne'a bağlı — üçü de
  // çağrıya bir güncelleme/yerine koyma gövdesi VERMEK ZORUNDADIR, `getUpdate()`
  // tipin izin verdiği `null`ü pratikte asla döndürmez. `updateOne`/
  // `findOneAndUpdate` operatörlü ($set) günceller; `replaceOne` tüm dokümanı
  // operatörsüz verir — ikisi de burada tek yoldan geçer.
  const update = query.getUpdate() as Record<string, unknown>
  const setPart = ('$set' in update ? update['$set'] : update) as
    Record<string, unknown> | undefined
  const fromUpdate = setPart?.[field]
  if (typeof fromUpdate === 'string') return fromUpdate

  const filter = query.getFilter() as Record<string, unknown>
  const fromFilter = filter[field]
  return typeof fromFilter === 'string' ? fromFilter : undefined
}

friendshipSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'replaceOne'],
  function preUpdateValidate(this: Query<unknown, FriendshipDoc>): void {
    const userA = readOrderCandidate(this, 'userA')
    const userB = readOrderCandidate(this, 'userB')
    if (userA !== undefined && userB !== undefined && userA >= userB) {
      throw new Error(SORT_ORDER_ERROR)
    }
  },
)

friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true })
friendshipSchema.index({ userB: 1, status: 1 })

export const Friendship: Model<FriendshipDoc> =
  (models['Friendship'] as Model<FriendshipDoc> | undefined) ??
  model<FriendshipDoc>('Friendship', friendshipSchema)
