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

/**
 * Dışarıdan gelen diziyi tahtaya çevirir; `Board`'a giden tek yol budur.
 *
 * Hem uzunluk hem de her hücrenin değeri doğrulanır: kalıcı katmandaki şema
 * hücreleri yalnız `String` olarak tanımlar, dolayısıyla `undefined` ya da
 * `'a'` gibi bir değer buraya kadar gelebilir. Doğrulanmazsa `evaluateStatus`
 * üç `undefined` hücreyi kazanan hat sanar ve `Player` tipli bir alana `'a'`
 * yazılır.
 */
export function boardFromCells(cells: readonly Cell[]): Board {
  if (cells.length !== BOARD_SIZE) {
    throw new RangeError(`Tahta ${String(BOARD_SIZE)} hücre olmalı, ${String(cells.length)} geldi`)
  }
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const cell = cells[index]
    if (cell !== null && cell !== 'X' && cell !== 'O') {
      throw new RangeError(
        `Tahta hücresi ${String(index)} geçersiz: ${String(cell)} — yalnız 'X', 'O' veya null olabilir`,
      )
    }
  }
  return cells as Board
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
