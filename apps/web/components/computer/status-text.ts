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
 * `tr.computer.thinking` (3×3) ya da `tr.computer.thinkingBig` (`size > 3`)
 * gösterilir: bu ekrana özgü, daha bilgilendirici bir metindir ve zaten
 * mesaj ağacında (`tr.computer.*`) tanımlıdır.
 *
 * UI-COMP-001: `size > 3`te `chooseMove` bütçeli aramaya (`searchMove`)
 * gider — 3×3'ün tam minimaksından farklı olarak duvar saati bütçesi
 * (`AI_BUDGET_MS`) kadar sürebilir, dolayısıyla ayrı ve daha açıklayıcı bir
 * metin dürüsttür (bkz. `DifficultyPicker`in aynı `size` ayrımı).
 */
export function statusText(status: GameStatus, size: number): string {
  if (status.kind === 'playing') {
    if (status.turn === HUMAN) return tr.game.yourTurn
    return size === 3 ? tr.computer.thinking : tr.computer.thinkingBig
  }
  if (status.kind === 'draw') return tr.game.draw
  return status.winner === HUMAN ? tr.game.youWon : tr.game.youLost
}
