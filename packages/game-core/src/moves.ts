import { boardFromCells, cellAt } from './board'
import { DEFAULT_BOARD_CONFIG, cellCount } from './config'
import type { BoardConfig } from './config'
import { InvalidMoveError } from './errors'
import { evaluateStatus } from './status'
import type { Board, Cell, Player } from './types'

/**
 * Hamle katmanı. Hamle doğrulaması `evaluateStatus`'a, `status.ts` ise
 * `board.ts`'e ihtiyaç duyduğu için doğrulama `board.ts` içinde kalsaydı
 * board -> status -> board döngüsü oluşurdu. Katmanlar tek yönlü tutulur:
 * config -> board -> status -> moves -> ai.
 */

/** Aralık artık `cellCount(config)`'e göredir: {3,3}'te 9, {11,5}'te 121 hücre. */
function isInRange(index: number, config: BoardConfig): boolean {
  return Number.isInteger(index) && index >= 0 && index < cellCount(config)
}

function isPlayable(board: Board, config: BoardConfig): boolean {
  return evaluateStatus(board, config).kind === 'playing'
}

/** Hamlenin kurallara uygunluğu: indeks aralığı, oyunun sürüyor olması, hücrenin boşluğu. */
export function isValidMove(
  board: Board,
  index: number,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): boolean {
  if (!isInRange(index, config)) return false
  if (!isPlayable(board, config)) return false
  return cellAt(board, index) === null
}

/**
 * Hamleyi uygular ve yeni tahtayı döner; girdiyi değiştirmez.
 *
 * Reddetme sırası niyetlidir: aralık dışı indeks argümanın kendi hatasıdır,
 * biten oyun ise tahtanın durumu hakkındadır ve dolu hücreden önce gelir —
 * bitmiş bir oyunda hiçbir hücreye oynanamaz, hücrenin boş olması bunu
 * değiştirmez.
 *
 * Sıra sahipliği bilerek doğrulanmaz; gerekçesi için `index.ts`'e bakın.
 */
export function applyMove(
  board: Board,
  index: number,
  player: Player,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): Board {
  if (!isInRange(index, config)) {
    throw new InvalidMoveError(index, 'out-of-range')
  }
  if (!isPlayable(board, config)) {
    throw new InvalidMoveError(index, 'game-over')
  }
  if (cellAt(board, index) !== null) {
    throw new InvalidMoveError(index, 'occupied')
  }
  return placeStone(board, index, player, config)
}

/**
 * Doğrulanmış hamleyi tahtaya işler. Pakete özeldir (`index.ts` dışa aktarmaz):
 * dışarıdan gelen her hamle `applyMove`'dan geçmelidir.
 *
 * Arama ağacı (minimax) hamlelerini `availableMoves`'tan üretir ve yalnız
 * `playing` durumundaki tahtalarda ilerler, yani üç doğrulamanın üçünü de
 * kurulum gereği sağlar. Aramanın her düğümde yeniden doğrulaması hamle başına
 * fazladan bir `evaluateStatus` demek olurdu: ölçümde boş tahtadaki en iyi hamle
 * 515 ms yerine 1006 ms sürüyordu.
 */
export function placeStone(
  board: Board,
  index: number,
  player: Player,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): Board {
  const next: Cell[] = [...board]
  next[index] = player
  return boardFromCells(next, config)
}
