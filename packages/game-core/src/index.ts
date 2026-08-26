/**
 * @xox/game-core — saf kural motoru: G/Ç yok, çerçeve yok, bağımlılık yok.
 *
 * `applyMove` / `isValidMove` şu üç kuralı uygular (reddetme sırasıyla):
 * 1. indeks 0..cellCount(config)-1 aralığında tam sayı olmalı -> 'out-of-range'
 * 2. oyun sürüyor olmalı                                      -> 'game-over'
 * 3. hücre boş olmalı                                         -> 'occupied'
 *
 * KONFİGÜRASYON her imzada SON ve OPSİYONEL parametredir
 * (`config = DEFAULT_BOARD_CONFIG`): 3×3 davranışı bit düzeyinde korunur ve
 * konfigürasyonu bilmeyen çağıran hiç değişmez (ADR-0011).
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
 *
 * `cellAt` ve `placeStone` BİLEREK dışa aktarılmaz: `game-core` dışında
 * `Board`'u indeksleyen tek bir üretim satırı yok (ADR-0011 D1) ve dışarıdan
 * gelen her hamle `applyMove`'dan geçmelidir. Bu yüzey `index.test.ts`'te elle
 * yazılmış bir listeyle DONDURULMUŞTUR — sessizce büyüyemez ya da küçülemez.
 */
export {
  BOARD_MODES,
  DEFAULT_BOARD_CONFIG,
  cellCount,
  colOf,
  parseBoardConfig,
  rowOf,
} from './config'
export type { BoardConfig, BoardConfigParse, BoardConfigRejection, BoardMode } from './config'
export { availableMoves, boardFromCells, boardToString, emptyBoard, nextPlayer } from './board'
export { applyMove, isValidMove } from './moves'
export { evaluateStatus, winLines, wouldWin } from './status'
export { bestMove, chooseMove } from './ai'
export { AI_BUDGET_MS, CANDIDATE_RADIUS, MAX_SEARCH_DEPTH } from './ai-config'
export { InvalidMoveError } from './errors'
export type { InvalidMoveReason } from './errors'
export type { Board, Cell, Difficulty, GameStatus, Player, WinLine } from './types'
