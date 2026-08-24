import { availableMoves } from './board'
import { InvalidMoveError } from './errors'
import { placeStone } from './moves'
import { evaluateStatus } from './status'
import type { Board, Difficulty, Player } from './types'

/**
 * DEĞİŞMEZ: WIN_SCORE > BOARD_SIZE (yani > 9, `board.ts`).
 *
 * Minimax kazancı `WIN_SCORE - depth`, kaybı `depth - WIN_SCORE` diye puanlar;
 * derinlik en fazla BOARD_SIZE (dokuz yarım hamle) olur. WIN_SCORE bu sınıra
 * eşit ya da altında kalsaydı geç bir kazanç 0'a (beraberlik) düşer, altına
 * inince de işaret değiştirip kayıp gibi görünürdü. Şu anki pay tam olarak 1.
 *
 * Sabit bilerek `BOARD_SIZE + 1` diye türetilmedi: 9040 ulaşılabilir
 * (konum × oyuncu) çiftinde WIN_SCORE=8 ile WIN_SCORE=10 aynı hamleyi seçiyor,
 * yani türetmenin doğuracağı `BOARD_SIZE - 1` mutantı hiçbir testle
 * öldürülemeyen eşdeğer bir mutant olurdu. Değişmez bu yüzden burada yazıyla
 * korunuyor; ihlali `ai.test.ts`'teki tümevarımsal yenilmezlik kanıtı
 * yakalar (örneğin WIN_SCORE=5 ile AI 48 farklı oyunu kaybeder).
 */
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
  const raw = Math.floor(rng() * moves.length)
  // rng dışarıdan enjekte edilebilir (tohumlu üreteç, sahte üreteç): sözleşmeye
  // uymayan bir değer indeksi listenin dışına taşımasın diye iki uç da
  // kelepçelenir. NaN her karşılaştırmada false döndüğü için ayrıca ele alınır.
  const index = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), moves.length - 1)
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
    // Zorluk tip sisteminin dışından (istek gövdesi, veritabanı) gelebilir;
    // sessizce `undefined` döndürmek yerine yüksek sesle reddedilir.
    default:
      throw new RangeError(`Bilinmeyen zorluk: ${String(difficulty)}`)
  }
}
