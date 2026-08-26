import { cellAt, nextPlayer } from './board'
import { DEFAULT_BOARD_CONFIG, colOf, isKnownMode, rowOf } from './config'
import type { BoardConfig } from './config'
import type { Board, Cell, GameStatus, Player, WinLine } from './types'

/**
 * Kazanma hatları KONFİGÜRASYONDAN ÜRETİLİR; elle yazılmış `WIN_LINES` sabiti
 * silindi (ADR-0012). Altı kombinasyon toplam 854 hat eder — insan eliyle
 * yazılamaz. Üretimin doğruluğunu iki ELLE YAZILMIŞ beklenti denetler:
 * hat sayıları tablosu (KK-B07) ve (3,3)'ün sekiz hattının birebir kopyası
 * (KK-B08).
 *
 * Üretim sırası UYGULAMA DETAYI DEĞİL, SÖZLEŞMEDİR:
 *   1) yatay   r = 0..N-1, c = 0..N-K
 *   2) dikey   c = 0..N-1, r = 0..N-K
 *   3) köşegen ↘ r = 0..N-K, c = 0..N-K
 *   4) köşegen ↙ r = 0..N-K, c = K-1..N-1
 * `state.status.line` ve `data-kazanan` bu sıradan çıkar; "refaktör" diye
 * değiştirilirse ekran okuyucu duyurusu ve E2E sessizce değişir.
 */
const winLinesCache = new Map<string, readonly WinLine[]>()

function freezeLine(indices: readonly number[]): WinLine {
  return Object.freeze(indices)
}

function buildWinLines(config: BoardConfig): readonly WinLine[] {
  const n = config.size
  const k = config.winLength
  const lines: WinLine[] = []
  const last = n - k

  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c <= last; c += 1) {
      lines.push(freezeLine(Array.from({ length: k }, (_unused, i) => r * n + c + i)))
    }
  }
  for (let c = 0; c < n; c += 1) {
    for (let r = 0; r <= last; r += 1) {
      lines.push(freezeLine(Array.from({ length: k }, (_unused, i) => (r + i) * n + c)))
    }
  }
  for (let r = 0; r <= last; r += 1) {
    for (let c = 0; c <= last; c += 1) {
      lines.push(freezeLine(Array.from({ length: k }, (_unused, i) => (r + i) * n + c + i)))
    }
  }
  for (let r = 0; r <= last; r += 1) {
    for (let c = k - 1; c < n; c += 1) {
      lines.push(freezeLine(Array.from({ length: k }, (_unused, i) => (r + i) * n + c - i)))
    }
  }

  return Object.freeze(lines)
}

/**
 * Memoize edilir; anahtar DEĞERDİR, referans değil (`parseBoardConfig` her
 * çağrıda yeni nesne üretir). Yalnız `BOARD_MODES`'taki altı kombinasyon
 * saklanır: uzun ömürlü bir instance'ta hatalı bir çağrı sonsuz büyüyen bir
 * önbellek üretmesin (ADR-0012 §2).
 */
export function winLines(config: BoardConfig = DEFAULT_BOARD_CONFIG): readonly WinLine[] {
  const key = `${String(config.size)}x${String(config.winLength)}`
  const cached = winLinesCache.get(key)
  if (cached !== undefined) return cached

  const lines = buildWinLines(config)
  if (isKnownMode(config)) winLinesCache.set(key, lines)
  return lines
}

/** Hat tamamen tek oyuncunun taşıysa o oyuncu, aksi hâlde `null`. */
function lineWinner(board: Board, line: WinLine): Cell {
  let winner: Cell = null
  for (const index of line) {
    const cell = cellAt(board, index)
    if (cell === null) return null
    if (winner === null) {
      winner = cell
      continue
    }
    if (winner !== cell) return null
  }
  return winner
}

/**
 * OTORİTE yol: hat tablosunun tamamını tarar. Sunucu (`db/rooms/apply-move.ts`)
 * DAİMA bunu kullanır; arama ağacı DAİMA `wouldWin`'i kullanır. Karışmaz.
 *
 * İki hat aynı anda tamamlanırsa `winLines` sırasındaki ilki döner (KK-B23);
 * ek bir öncelik kuralı yoktur, determinizm sıranın kendisinden çıkar.
 */
export function evaluateStatus(
  board: Board,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): GameStatus {
  for (const line of winLines(config)) {
    const winner = lineWinner(board, line)
    if (winner !== null) return { kind: 'won', winner, line }
  }

  for (const cell of board) {
    if (cell === null) return { kind: 'playing', turn: nextPlayer(board) }
  }

  return { kind: 'draw' }
}

/** Yatay, dikey ve iki köşegen — `wouldWin`'in taradığı dört eksen. */
const DIRECTIONS: readonly { readonly dr: number; readonly dc: number }[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
]

/**
 * `(row, col)`'dan `(dr, dc)` yönünde kaç kesintisiz `player` taşı var.
 *
 * Sınır kontrolü ÜÇ koşuldur, dört değil: `r >= 0` BİLEREK yoktur. Negatif
 * satır daima negatif indeks üretir (`r * n + c`, `0 <= c < n`) ve `cellAt`
 * TOTAL olduğu için negatif indeks `null` döner — yani dördüncü koşul hiçbir
 * girdiyle ayırt edilemeyen, öldürülemez bir mutant üretirdi.
 *
 * `r < n` ise ULAŞILABİLİRDİR ve şart: konfigürasyon-tahta uyuşmazlığında
 * (E-18: 121 hücrelik tahta `size:6` ile taranırsa) `r = n` gerçek bir hücreye
 * denk gelir ve bu kontrol olmasa hayalet galibiyet üretirdi. Testi vardır.
 */
function runLength(
  board: Board,
  config: BoardConfig,
  row: number,
  col: number,
  dr: number,
  dc: number,
  player: Player,
): number {
  const n = config.size
  let count = 0
  let r = row + dr
  let c = col + dc
  while (r < n && c >= 0 && c < n && cellAt(board, r * n + c) === player) {
    count += 1
    r += dr
    c += dc
  }
  return count
}

/**
 * HIZLI yol: `index`e `player` taşı konsa kazanır mıydı? Son taşın etrafında
 * dört yön taranır; HAT TABLOSUNA BAKMAZ — 11×11'de düğüm başına 1260 okuma
 * yerine ~36 okuma. Yalnız arama ağacı kullanır.
 *
 * `evaluateStatus`'tan TÜRETİLMEZ: türetilseydi KK-B26'nın denklik korpusu
 * kendini doğrulayan bir teste dönerdi (gotcha örüntü 2).
 *
 * Freestyle: K veya FAZLASI kazandırır, bu yüzden karşılaştırma `>=`.
 */
export function wouldWin(
  board: Board,
  index: number,
  player: Player,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): boolean {
  const row = rowOf(index, config)
  const col = colOf(index, config)
  for (const { dr, dc } of DIRECTIONS) {
    const forward = runLength(board, config, row, col, dr, dc, player)
    const backward = runLength(board, config, row, col, -dr, -dc, player)
    if (1 + forward + backward >= config.winLength) return true
  }
  return false
}
