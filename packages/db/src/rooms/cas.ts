import type { UpdateQuery } from 'mongoose'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'

export interface CasWriteInput {
  code: string
  /** Yazma yalnız oda hâlâ bu sürümdeyse uygulanır — kaybedilen yarış `null` döner. */
  expectedVersion: number
  /** Ek koşullar (ör. `state: 'playing'`, `presence.X.connId`) — `code`/`version` ile birleşir. */
  extraFilter?: Record<string, unknown>
  set?: Record<string, unknown>
  unset?: Record<string, unknown>
  push?: Record<string, unknown>
}

/**
 * `rooms/` altındaki durum değiştiren HER yazmanın TEK geçtiği yol (tasarım
 * §5.5, "version disiplini — dört kural"):
 *
 * 1. Her yazma `$inc: { version: 1 }` içerir — istisnası yalnız `pushEmoji`
 *    (o fonksiyon bilerek BU yardımcıyı kullanmaz, bkz. `emoji.ts`).
 * 2. Yazma her zaman `{ code, version: beklenen }` koşuluyla yapılır.
 *    Koşulsuz `updateOne`/`findOneAndUpdate` `rooms/` içinde YASAKTIR — bu
 *    kural lint edilemez, kod incelemesi maddesidir ve tek geçiş noktası
 *    burasıdır.
 * 3. `version` asla sıfırlanmaz (bu yardımcı yalnız artırır, hiçbir çağıran
 *    `$set: { version: ... }` yazamaz — `set` girdisi `version` alanını
 *    KABUL ETMEZ, tip düzeyinde değil ama sözleşme olarak: çağıranlar bunu
 *    hiç denemez).
 * 4. `version` asla atlamaz: tek bir çağrı yalnız 1 artırır.
 *
 * Kaybedilen yarış (`updated === null`) istisna DEĞİLDİR — çağıran katman
 * bunu ilgili `ErrorCode`/`MoveRejectionReason`'a çevirir (KK-042/044/045).
 */
export async function casUpdateRoom(input: CasWriteInput): Promise<RoomDoc | null> {
  const filter: Record<string, unknown> = {
    code: input.code,
    version: input.expectedVersion,
    ...input.extraFilter,
  }
  const update: Record<string, unknown> = { $inc: { version: 1 } }
  if (input.set !== undefined) update['$set'] = input.set
  if (input.unset !== undefined) update['$unset'] = input.unset
  if (input.push !== undefined) update['$push'] = input.push

  return Room.findOneAndUpdate(filter, update as UpdateQuery<RoomDoc>, {
    returnDocument: 'after',
  }).lean()
}
