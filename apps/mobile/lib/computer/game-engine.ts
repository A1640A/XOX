import {
  applyMove,
  DEFAULT_BOARD_CONFIG,
  emptyBoard,
  evaluateStatus,
  isValidMove,
  type Board,
  type BoardConfig,
  type Difficulty,
  type GameStatus,
  type Player,
} from '@xox/game-core'
import { chooseMove } from '@xox/game-core/ai'

/**
 * `/oyna/bilgisayar` ekranının saf durum makinesi — `apps/web/components/
 * computer/game-engine.ts`nin MOBİL eş biçimi (KK-022). İki dosya birbirini
 * import EDEMEZ (boundaries: mobil web'e bağımlı olamaz), bu yüzden
 * orkestrasyon BİLEREK kopyadır; kural mantığının kendisi (kazanan tespiti,
 * hamle geçerliliği, bilgisayar hamlesi) HER İKİSİNDE de TEK kaynaktan,
 * `@xox/game-core`'dan gelir — mobil kuralı yeniden yazmaz.
 *
 * İnsan her zaman X, bilgisayar her zaman O — X başlar.
 */
export const HUMAN: Player = 'X'
export const COMPUTER: Player = 'O'

export interface ComputerGameState {
  readonly board: Board
  readonly status: GameStatus
  readonly config: BoardConfig
}

export function createInitialState(config: BoardConfig = DEFAULT_BOARD_CONFIG): ComputerGameState {
  const board = emptyBoard(config)
  return { board, status: evaluateStatus(board, config), config }
}

/** Dolu hücre / sıra bilgisayarda / oyun bittiyse SESSİZCE değişmeden döner (KK-024/025). */
export function applyHumanMove(state: ComputerGameState, index: number): ComputerGameState {
  if (state.status.kind !== 'playing' || state.status.turn !== HUMAN) return state
  if (!isValidMove(state.board, index, state.config)) return state
  const board = applyMove(state.board, index, HUMAN, state.config)
  return { board, status: evaluateStatus(board, state.config), config: state.config }
}

/** Bilgisayar hamlesi YALNIZ `@xox/game-core`'un `chooseMove`'undan gelir (KK-022). */
export function applyComputerMove(
  state: ComputerGameState,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): ComputerGameState {
  if (state.status.kind !== 'playing' || state.status.turn !== COMPUTER) return state
  const index = chooseMove(state.board, COMPUTER, difficulty, rng, { config: state.config })
  const board = applyMove(state.board, index, COMPUTER, state.config)
  return { board, status: evaluateStatus(board, state.config), config: state.config }
}

/** `sira-gostergesi` eş biçimi: oyun sürerken sıradaki taş, aksi hâlde `yok` (KK-025). */
export function turnAttr(status: GameStatus): Player | 'yok' {
  return status.kind === 'playing' ? status.turn : 'yok'
}
