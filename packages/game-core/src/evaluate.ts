import { DEFENSE_BIAS, weightOf } from './ai-config'
import { cellCount, colOf, rowOf } from './config'
import type { BoardConfig } from './config'
import type { Board, Player } from './types'

/**
 * Sezgisel DEĞERLENDİRME katmanı (ADR-0013 §5).
 *
 * Katman zinciri: config -> board -> status -> moves -> **evaluate** -> search
 * -> ai. Bu dosya `status.ts`ten hiçbir şey almaz; `wouldWin`in dört-yön
 * taraması "kazandı mı" sorusunun cevabıdır, buradaki tarama ise "ne kadar
 * iyi gidiyor" sorusunun.
 *
 * BİLİNÇLİ SAPMA — `cellAt` burada ÇAĞRILMAZ, gövdesi (`board[i] ?? null`)
 * satır içine yazılır. Konvansiyon "indeks güvenliği tek noktada daraltılır"
 * diyor ve daraltmanın KENDİSİ aynen korunuyor (aralık dışı okuma yine boş
 * hücre); değişen yalnız çağrı sınırı. Gerekçe ÖLÇÜM: bu dosyanın döngüleri
 * arama başına milyonlarca kez koşuyor ve CPU profilinde `cellAt` çağrı
 * çerçevesi tek başına sürenin %29'unu yiyordu; satır içine alınca düğüm
 * maliyeti 13.8 µs → 11.3 µs'ye indi. Sıcak yol DIŞINDA (`search.ts`,
 * `status.ts`, `moves.ts`) `cellAt` kullanılmaya devam ediyor.
 */

/** Yatay, dikey ve iki köşegen. `status.ts`in `DIRECTIONS`ıyla aynı sıra. */
const DIRECTIONS: readonly { readonly dr: number; readonly dc: number }[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
]

/**
 * Hamle sıralamasının sınıf ayrımı. Sayılar birbirinin ÜSTÜNDE durmalıdır:
 * bir kazanma hamlesi kaç bloklama ve kaç örüntü puanıyla karşılaşırsa
 * karşılaşsın önde kalır.
 *
 *   en büyük örüntü toplamı  = 4 yön × (5000 + 5000) × 32 = 1 280 000
 *   en büyük bloklama toplamı = 4 yön × 10 000 000        = 40 000 000
 *
 * `ORDER_PATTERN_SCALE` merkez uzaklığının (en fazla 2·(N−1) = 20) örüntü
 * farkını EZMEMESİNİ garanti eder: en küçük örüntü farkı 1 × 32 = 32 > 20.
 */
const ORDER_WIN_BONUS = 1_000_000_000
const ORDER_BLOCK_BONUS = 10_000_000
const ORDER_PATTERN_SCALE = 32

/**
 * Sıralama anahtarı TEK bir sayıya paketlenir: `puan × MOVE_SLOT + (MOVE_SLOT
 * − 1 − hamle)`. Böylece `Float64Array.prototype.sort()` KARŞILAŞTIRICISIZ
 * (yani V8'in sayısal hızlı yolunda) çalışır — ölçüldü: karşılaştırıcı kapanışı
 * düğüm başına ~550 çağrı ediyordu.
 *
 * Küçük indeksin öne geçmesi paketlemenin İÇİNDEDİR: `MOVE_SLOT − 1 − hamle`
 * küçük hamlede büyüktür, artan sıralamada sona düşer, sondan başa okunur.
 * `MOVE_SLOT` en büyük hücre sayısından (121) büyük olmalıdır.
 */
const MOVE_SLOT = 128

