import {
  availableMoves,
  boardFromCells,
  DEFAULT_BOARD_CONFIG,
  evaluateStatus,
  type Board,
  type BoardConfig,
} from '@xox/game-core'
import { describe, expect, it } from 'vitest'
import {
  applyComputerMove,
  applyHumanMove,
  COMPUTER,
  createInitialState,
  HUMAN,
  turnAttr,
} from './game-engine'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

describe('createInitialState', () => {
  it('argümansız çağrıda boş tahta, X sırası ve DEFAULT_BOARD_CONFIG ile başlar', () => {
    const state = createInitialState()
    expect(state.board).toEqual(b('.........'))
    expect(state.status).toEqual({ kind: 'playing', turn: 'X' })
    expect(state.config).toEqual(DEFAULT_BOARD_CONFIG)
  })

  it('verilen konfigürasyonla (ör. {6,4}) doğru hücre sayısında başlar', () => {
    const config: BoardConfig = { size: 6, winLength: 4 }
    const state = createInitialState(config)
    expect(state.board).toHaveLength(36)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.config).toEqual(config)
  })
})

describe('applyHumanMove', () => {
  it('boş hücreye insan hamlesini uygular', () => {
    const state = createInitialState()
    const next = applyHumanMove(state, 4)
    expect(next.board).toEqual(b('....X....'))
  })

  it('dolu hücreye tıklamak tahtayı DEĞİŞTİRMEZ, hata fırlatmaz (KK-024)', () => {
    const state = applyHumanMove(createInitialState(), 4)
    const next = applyHumanMove(state, 4)
    expect(next).toBe(state)
  })

  it('sıra bilgisayardayken insan hamlesi yok sayılır', () => {
    const afterHuman = applyHumanMove(createInitialState(), 0)
    expect(afterHuman.status).toEqual({ kind: 'playing', turn: 'O' })
    const attempted = applyHumanMove(afterHuman, 1)
    expect(attempted).toBe(afterHuman)
  })

  it('oyun bittikten sonra boş hücreye tıklamak tahtayı değiştirmez (KK-025)', () => {
    const finished = {
      board: b('XXXOO....'),
      status: evaluateStatus(b('XXXOO....')),
      config: DEFAULT_BOARD_CONFIG,
    }
    const next = applyHumanMove(finished, 5)
    expect(next).toBe(finished)
    expect(turnAttr(next.status)).toBe('yok')
  })

  it('oyun sürerken sira-gostergesi sıradaki taşı döner', () => {
    expect(turnAttr(createInitialState().status)).toBe('X')
  })
})

describe('applyComputerMove', () => {
  it('YALNIZ @xox/game-core chooseMove ile hamle üretir (deterministik)', () => {
    const afterHuman = applyHumanMove(createInitialState(), 0)
    const next = applyComputerMove(afterHuman, 'unbeatable')
    expect(next.board).toEqual(b('X...O....'))
  })

  it('sıra insandayken bilgisayar hamlesi yok sayılır', () => {
    const state = createInitialState()
    const attempted = applyComputerMove(state, 'unbeatable')
    expect(attempted).toBe(state)
  })

  it('oyun bittiyse bilgisayar hamlesi üretmez', () => {
    const finished = {
      board: b('XXXOO....'),
      status: evaluateStatus(b('XXXOO....')),
      config: DEFAULT_BOARD_CONFIG,
    }
    const next = applyComputerMove(finished, 'unbeatable')
    expect(next).toBe(finished)
  })

  it('rng enjekte edilebilir — easy zorlukta rng=0 ilk boş hücreyi seçer', () => {
    const afterHuman = applyHumanMove(createInitialState(), 0)
    const next = applyComputerMove(afterHuman, 'easy', () => 0)
    expect(next.board).toEqual(b('XO.......'))
  })
})

describe('config plumbing (N > 3)', () => {
  const CONFIG_6: BoardConfig = { size: 6, winLength: 4 }

  it('applyHumanMove yeni konfigürasyonun ARALIĞINI kullanır (36 hücre, index 35 geçerli)', () => {
    const state = createInitialState(CONFIG_6)
    const next = applyHumanMove(state, 35)
    expect(next.board[35]).toBe('X')
    expect(next.config).toEqual(CONFIG_6)
  })

  it('applyComputerMove chooseMove-a config AKTARIR', () => {
    const afterHuman = applyHumanMove(createInitialState(CONFIG_6), 0)
    const next = applyComputerMove(afterHuman, 'easy', () => 0)
    expect(next.board[1]).toBe('O')
    expect(next.config).toEqual(CONFIG_6)
  })
})

/**
 * Yenilmezlik sondası (küçültülmüş — `game-core`'un kendi `ai.test.ts`'i
 * yenilmezliği tam ağaç taramasıyla zaten kanıtlıyor; bu sonda yalnız BU
 * KATMANIN (`applyHumanMove`/`applyComputerMove` sarmalayıcılarının) motoru
 * doğru çağırdığını sınar — mobil için AYRI bir dosya olduğundan mobilin
 * KENDİ delegasyonu da doğrulanmış olur, web'in sonucuna GÜVENİLMEZ).
 */
describe('yenilmezlik sondası — zorluk-unbeatable (mobil delegasyonu)', () => {
  function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function pickRandomMove(board: Board, rng: () => number): number {
    const moves = availableMoves(board)
    const index = Math.min(Math.floor(rng() * moves.length), moves.length - 1)
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- `!` yasak
    return moves[index] as number
  }

  function playOneGame(opening: number, rng: () => number): 'draw' | 'human-won' | 'ai-won' {
    let state = applyHumanMove(createInitialState(), opening)
    while (state.status.kind === 'playing') {
      if (state.status.turn === COMPUTER) {
        state = applyComputerMove(state, 'unbeatable', rng)
      } else {
        state = applyHumanMove(state, pickRandomMove(state.board, rng))
      }
    }
    if (state.status.kind === 'draw') return 'draw'
    return state.status.winner === HUMAN ? 'human-won' : 'ai-won'
  }

  const OPENINGS = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const SONDA_TIMEOUT_MS = 90_000

  it(
    '9 açılış varyantının tamamında insan hiç kazanamaz',
    () => {
      let humanWins = 0
      let aiWins = 0
      const rng = mulberry32(20260828)

      for (const opening of OPENINGS) {
        const result = playOneGame(opening, rng)
        if (result === 'human-won') humanWins += 1
        else if (result === 'ai-won') aiWins += 1
      }

      expect(humanWins).toBe(0)
      expect(aiWins).toBeGreaterThan(0)
    },
    SONDA_TIMEOUT_MS,
  )
})
