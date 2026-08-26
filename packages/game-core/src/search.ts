import {
  AI_BUDGET_MS,
  AI_NODE_BUDGET,
  CANDIDATE_RADIUS,
  MAX_SEARCH_DEPTH,
  NODE_CHECK_INTERVAL,
  TERMINAL_SCORE,
} from './ai-config'
import { boardFromCells, cellAt } from './board'
import { cellCount, colOf, rowOf } from './config'
import type { BoardConfig } from './config'
import { evaluateBoard, opponentOf, orderMoves, windowsThrough } from './evaluate'
import { wouldWin } from './status'
import type { Board, Cell, Player } from './types'

/**
 * N > 3 arama motoru (ADR-0013 §2–§4): aday daraltma → taktik tarama →
 * yinelemeli derinleşme + alfa-beta → duvar saati / düğüm bütçesi.
 *
 * 3×3 BURAYA UĞRAMAZ. `chooseMove` `size === 3`te bugünkü tam minimaxa
 * (`bestMove`) gider; KK-B20'nin tümevarımsal yenilmezlik kanıtı o gövdeyi
 * koşmaya devam eder (ADR-0013 §1).
 */

/**
 * Sayı dizisi okumasının TEK daraltma noktası — `cellAt` disiplini.
 * `noUncheckedIndexedAccess` altında indeksleme `number | undefined` verir;
 * çağıranlar indeksi kendileri ürettiği için savunmacı bir dal ULAŞILAMAZ bir
 * mutant olurdu.
 *
 * Kural çakışması `pickRandom` ile aynı: `non-nullable-type-assertion-style`
 * `!` ister, `no-non-null-assertion` `!`'i yasaklar.
 */
function numberAt(list: readonly number[], index: number): number {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- `!` yasak
  return list[index] as number
}

/**
 * Adaylar: herhangi bir taşa Chebyshev uzaklığı ≤ `CANDIDATE_RADIUS` olan boş
 * hücreler, ARTAN indeks sırasında. Tahta tamamen boşsa tek aday merkezdir.
 *
 * Liste boş dönerse tahta DOLUDUR: boş bir hücre bütün taşlardan 2'den uzak
 * olsaydı, taş kümesinin 2-genişlemesi kendisine eşit olurdu — bu da ancak
 * tahtanın tamamı taş olduğunda mümkündür. Bu yüzden "aday yok ama hamle var"
 * diye bir savunmacı dal YOKTUR.
 */
export function candidateMoves(board: Board, config: BoardConfig): number[] {
  const n = config.size
  const total = cellCount(config)
  const moves: number[] = []
  let stones = 0

  for (let index = 0; index < total; index += 1) {
    if (cellAt(board, index) !== null) stones += 1
  }
  if (stones === 0) {
    const mid = Math.floor(n / 2)
    return [mid * n + mid]
  }

  for (let index = 0; index < total; index += 1) {
    if (cellAt(board, index) !== null) continue
    if (hasStoneNear(board, config, index)) moves.push(index)
  }
  return moves
}

function hasStoneNear(board: Board, config: BoardConfig, index: number): boolean {
  const n = config.size
  const row = rowOf(index, config)
  const col = colOf(index, config)
  const lastRow = Math.min(n - 1, row + CANDIDATE_RADIUS)
  const lastCol = Math.min(n - 1, col + CANDIDATE_RADIUS)

  for (let r = Math.max(0, row - CANDIDATE_RADIUS); r <= lastRow; r += 1) {
    for (let c = Math.max(0, col - CANDIDATE_RADIUS); c <= lastCol; c += 1) {
      if (cellAt(board, r * n + c) !== null) return true
    }
  }
  return false
}

/**
 * `exactOptionalPropertyTypes` açık: opsiyonel alanlar AÇIKÇA `| undefined`
 * kabul eder, çünkü `chooseMove` kendi opsiyonel alanlarını olduğu gibi
 * geçiriyor (`budgetMs: options.budgetMs`) ve orada değer `undefined`
 * olabilir.
 */
