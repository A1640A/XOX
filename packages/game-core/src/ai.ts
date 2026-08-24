import { availableMoves } from './board'
import { applyMove } from './moves'
import { InvalidMoveError } from './errors'
import { evaluateStatus } from './status'
import type { Board, Difficulty, Player } from './types'

const WIN_SCORE = 10

function opponentOf(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

/**
 * Çağıranlar listenin boş olmadığını önceden doğrular; bu yüzden burada
 * test edilemeyecek savunmacı bir dal açmak yerine tek daraltma yapılır.
 *
 * Kural çakışması: `non-nullable-type-assertion-style` burada `!` ister,
 * `no-non-null-assertion` ise `!` kullanımını yasaklar. İkisi aynı anda
 * sağlanamadığı için stil kuralı tek satırda susturulur.
 */
function pickRandom(moves: readonly number[], rng: () => number): number {
  const index = Math.min(Math.floor(rng() * moves.length), moves.length - 1)
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- `!` yasak
  return moves[index] as number
}

/**
 * Derinlik cezalı minimax: erken kazanç geç kazançtan, geç kayıp erken
 * kayıptan iyidir. Böylece AI kazanmayı geciktirmez ve kaybı geciktirir.
 */
function minimax(board: Board, current: Player, maximizing: Player, depth: number): number {
  const status = evaluateStatus(board)
  if (status.kind === 'won') {
    return status.winner === maximizing ? WIN_SCORE - depth : depth - WIN_SCORE
  }
  if (status.kind === 'draw') return 0

  const scores = availableMoves(board).map((move) =>
    minimax(applyMove(board, move, current), opponentOf(current), maximizing, depth + 1),
  )

  return current === maximizing ? Math.max(...scores) : Math.min(...scores)
}

export function bestMove(board: Board, player: Player): number {
  const moves = availableMoves(board)
  const [first, ...rest] = moves
  if (first === undefined) throw new InvalidMoveError(-1, 'game-over')

  let chosen = first
  let chosenScore = minimax(applyMove(board, first, player), opponentOf(player), player, 1)

  for (const move of rest) {
    const score = minimax(applyMove(board, move, player), opponentOf(player), player, 1)
    if (score > chosenScore) {
      chosenScore = score
      chosen = move
    }
  }

  return chosen
}

export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number {
  const moves = availableMoves(board)
  if (moves.length === 0) throw new InvalidMoveError(-1, 'game-over')

  switch (difficulty) {
    case 'easy':
      return pickRandom(moves, rng)
    case 'medium':
      return rng() < 0.5 ? bestMove(board, player) : pickRandom(moves, rng)
    case 'unbeatable':
      return bestMove(board, player)
  }
}
