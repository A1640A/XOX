import { cellAt, nextPlayer } from './board'
import type { Board, GameStatus, WinLine } from './types'

export const WIN_LINES: readonly WinLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function evaluateStatus(board: Board): GameStatus {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const first = cellAt(board, a)
    if (first !== null && first === cellAt(board, b) && first === cellAt(board, c)) {
      return { kind: 'won', winner: first, line }
    }
  }

  for (const cell of board) {
    if (cell === null) return { kind: 'playing', turn: nextPlayer(board) }
  }

  return { kind: 'draw' }
}