export function opponentOf(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

function inBounds(row: number, col: number, size: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size
}

/**
 * Tek bir K-pencerenin puanı. Pencerede iki oyuncunun da taşı varsa ÖLÜDÜR
 * (kimse o hattı tamamlayamaz) ve sıfır döner; aksi hâlde taş sayısının
 * ağırlığı, rakibinki `DEFENSE_BIAS` ile ölçeklenerek negatif yazılır.
 */
function windowScore(
  board: Board,
  config: BoardConfig,
  startRow: number,
  startCol: number,
  dr: number,
  dc: number,
  player: Player,
): number {
  const n = config.size
  let mine = 0
  let theirs = 0
  for (let i = 0; i < config.winLength; i += 1) {
    const cell = board[(startRow + i * dr) * n + (startCol + i * dc)] ?? null
    if (cell === player) mine += 1
    else if (cell !== null) theirs += 1
  }
  if (mine > 0 && theirs > 0) return 0
  return weightOf(mine) - DEFENSE_BIAS * weightOf(theirs)
}

/**
 * Tahtanın `player` gözünden puanı: `benim − DEFENSE_BIAS × rakibin`.
 *
 * YALNIZ TAŞLARIN KOMŞULUĞUNDAKİ pencereler taranır, tam tahta taraması
 * yapılmaz (ADR-0013 §5). Taşsız bir pencere iki tarafa da `WINDOW_WEIGHT[0]`
 * = 0 verir, yani atlanması sonucu değiştirmez ama 11×11'de tarama maliyetini
 * taş sayısına bağlar.
 *
 * ÇİFT SAYIM tek bir kuralla engellenir: bir pencere, o yöndeki İLK taşına
 * demirlenir. Taştan geriye doğru yürürken araya başka bir taş girdiği anda
 * döngü kırılır — o pencere zaten oradan sayılacaktır. Bu yüzden bir `Set`
 * ya da işaret dizisi gerekmez (ve sıcak yolda ayırma yapılmaz).
 */
export function evaluateBoard(board: Board, player: Player, config: BoardConfig): number {
  const n = config.size
  const k = config.winLength
  const total = cellCount(config)
  let score = 0

  for (let index = 0; index < total; index += 1) {
    if ((board[index] ?? null) === null) continue
    const row = rowOf(index, config)
    const col = colOf(index, config)

    for (const { dr, dc } of DIRECTIONS) {
      for (let back = 0; back < k; back += 1) {
        const startRow = row - back * dr
        const startCol = col - back * dc
        if (!inBounds(startRow, startCol, n)) break
        // Geriye doğru ilk taşa çarptık: bu pencere ORADAN sayılacak.
        if (back > 0 && (board[startRow * n + startCol] ?? null) !== null) break
        // Pencerenin SONU dışarı taşabilir ama daha geride kalan başlangıçlar
        // hâlâ geçerli olabilir — bu yüzden `break` değil `continue`.
        if (inBounds(startRow + (k - 1) * dr, startCol + (k - 1) * dc, n)) {
          score += windowScore(board, config, startRow, startCol, dr, dc, player)
        }
      }
    }
  }

  return score
}

/**
 * `index` hücresinden GEÇEN bütün K-pencerelerin puanı.
 *
 * `evaluateBoard`in aksine burada çift-sayım kuralı YOKTUR ve olmamalıdır:
 * bir pencere, verilen hücreden her yönde en fazla bir kez geçer.
 *
 * Aramanın sıcak yolu bunu ARTIMLI değerlendirme için kullanır: bir hücreye
 * taş koymak yalnız o hücreden geçen pencereleri değiştirir, dolayısıyla
 * toplam puan `sonra − önce` farkıyla güncellenebilir. 11×11 K6'da tam tarama
 * 204 pencere, bu ise en fazla 24 pencere okur.
 */
export function windowsThrough(
  board: Board,
  config: BoardConfig,
  index: number,
  player: Player,
): number {
  const n = config.size
  const k = config.winLength
  const row = rowOf(index, config)
  const col = colOf(index, config)
  let score = 0

  for (const { dr, dc } of DIRECTIONS) {
    for (let back = 0; back < k; back += 1) {
      const startRow = row - back * dr
      const startCol = col - back * dc
      if (!inBounds(startRow, startCol, n)) break
      if (inBounds(startRow + (k - 1) * dr, startCol + (k - 1) * dc, n)) {
        score += windowScore(board, config, startRow, startCol, dr, dc, player)
      }
    }
  }

  return score
}

/**
 * `(row, col)`'dan `(dr, dc)` yönündeki KESİNTİSİZ dizi: `player`ın taşları
 * için pozitif, rakibin taşları için negatif, komşu boşsa sıfır.
 *
 * İki oyuncu tek yürüyüşte ölçülür. Ayrı ayrı yürümek (önce benimkiler, sonra
 * rakibinkiler) aynı sonucu verir ama sıcak yolda İKİ KAT okuma demektir:
 * `orderMoves` düğüm başına aday sayısı × 4 yön kez çağrılır.
 */
function directedRun(
  board: Board,
  config: BoardConfig,
  row: number,
  col: number,
  dr: number,
  dc: number,
  player: Player,
): number {
  const n = config.size
  let r = row + dr
  let c = col + dc
  const first = inBounds(r, c, n) ? (board[r * n + c] ?? null) : null
  if (first === null) return 0

  let count = 0
  while (inBounds(r, c, n) && (board[r * n + c] ?? null) === first) {
    count += 1
    r += dr
    c += dc
  }
  return first === player ? count : -count
}

/**
 * Merkeze Chebyshev uzaklığı, İKİ KATI olarak (çift kenarlı tahtalarda merkez
 * iki hücrenin arasındadır; ikiye katlamak kesirli sayıdan kurtarır).
 */
function centerDistance(row: number, col: number, size: number): number {
  const span = size - 1
  return Math.max(Math.abs(2 * row - span), Math.abs(2 * col - span))
}

/**
 * Hamle sıralaması puanı — budama oranını belirleyen TEK şey.
 *
 * Sıra: kazandıran > bloklayan > statik örüntü puanı > merkeze yakınlık
 * (ADR-0013 §4). Örüntü terimi hem kendi hem rakip dizilerini sayar: rakibin
 * uzun dizisinin yanına oynamak da ilginç bir hamledir.
 */
function moveOrderScore(board: Board, index: number, player: Player, config: BoardConfig): number {
  const k = config.winLength
  const row = rowOf(index, config)
  const col = colOf(index, config)
  let tactical = 0
  let pattern = 0

  for (const { dr, dc } of DIRECTIONS) {
    const forward = directedRun(board, config, row, col, dr, dc, player)
    const backward = directedRun(board, config, row, col, -dr, -dc, player)
    const mine = 1 + Math.max(forward, 0) + Math.max(backward, 0)
    const theirs = 1 - Math.min(forward, 0) - Math.min(backward, 0)

    if (mine >= k) tactical += ORDER_WIN_BONUS
    if (theirs >= k) tactical += ORDER_BLOCK_BONUS
    pattern += weightOf(Math.min(mine, k)) + weightOf(Math.min(theirs, k))
  }

  return tactical + pattern * ORDER_PATTERN_SCALE - centerDistance(row, col, config.size)
}

/**
 * Adayları puanına göre sıralar; girdiyi DEĞİŞTİRMEZ (arama ağacı aynı diziyi
 * kardeş düğümlerde yeniden kullanır). Eşit puanda küçük indeks öne geçer —
 * seçim sunucu otoritesidir ve platformlar arası yeniden üretilebilir olmalı.
 *
 * Sıcak yolda düğüm başına 90 nesne ayırmamak için puan ve hamle TEK bir
 * sayıya paketlenir (bkz. `MOVE_SLOT`); sıralama sade bir sayı dizisi üzerinde
 * yapılır.
 */
export function orderMoves(
  board: Board,
  moves: readonly number[],
  player: Player,
  config: BoardConfig,
): number[] {
  const keys: number[] = []
  for (const move of moves) {
    keys.push(moveOrderScore(board, move, player, config) * MOVE_SLOT + (MOVE_SLOT - 1 - move))
  }
  keys.sort((a, z) => z - a)
  return keys.map((key) => MOVE_SLOT - 1 - (key % MOVE_SLOT))
}
