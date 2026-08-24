import type { RoomDoc } from '@xox/db'
import { boardFromCells, nextPlayer } from '@xox/game-core'
import type { Player } from '@xox/shared'

/**
 * `dueSettlement`in gördüğü tek şey (tasarım §5.7). `RoomDoc`un tamamı değil
 * dört alanı isteniyor: fonksiyon SAF kalsın, testte sahte bir oda kurmak bir
 * satır olsun ve ileride odaya eklenen bir alan bu kararı sessizce
 * etkileyemesin.
 */
export type SettlementInput = Pick<RoomDoc, 'state' | 'turnDeadline' | 'disconnected' | 'board'>

export interface DueSettlement {
  reason: 'timeout' | 'abandon'
  loser: Player
}

/** Dolma anı `now`a EŞİTSE dolmuş sayılır — sınır deterministik olsun. */
function expiredAt(deadline: Date | null, now: number): number | null {
  if (deadline === null) return null
  const at = deadline.getTime()
  return at <= now ? at : null
}

/**
 * Süre aşımı / terk kararının SAF hâli (tasarım §5.7, ADR-0004). DB'ye
 * dokunmaz, zaman okumaz — `now` dışarıdan gelir. Yazmayı
 * `packages/db`'deki `settleDeadlines` yapar; bu fonksiyon yalnız NE
 * olması gerektiğini söyler.
 *
 * Kurallar:
 * - `state !== 'playing'` → `null` (biten oyun bir daha bitmez)
 * - `turnDeadline` dolmuş → sırası gelen oyuncu kaybeder (`timeout`)
 * - `disconnected.graceEndsAt` dolmuş → kopan oyuncu kaybeder (`abandon`)
 * - ikisi de dolmuşsa **önce dolan** kazanır; **eşitlikte `timeout`**
 *   (spec §3.7 — iki instance aynı anda baksa bile aynı sonuca varsın)
 *
 * P0'da `turnDeadline` daima `null` yazılır (AS-08) ve grace zamanlayıcısı
 * kurulmaz; fonksiyon bu yüzden P0'da hep `null` döner. Kurallar yine de
 * burada, çünkü W2-01 yalnız yazma yolunu açacak — karar mantığı değişmeyecek.
 */
export function dueSettlement(room: SettlementInput, now: number): DueSettlement | null {
  if (room.state !== 'playing') return null

  const timeoutAt = expiredAt(room.turnDeadline, now)
  const abandonAt = expiredAt(room.disconnected?.graceEndsAt ?? null, now)

  if (timeoutAt === null && abandonAt === null) return null

  const abandonWins = timeoutAt === null || (abandonAt !== null && abandonAt < timeoutAt)
  if (abandonWins) {
    // `abandonAt` null olamaz: ikisi birden null olsaydı yukarıda dönerdik ve
    // `timeoutAt === null` dalında abandon dolu demektir.
    const seat = room.disconnected?.seat
    if (seat === undefined) return null
    return { reason: 'abandon', loser: seat }
  }

  return { reason: 'timeout', loser: nextPlayer(boardFromCells(room.board)) }
}
