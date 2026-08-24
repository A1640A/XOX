import { cellAt, nextPlayer } from './board'
import type { Board, GameStatus, WinLine } from './types'

/**
 * Sekiz kazanma hattı. Hem dizi hem de içindeki üçlüler dondurulur: `readonly`
 * yalnız derleme zamanında korur, oysa tek bir `WIN_LINES[0][0] = 5` yazması
 * süreç boyunca bütün kazanma tespitini bozardı. `evaluateStatus` bulduğu hattı
 * kopyalamadan döndürdüğü için iç üçlülerin de donmuş olması şarttır.
 */
export const WIN_LINES: readonly WinLine[] = Object.freeze([
  Object.freeze<WinLine>([0, 1, 2]),
  Object.freeze<WinLine>([3, 4, 5]),
  Object.freeze<WinLine>([6, 7, 8]),
  Object.freeze<WinLine>([0, 3, 6]),
  Object.freeze<WinLine>([1, 4, 7]),
  Object.freeze<WinLine>([2, 5, 8]),
  Object.freeze<WinLine>([0, 4, 8]),
  Object.freeze<WinLine>([2, 4, 6]),
])

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
