import { BOARD_SIZE, boardFromCells, cellAt } from './board'
import { InvalidMoveError } from './errors'
import { evaluateStatus } from './status'
import type { Board, Cell, Player } from './types'

/**
 * Hamle katmanı. Hamle doğrulaması `evaluateStatus`'a, `status.ts` ise
 * `board.ts`'e ihtiyaç duyduğu için doğrulama `board.ts` içinde kalsaydı
 * board -> status -> board döngüsü oluşurdu. Katmanlar tek yönlü tutulur:
 * board -> status -> moves -> ai.
 */

function isInRange(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

function isPlayable(board: Board): boolean {
  return evaluateStatus(board).kind === 'playing'
}

/** Hamlenin kurallara uygunluğu: indeks aralığı, oyunun sürüyor olması, hücrenin boşluğu. */
export function isValidMove(board: Board, index: number): boolean {
  if (!isInRange(index)) return false
  if (!isPlayable(board)) return false
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
export function applyMove(board: Board, index: number, player: Player): Board {
  if (!isInRange(index)) {
    throw new InvalidMoveError(index, 'out-of-range')
  }
  if (!isPlayable(board)) {
    throw new InvalidMoveError(index, 'game-over')
  }
  if (cellAt(board, index) !== null) {
    throw new InvalidMoveError(index, 'occupied')
  }
  return placeStone(board, index, player)
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
export function placeStone(board: Board, index: number, player: Player): Board {
  const next: Cell[] = [...board]
  next[index] = player
  return boardFromCells(next)
}
