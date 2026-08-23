import { InvalidMoveError } from './errors'
import type { Board, Cell, Player } from './types'

export const BOARD_SIZE = 9

export const EMPTY_BOARD: Board = [null, null, null, null, null, null, null, null, null]

/**
 * Tahta indeksi her zaman 0..8 aralığındadır; bu değişmez `boardFromCells`,
 * `availableMoves` ve `WIN_LINES` tarafından garanti edilir. Bu yüzden burada
 * savunmacı bir dal yerine tek bir daraltma yapılır — böylece kural motorunda
 * test edilemeyen dal kalmaz.
 */
export function cellAt(board: Board, index: number): Cell {
  return board[index] as Cell
}

export function boardFromCells(cells: readonly Cell[]): Board {
  if (cells.length !== BOARD_SIZE) {
    throw new RangeError(`Tahta ${String(BOARD_SIZE)} hücre olmalı, ${String(cells.length)} geldi`)
  }
  return cells as Board
}

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

export function availableMoves(board: Board): number[] {
  const moves: number[] = []
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (cellAt(board, i) === null) moves.push(i)
  }
  return moves
}

export function nextPlayer(board: Board): Player {
  let placed = 0
  for (const cell of board) {
    if (cell !== null) placed += 1
  }
  return placed % 2 === 0 ? 'X' : 'O'
}