export interface SearchOptions {
  readonly config: BoardConfig
  readonly budgetMs?: number | undefined
  /** Duvar saati ENJEKTE EDİLİR (`rng` konvansiyonu) — testler deterministik. */
  readonly now?: (() => number) | undefined
  /**
   * Düğüm bütçesi de ENJEKTE EDİLEBİLİR — `chooseMove` bunu AÇMAZ, yalnız bu
   * modülün testleri kullanır (ADR-0013 §1'in `ChooseMoveOptions` sözleşmesi
   * üç alanlı kalır).
   *
   * Gerekçe ÖLÇÜM: Stryker enstrümante ettiği kodu ~32× yavaşlatıyor, yani
   * 30 000 düğümlük tek bir arama mutasyon koşusunda dakikalara çıkıyor ve kapı
   * pratikte koşulamaz hâle geliyor (iki kez "dry run" zaman aşımıyla düştü).
   * Bütçenin kendisi bir SAYI olduğu için küçültmek kod yolunu değiştirmez:
   * 500 düğümde biten arama da 30 000 düğümde biten arama da aynı satırları
   * koşar. Varsayılanın gerçekten `AI_NODE_BUDGET` olduğunu `search-corpus-*`
   * dosyaları hiçbir bütçe geçirmeden doğrular.
   */
  readonly nodeBudget?: number | undefined
}

export interface SearchResult {
  readonly move: number
  /** Ziyaret edilen düğüm sayısı — `AI_NODE_BUDGET` kapısı bunu ölçer. */
  readonly nodes: number
  /** TAMAMLANAN en derin iterasyon; 0 ise yalnız taktik/statik hamle döndü. */
  readonly depth: number
}

/**
 * Aramanın gezici durumu.
 *
 * `cells` DEĞİŞTİRİLEBİLİR bir dizidir ve `view` ONUNLA AYNI NESNEDİR:
 * `boardFromCells` doğrulamayı bir kez yapıp diziyi olduğu gibi `Board` olarak
 * döndürür. Böylece düğüm başına 121 hücrelik kopya + 121 hücrelik yeniden
 * doğrulama maliyeti ödenmez (`moves.ts`'in ölçtüğü 515 ms → 1006 ms farkının
 * aynısı). Dizi bu modülden ASLA dışarı çıkmaz; `searchMove` yalnız bir sayı
 * döndürür.
 */
interface SearchState {
  readonly cells: Cell[]
  readonly view: Board
  readonly config: BoardConfig
  readonly root: Player
  readonly now: () => number
  readonly deadline: number
  readonly nodeBudget: number
  score: number
  nodes: number
  aborted: boolean
  /**
   * Kökte SEÇİLEN hamle. Girişte önceki iterasyonun en iyisidir (ilk denenen
   * hamle olur), çıkışta bu iterasyonun en iyisidir.
   */
  rootMove: number
}

/** Kökün ply'ı — `TERMINAL_SCORE − ply` cezası buradan başlar. */
const ROOT_PLY = 1

/** Taşı koyar, toplam puanı ARTIMLI günceller ve eski puanı geri verir. */
function make(state: SearchState, index: number, player: Player): number {
  const before = windowsThrough(state.view, state.config, index, state.root)
  state.cells[index] = player
  const previous = state.score
  state.score = previous + windowsThrough(state.view, state.config, index, state.root) - before
  return previous
}

function unmake(state: SearchState, index: number, previous: number): void {
  state.cells[index] = null
  state.score = previous
}

/**
 * Bütçe kapısı. Düğüm sayacı HER düğümde okunur (tamsayı kıyaslaması, bedava)
 * — bu yüzden `AI_NODE_BUDGET` bir tahmin değil YAPISAL bir üst sınırdır.
 * Duvar saati ise her `NODE_CHECK_INTERVAL` düğümde bir okunur: `now()`
 * çağrısının kendisi ölçülebilir bir maliyettir (ADR-0013 §4).
 */
function exhausted(state: SearchState): boolean {
  if (state.nodes >= state.nodeBudget) return true
  return state.nodes % NODE_CHECK_INTERVAL === 0 && state.now() >= state.deadline
}

/**
 * `player` `move`'a oynadıktan sonraki puan. Kazanan hamle derinlik cezalıdır
 * (`TERMINAL_SCORE − ply`): erken kazanç geç kazançtan iyidir.
 */
