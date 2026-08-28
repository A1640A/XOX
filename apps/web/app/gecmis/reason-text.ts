import type { EndReason, MatchResult } from '@xox/shared'
import { tr } from '@/messages/tr'

/**
 * KK-116 "bitiş sebebi" metni. `history` metin grubu (`message-keys.ts`, TXT-001
 * ile DONMUŞ) yalnız 10 anahtar taşır — bir "sebep" cümlesi için özel bir
 * anahtar YOK. Bu yüzden YENİ anahtar İCAT ETMEK yerine `tr.game.*`'in zaten
 * var olan, "kazandın/kaybettin" perspektifli hazır cümleleri kullanılır —
 * `components/room/status-text.ts`'in `statusText`'iyle AYNI ilke (o dosya bu
 * kartın çakışma kümesi DIŞINDA olduğu için buraya kopyalanmadı, bağımsız bir
 * eşdeğeri yazıldı).
 *
 * `abandon` + kayıp: terk eden taraf zaten uzaklaşmıştır; kaybeden için ayrı
 * bir metin tanımlanmamış (spec §5) — `statusText`teki AYNI gerekçeyle genel
 * kaybetme metnine düşülür.
 *
 * `endReason === null` YALNIZ beraberlikte olur (`packages/db/src/rooms/
 * finish.ts`, `toRoomResult`/`finishGame`) — `result==='draw'` ile birebir eşleşir.
 */
export function matchReasonText(result: MatchResult, endReason: EndReason | null): string {
  if (result === 'draw' || endReason === null) return tr.game.draw

  const won = result === 'win'
  switch (endReason) {
    case 'line':
      return won ? tr.game.youWon : tr.game.youLost
    case 'resign':
      return won ? tr.game.wonByResign : tr.game.lostByResign
    case 'timeout':
      return won ? tr.game.wonByTimeout : tr.game.lostByTimeout
    case 'abandon':
      return won ? tr.game.wonByAbandon : tr.game.youLost
  }
}
