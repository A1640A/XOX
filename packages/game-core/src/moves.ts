import { BOARD_SIZE, boardFromCells, cellAt } from './board'
import { InvalidMoveError } from './errors'
import type { Board, Cell, Player } from './types'

/**
 * Hamle katmanı. Tahta verisi `board.ts`'te, türetilmiş oyun durumu
 * `status.ts`'te yaşar; hamle doğrulaması ikisinin üstüne kurulur. Katmanlar
 * tek yönlüdür: board -> status -> moves -> ai.
 */

export function isValidMove(board: Board, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return false
  return cellAt(board, index) === null
}

export function applyMove(board: Board, index: number, player: Player): Board {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) {
    throw new InvalidMoveError(index, 'out-of-range')
  }
  if (cellAt(board, index) !== null) {
    throw new InvalidMoveError(index, 'occupied')
  }
  const next: Cell[] = [...board]
  next[index] = player
  return boardFromCells(next)
}