function scoreChild(
  state: SearchState,
  candidates: readonly number[],
  move: number,
  toMove: Player,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
): number {
  if (wouldWin(state.view, move, toMove, state.config)) {
    return toMove === state.root ? TERMINAL_SCORE - ply : ply - TERMINAL_SCORE
  }
  if (depth === 1) return state.score
  return alphaBeta(
    state,
    childCandidates(state, candidates, move),
    opponentOf(toMove),
    depth - 1,
    ply + 1,
    alpha,
    beta,
  )
}

/**
 * Çocuğun aday listesi: ebeveynin listesinden oynanan hücre çıkarılır, o
 * hücrenin yarıçapındaki boş hücreler eklenir. İki liste de artan sıradadır,
 * birleştirme tek geçiştir — düğüm başına tahtanın tamamını yeniden taramak
 * yerine yalnız 5×5'lik kutu okunur.
 */
function childCandidates(state: SearchState, parent: readonly number[], move: number): number[] {
  const n = state.config.size
  const row = rowOf(move, state.config)
  const col = colOf(move, state.config)
  const lastRow = Math.min(n - 1, row + CANDIDATE_RADIUS)
  const lastCol = Math.min(n - 1, col + CANDIDATE_RADIUS)
  const near: number[] = []

  for (let r = Math.max(0, row - CANDIDATE_RADIUS); r <= lastRow; r += 1) {
    for (let c = Math.max(0, col - CANDIDATE_RADIUS); c <= lastCol; c += 1) {
      const index = r * n + c
      if (cellAt(state.view, index) === null) near.push(index)
    }
  }

  const merged: number[] = []
  let i = 0
  let j = 0
  while (i < parent.length || j < near.length) {
    const fromParent = i < parent.length ? numberAt(parent, i) : Number.POSITIVE_INFINITY
    const fromNear = j < near.length ? numberAt(near, j) : Number.POSITIVE_INFINITY
    if (fromParent < fromNear) {
      i += 1
      if (fromParent !== move) merged.push(fromParent)
      continue
    }
    if (fromNear < fromParent) {
      j += 1
      merged.push(fromNear)
      continue
    }
    i += 1
    j += 1
    merged.push(fromNear)
  }
  return merged
}

/**
 * Alfa-beta. Puan DAİMA kök oyuncunun gözündendir; `toMove` kök oyuncuysa
 * en büyüğü, değilse en küçüğü arar.
 *
 * Aday listesi boşsa tahta dolmuştur (bkz. `candidateMoves`) ve hiçbir hat
 * tamamlanmamıştır — beraberlik, sıfır.
 *
 * KÖK (`ply === 1`) aynı gövdeyi koşar, yalnız iki ek işi vardır: seçilen
 * hamleyi `state.rootMove`a yazar ve eşit puanda EN KÜÇÜK İNDEKSİ korur.
 * Kök için ayrı bir döngü yazmak, bütçe kontrolünün İKİNCİ bir kopyasını
 * doğururdu — o kopyanın "kök düğümde tam bütçe biter" dalı hiçbir sondayla
 * uyarılamıyordu (ölçüldü: kapsam %98.3'e düşüyordu).
 */
function alphaBeta(
  state: SearchState,
  candidates: readonly number[],
  toMove: Player,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
): number {
  if (candidates.length === 0) return 0

  const atRoot = ply === ROOT_PLY
  const maximizing = toMove === state.root
  const ordered = orderMoves(state.view, candidates, toMove, state.config)
  if (atRoot) preferFirst(ordered, state.rootMove)
  let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  let low = alpha
  let high = beta

  for (const move of ordered) {
    state.nodes += 1
    if (exhausted(state)) {
      state.aborted = true
      return best
    }

    const previous = make(state, move, toMove)
    const score = scoreChild(state, candidates, move, toMove, depth, ply, low, high)
    unmake(state, move, previous)

    if (state.aborted) return best

    if (maximizing) {
      if (score > best || (atRoot && score === best && move < state.rootMove)) {
        best = score
        if (atRoot) state.rootMove = move
      }
      if (best > low) low = best
    } else {
      if (score < best) best = score
      if (best < high) high = best
    }
    if (low >= high) return best
  }

  return best
}

