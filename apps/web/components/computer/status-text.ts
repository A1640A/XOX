import type { GameStatus } from '@xox/game-core'
import { tr } from '@/messages/tr'
import { HUMAN } from './game-engine'

/**
 * `durum-metni` içeriği. Kural kararı YOKTUR — yalnız `GameStatus`'u
 * (`@xox/game-core`) hazır Türkçe metne eşler; TXT-001 dondurulu ağaç
 * dışında string literal kullanılmaz.
 *
 * Oda ekranının aksine burada `reason` (pes etme/süre aşımı/terk) yoktur —
 * bilgisayara karşı oyunda kazanma/kaybetme her zaman hat tamamlanmasıyla
 * olur. Bilgisayarın sırasında oda ekranındaki genel "sıra rakipte" yerine
 * `tr.computer.thinking` gösterilir: bu ekrana özgü, daha bilgilendirici
 * bir metindir ve zaten mesaj ağacında (`tr.computer.*`) tanımlıdır.
 */
export function statusText(status: GameStatus): string {
  if (status.kind === 'playing') {
    return status.turn === HUMAN ? tr.game.yourTurn : tr.computer.thinking
  }
  if (status.kind === 'draw') return tr.game.draw
  return status.winner === HUMAN ? tr.game.youWon : tr.game.youLost
}
