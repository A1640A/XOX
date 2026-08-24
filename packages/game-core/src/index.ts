/**
 * @xox/game-core — saf kural motoru: G/Ç yok, çerçeve yok, bağımlılık yok.
 *
 * `applyMove` / `isValidMove` şu üç kuralı uygular (reddetme sırasıyla):
 * 1. indeks 0..8 aralığında tam sayı olmalı  -> 'out-of-range'
 * 2. oyun sürüyor olmalı                     -> 'game-over'
 * 3. hücre boş olmalı                        -> 'occupied'
 *
 * SIRA SAHİPLİĞİ BİLEREK DOĞRULANMAZ. `applyMove(board, i, 'X')` üst üste
 * çağrılırsa X arka arkaya oynayabilir. Gerekçe: motorun sıra paritesini
 * dayatması sunucuyu güvende tutmaya yetmez — asıl soru "sıra X'te mi?" değil,
 * "bu isteği gönderen *kullanıcı* X mi?"dir ve oyuncu kimliği game-core'un
 * göremediği bir bilgidir. Yarım bir kontrol, tam sanılma riski taşır.
 * Motor bunun yerine kararı vermek için gereken tek girdiyi dışa verir:
 * `nextPlayer(board)` (oyun sürerken `evaluateStatus(board).turn` ile aynıdır).
 *
 * Çevrimiçi oyunu yöneten katman her hamlede şunu doğrulamalıdır:
 *   nextPlayer(board) === istegiGonderenOyuncununTasi
 */
export {
  BOARD_SIZE,
  EMPTY_BOARD,
  availableMoves,
  boardFromCells,
  cellAt,
  nextPlayer,
} from './board'
export { applyMove, isValidMove } from './moves'
export { WIN_LINES, evaluateStatus } from './status'
export { bestMove, chooseMove } from './ai'
export { InvalidMoveError } from './errors'
export type { InvalidMoveReason } from './errors'
export type { Board, Cell, Difficulty, GameStatus, Player, WinLine } from './types'
