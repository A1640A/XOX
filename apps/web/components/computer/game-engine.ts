import {
  applyMove,
  EMPTY_BOARD,
  evaluateStatus,
  isValidMove,
  type Board,
  type Difficulty,
  type GameStatus,
  type Player,
} from '@xox/game-core'
// PERF-003: hesaplama gerektiren arama kodu ana barrel'dan DEĞİL, ayrı bir
// alt yoldan (`@xox/game-core/ai`) alınır. Tek başına bu satır Turbopack'in
// paylaşılan-chunk birleştirmesini ENGELLEMEZ (ölçüldü) — asıl ayrıştırmayı
// `ComputerGameScreen.tsx`'teki `next/dynamic` sınırı yapar; bu alt yol
// yalnız o sınırın İÇİNDE kalan modül grafiğini netleştirir (bkz. rapor).
import { chooseMove } from '@xox/game-core/ai'

/**
 * Bilgisayara karşı oyunun saf durum makinesi (kart §oyna/bilgisayar, KK-022).
 *
 * Bu dosya HİÇBİR kural mantığı içermez: kazanan tespiti (`evaluateStatus`),
 * hamle geçerliliği (`isValidMove`/`applyMove`) ve bilgisayar hamlesi
 * (`chooseMove`) TAMAMEN `@xox/game-core`'dan gelir. Burada yalnız "kimin
 * sırası, hangi fonksiyon çağrılır" akışı vardır — `apps/web` kuralı yeniden
 * yazmaz, delege eder.
 *
 * İnsan her zaman X, bilgisayar her zaman O — X başlar (`nextPlayer(EMPTY_BOARD) === 'X'`),
 * yani insan açılış hamlesini oynar.
 */
export const HUMAN: Player = 'X'
export const COMPUTER: Player = 'O'

export interface ComputerGameState {
  readonly board: Board
  readonly status: GameStatus
}

export function createInitialState(): ComputerGameState {
  return { board: EMPTY_BOARD, status: evaluateStatus(EMPTY_BOARD) }
}

/**
 * İnsan hamlesi. Dolu hücre, sıra bilgisayarda ya da oyun bittiyse (KK-024/025)
 * durum SESSİZCE değişmeden döner — hata fırlatmaz, `applyMove`'u dahi
 * çağırmaz. Geçerlilik kararı tek kaynak `@xox/game-core`'un `isValidMove`'udur;
 * "sıra bende mi" kontrolü ayrıca eklenir çünkü `isValidMove` sıra sahipliğini
 * bilerek doğrulamaz (bkz. `@xox/game-core` index.ts açıklaması) — çevrimdışı
 * bu ekranda sıra sahipliğini biz biliyoruz (`HUMAN`/`COMPUTER` sabit), bu
 * yüzden kontrolü burada ekliyoruz.
 */
export function applyHumanMove(state: ComputerGameState, index: number): ComputerGameState {
  if (state.status.kind !== 'playing' || state.status.turn !== HUMAN) return state
  if (!isValidMove(state.board, index)) return state
  const board = applyMove(state.board, index, HUMAN)
  return { board, status: evaluateStatus(board) }
}

/**
 * Bilgisayar hamlesi — YALNIZ `@xox/game-core`'un `chooseMove`'undan gelir
 * (KK-022). `rng` enjekte edilir: `Math.random` varsayılan, testler ve 200
 * oyunluk yenilmezlik sondası tohumlu bir üreteç geçer.
 */
export function applyComputerMove(
  state: ComputerGameState,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): ComputerGameState {
  if (state.status.kind !== 'playing' || state.status.turn !== COMPUTER) return state
  const index = chooseMove(state.board, COMPUTER, difficulty, rng)
  const board = applyMove(state.board, index, COMPUTER)
  return { board, status: evaluateStatus(board) }
}

/**
 * `sira-gostergesi` `data-sira` değeri: oyun sürerken sıradaki taş, aksi
 * hâlde `yok` (KK-025). `components/room/status-text.ts`'teki `turnAttr` ile
 * gövde gövdeye AYNIDIR — BİLİNÇLİ KOPYA: sözleşme `packages/shared/src/
 * testids.ts`'te (`DATA_ATTR.sira`) yaşıyor, iki tarafın da BAĞIMSIZ uyması
 * gereken şey o. Ortak yardımcıya çıkarmak `components/room/**`'a dokunmayı
 * gerektirir — o dizin bu dalgada W1-02'nin çakışma kümesinde.
 */
export function turnAttr(status: GameStatus): Player | 'yok' {
  return status.kind === 'playing' ? status.turn : 'yok'
}
