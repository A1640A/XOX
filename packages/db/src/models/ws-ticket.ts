import type { Model } from 'mongoose'
import mongoose from 'mongoose'

// mongoose CommonJS: tsx-in ESM yukleyicisi named export-lari goremez
// (`does not provide an export named 'models'`). Vitest calisir cunku Vite
// CJS interop-u farkli yapar — yani birim testler bu kirikligi GIZLER.
const { Schema, model, models } = mongoose

/**
 * SEC-003: WS bileti tek kullanımlıktır. JWT'nin kendisi durumsuzdur (imza +
 * `exp` dışında hiçbir şey hatırlamaz) — tek kullanımlık garantisi doğası
 * gereği DIŞARIDA bir kayıt ister. Bu koleksiyon biletin yaşam döngüsünü
 * (üretildi → tüketildi/tüketilmedi) tutar; tüketim `usedAt: null` KOŞULLU
 * `findOneAndUpdate` ile ATOMİK yapılır (bkz. `../tickets.ts`).
 */
export interface WsTicketDoc {
  /** JWT `jti` claim'i — birincil tüketim anahtarı, benzersiz. */
  jti: string
  userId: string
  /** Bilet BAĞLI olduğu oda (yatay yetki kapsamı, ADR-0006). */
  room: string
  expiresAt: Date
  /** `null` = henüz tüketilmedi. Atomik tüketim bu alanın `null` koşuluna dayanır. */
  usedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const wsTicketSchema = new Schema<WsTicketDoc>(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    room: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'wsTickets' },
)

// TTL = 0: doküman `expiresAt` anında silinir, cron gerekmez (mobileRefreshTokens ile aynı kalıp).
wsTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// `userId` üzerinden toplu iptalin (signOut, `revokeWsTicketsForUser`) sorgu deseni.
wsTicketSchema.index({ userId: 1, usedAt: 1 })

export const WsTicket: Model<WsTicketDoc> =
  (models['WsTicket'] as Model<WsTicketDoc> | undefined) ??
  model<WsTicketDoc>('WsTicket', wsTicketSchema)
