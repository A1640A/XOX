import { cellCount } from '@xox/game-core'
import type { BoardConfig } from '@xox/game-core'
import type { Cell } from '@xox/shared'
import type { UpdateQuery } from 'mongoose'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'

export interface CasWriteInput {
  code: string
  /** Yazma yalnız oda hâlâ bu sürümdeyse uygulanır — kaybedilen yarış `null` döner. */
  expectedVersion: number
  /** Ek koşullar (ör. `state: 'playing'`, `presence.X.connId`) — `code`/`version` ile birleşir. */
  extraFilter?: Record<string, unknown>
  /**
   * Serbest `$set` alanları. `'board'` ANAHTARI YASAKTIR (çalışma zamanı guard
   * + test) — tahtaya yazan tek yol aşağıdaki tipli `board` kanalıdır
   * (ADR-0014 §3). Bu, `board.length === size²` değişmezinin dayatıldığı TEK
   * noktadır: mongoose çapraz-alan doğrulaması `findOneAndUpdate`'te çalışmaz.
   */
  set?: Record<string, unknown>
  unset?: Record<string, unknown>
  push?: Record<string, unknown>
  /**
   * Tahta yazma kanalı (ADR-0014 §3). `cells.length !== cellCount(config)`
   * ise yazma HİÇ YAPILMADAN reddedilir (`null` döner) — tıpkı kaybedilen bir
   * `version` yarışı gibi, çağıran bunu ilgili hata koduna çevirir.
   */
  board?: { cells: readonly Cell[]; config: BoardConfig }
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
  if (input.set !== undefined && Object.hasOwn(input.set, 'board')) {
    // Kod incelemesi/lint bunu yakalayamaz (kural 2'nin aynısı) — bu yüzden
    // ÇALIŞMA ZAMANI guard'ı: `set.board` bir programcı hatasıdır, kullanıcı
    // girdisinden gelmez, bu yüzden sessizce reddetmek yerine FIRLATIR.
    throw new Error(
      "casUpdateRoom: 'set.board' YASAK — tahta yalnız tipli `board` kanalından yazılır (ADR-0014 §3)",
    )
  }

  const filter: Record<string, unknown> = {
    code: input.code,
    version: input.expectedVersion,
    ...input.extraFilter,
  }

  const set: Record<string, unknown> = input.set !== undefined ? { ...input.set } : {}
  if (input.board !== undefined) {
    const expected = cellCount(input.board.config)
    if (input.board.cells.length !== expected) {
      // Değişmez ihlali: yazma HİÇ YAPILMADAN reddedilir (KK-B35 sondası).
      return null
    }
    set['board'] = [...input.board.cells]
  }

  const update: Record<string, unknown> = { $inc: { version: 1 } }
  if (Object.keys(set).length > 0) update['$set'] = set
  if (input.unset !== undefined) update['$unset'] = input.unset
  if (input.push !== undefined) update['$push'] = input.push

  return Room.findOneAndUpdate(filter, update as UpdateQuery<RoomDoc>, {
    returnDocument: 'after',
  }).lean()
}
