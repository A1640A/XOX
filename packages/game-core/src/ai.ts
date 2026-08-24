import { availableMoves } from './board'
import { InvalidMoveError } from './errors'
import { placeStone } from './moves'
import { evaluateStatus } from './status'
import type { Board, Difficulty, Player } from './types'

const WIN_SCORE = 10

/** Kökten oynanan hamlenin derinliği — tek yerde yazılır, bkz. `bestMove`. */
const ROOT_DEPTH = 1

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
    minimax(placeStone(board, move, current), opponentOf(current), maximizing, depth + 1),
  )

  return current === maximizing ? Math.max(...scores) : Math.min(...scores)
}

/** Oyun bitmişse hamle üretilemez; kalan tek doğru cevap hatadır. */
function assertPlayable(board: Board): void {
  if (evaluateStatus(board).kind !== 'playing') {
    throw new InvalidMoveError(-1, 'game-over')
  }
}

/**
 * Oyun teorisi anlamında en iyi hamle. `assertPlayable` sayesinde en az bir
 * hamle vardır, bu yüzden puanlama tek biçimli bir döngüdür: kök derinliği
 * tek bir yerde geçer ve "ilk hamleyi ayrı puanla" tohumlaması gerekmez.
 *
 * Eşit puanlı hamlelerde en küçük indeksli olan korunur (karşılaştırma kesin
 * `>`): seçim sunucu otoritesidir ve platformlar arası yeniden üretilebilir
 * olmalıdır.
 */
export function bestMove(board: Board, player: Player): number {
  assertPlayable(board)

  const scored = availableMoves(board).map((move) => ({
    move,
    score: minimax(placeStone(board, move, player), opponentOf(player), player, ROOT_DEPTH),
  }))

  return scored.reduce((best, candidate) => (candidate.score > best.score ? candidate : best)).move
}

export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number {
  assertPlayable(board)
  const moves = availableMoves(board)

  switch (difficulty) {
    case 'easy':
      return pickRandom(moves, rng)
    case 'medium':
      return rng() < 0.5 ? bestMove(board, player) : pickRandom(moves, rng)
    case 'unbeatable':
      return bestMove(board, player)
  }
}
