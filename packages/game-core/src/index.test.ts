import { describe, expect, it } from 'vitest'
import * as surface from './index'
import type {
  Board,
  BoardConfig,
  BoardConfigParse,
  BoardConfigRejection,
  BoardMode,
  Cell,
  Difficulty,
  GameStatus,
  InvalidMoveReason,
  Player,
  WinLine,
} from './index'

/**
 * ELLE YAZILMIŞ yüzey listesi — `Object.keys(surface)`'tan TÜRETİLMEZ
 * (gotcha örüntü 2: kendine referanslı beklenti silmeyi göremez).
 *
 * Yeni bir dışa aktarım eklemek ya da birini silmek bu listeyi de değiştirmeyi
 * zorunlu kılar; `game-core`'un yüzeyi sessizce büyüyemez ya da küçülemez.
 * `cellAt`, `placeStone` ve `isKnownMode` bilerek BURADA YOK.
 */
const EXPECTED_VALUE_EXPORTS = [
  'AI_BUDGET_MS',
  'BOARD_MODES',
  'CANDIDATE_RADIUS',
  'DEFAULT_BOARD_CONFIG',
  'MAX_SEARCH_DEPTH',
  'InvalidMoveError',
  'applyMove',
  'availableMoves',
  'bestMove',
  'boardFromCells',
  'boardToString',
  'cellCount',
  'chooseMove',
  'colOf',
  'emptyBoard',
  'evaluateStatus',
  'isValidMove',
  'nextPlayer',
  'parseBoardConfig',
  'rowOf',
  'winLines',
  'wouldWin',
]

describe('@xox/game-core yüzeyi — DONMUŞ', () => {
  it('çalışma zamanı dışa aktarımları elle yazılmış listeyle birebir eşleşir', () => {
    expect([...Object.keys(surface)].sort()).toEqual([...EXPECTED_VALUE_EXPORTS].sort())
  })

  it('silinen sabitler yüzeyde YOK: BOARD_SIZE, EMPTY_BOARD, WIN_LINES', () => {
    const keys = new Set(Object.keys(surface))
    expect(keys.has('BOARD_SIZE')).toBe(false)
    expect(keys.has('EMPTY_BOARD')).toBe(false)
    expect(keys.has('WIN_LINES')).toBe(false)
  })

  it('pakete özel yardımcılar dışa AKTARILMAZ', () => {
    const keys = new Set(Object.keys(surface))
    expect(keys.has('cellAt')).toBe(false)
    expect(keys.has('placeStone')).toBe(false)
    expect(keys.has('isKnownMode')).toBe(false)
    // Arama motorunun iç yüzeyi: `searchMove`, `evaluateBoard`, `orderMoves`,
    // `candidateMoves`, `WINDOW_WEIGHT`, `TERMINAL_SCORE`, `AI_NODE_BUDGET`.
    // Dışarıya YALNIZ üç sabit açılır (ADR-0013 §9); motorun kendisi değil.
    expect(keys.has('searchMove')).toBe(false)
    expect(keys.has('evaluateBoard')).toBe(false)
    expect(keys.has('candidateMoves')).toBe(false)
    expect(keys.has('WINDOW_WEIGHT')).toBe(false)
    expect(keys.has('AI_NODE_BUDGET')).toBe(false)
  })

  it('tip yüzeyi de derleme zamanında dondurulur', () => {
    // Bir tip silinirse ya da adı değişirse BU DOSYA derlenmez.
    const probe: {
      board: Board | null
      config: BoardConfig
      parse: BoardConfigParse
      rejection: BoardConfigRejection
      mode: BoardMode
      cell: Cell
      difficulty: Difficulty
      status: GameStatus
      reason: InvalidMoveReason
      player: Player
      line: WinLine
    } = {
      board: null,
      config: { size: 3, winLength: 3 },
      parse: { ok: true, config: { size: 3, winLength: 3 } },
      rejection: 'unknown-size',
      mode: { size: 3, winLengths: [3], defaultWinLength: 3 },
      cell: null,
      difficulty: 'unbeatable',
      status: { kind: 'draw' },
      reason: 'occupied',
      player: 'X',
      line: [0, 1, 2],
    }
    expect(probe.config).toEqual({ size: 3, winLength: 3 })
  })

  it('KK-B28: paket saf ve bağımlılıksız kalır — sıfır çalışma zamanı bağımlılığı', async () => {
    const pkg = (await import('../package.json', { with: { type: 'json' } })) as {
      default: { dependencies?: Record<string, string> }
    }
    expect(pkg.default.dependencies).toBeUndefined()
  })
})