/**
 * Önceki iterasyonun en iyi hamlesini listenin BAŞINA alır — budama oranını
 * belirleyen en güçlü tek sıralama ipucu (ADR-0013 §4). Liste `orderMoves`in
 * az önce ürettiği taze bir dizidir, yerinde değiştirilmesi güvenlidir.
 */
function preferFirst(ordered: number[], move: number): void {
  const at = ordered.indexOf(move)
  ordered.splice(at, 1)
  ordered.unshift(move)
}

/**
 * N > 3 için en iyi hamle.
 *
 * TAKTİK TARAMA bütçeden BAĞIMSIZDIR, derinleşme döngüsünden ÖNCE çalışır ve
 * bulduğunu DOĞRUDAN döndürür (KK-B46). ADR-0013 §4'ün sözde kodu taktik
 * hamleyi yalnız `best`i TOHUMLAMAK için kullanıyordu; burada bilerek daha
 * GÜÇLÜ davranılıyor, çünkü iki durum da zorunludur ve aramanın verebileceği
 * daha iyi bir cevap yoktur:
 *
 * 1. Hemen kazandıran bir hamle varsa o, tanım gereği mümkün olan EN ERKEN
 *    kazançtır — `TERMINAL_SCORE − 1`, arama ağacındaki en yüksek puan.
 * 2. Hemen kazanamıyorsam ve rakip bir hücreyle hemen kazanıyorsa, bloklamak
 *    ZORUNLUDUR: başka her hamle bir sonraki yarım hamlede kaybeder. (Rakibin
 *    iki kazanma hücresi varsa pozisyon zaten kayıptır; en küçük indeksli
 *    tehdidi kapatmak da diğerleri kadar iyidir.)
 *
 * Kazanç: garanti ARAMANIN YAN ÜRÜNÜ olmaktan çıkıp YAPISAL hâle gelir —
 * bütçe 1 ms'ye ya da 0 düğüme düşse bile aynı hamle döner ve kanıtı bir
 * "arama yeterince derin gitti mi" muhakemesine dayanmaz. Yan etki olarak
 * taktik pozisyonlar sıfır düğüm harcar.
 *
 * YARIM İTERASYON ATILIR: kısmen aranmış bir derinlik, aranmamış kardeşler
 * yüzünden bir öncekinden KÖTÜ bir hamle üretebilir (ADR-0013 §4).
 */
export function searchMove(board: Board, player: Player, options: SearchOptions): SearchResult {
  const config = options.config
  const now = options.now ?? Date.now
  const candidates = candidateMoves(board, config)
  const other = opponentOf(player)

  const tactical =
    candidates.find((move) => wouldWin(board, move, player, config)) ??
    candidates.find((move) => wouldWin(board, move, other, config))
  if (tactical !== undefined) return { move: tactical, nodes: 0, depth: 0 }

  // Taktik hamle yoksa taban HER ZAMAN statik sıralamanın ilk adayıdır:
  // bütçe sıfır düğüme insa bile dönen hamle geçerlidir (KK-B44).
  const cells: Cell[] = [...board]
  const state: SearchState = {
    cells,
    view: boardFromCells(cells, config),
    config,
    root: player,
    now,
    deadline: now() + (options.budgetMs ?? AI_BUDGET_MS),
    nodeBudget: options.nodeBudget ?? AI_NODE_BUDGET,
    score: evaluateBoard(board, player, config),
    nodes: 0,
    aborted: false,
    rootMove: numberAt(orderMoves(board, candidates, player, config), 0),
  }

  let best = state.rootMove
  let completed = 0
  for (let depth = 2; depth <= MAX_SEARCH_DEPTH; depth += 1) {
    alphaBeta(
      state,
      candidates,
      player,
      depth,
      ROOT_PLY,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    )
    // YARIM İTERASYON ATILIR: yarıda kesilen derinliğin `rootMove`u güvenilmez
    // (aranmamış kardeşler yüzünden bir öncekinden KÖTÜ olabilir), o yüzden
    // bir önceki TAMAMLANAN iterasyonun hamlesi döner.
    if (state.aborted) break
    best = state.rootMove
    completed = depth
  }

  return { move: best, nodes: state.nodes, depth: completed }
}
