import { availableMoves, boardFromCells, evaluateStatus, type Board } from '@xox/game-core'
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
  it('boş tahta ve X sırası ile başlar', () => {
    const state = createInitialState()
    expect(state.board).toEqual(b('.........'))
    expect(state.status).toEqual({ kind: 'playing', turn: 'X' })
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
    const finished = { board: b('XXXOO....'), status: evaluateStatus(b('XXXOO....')) }
    const next = applyHumanMove(finished, 5)
    expect(next).toBe(finished)
    expect(turnAttr(next.status)).toBe('yok')
  })

  it('oyun sürerken sira-gostergesi sıradaki taşı döner', () => {
    expect(turnAttr(createInitialState().status)).toBe('X')
  })
})

describe('applyComputerMove', () => {
  it('YALNIZ @xox/game-core chooseMove ile hamle üretir (deterministik: unbeatable ilk hamlede köşe/merkez alır)', () => {
    const afterHuman = applyHumanMove(createInitialState(), 0)
    const next = applyComputerMove(afterHuman, 'unbeatable')
    // Boş köşeden sonra en iyi cevap merkezdir (bkz. game-core ai.test.ts).
    expect(next.board).toEqual(b('X...O....'))
  })

  it('sıra insandayken bilgisayar hamlesi yok sayılır', () => {
    const state = createInitialState()
    const attempted = applyComputerMove(state, 'unbeatable')
    expect(attempted).toBe(state)
  })

  it('oyun bittiyse bilgisayar hamlesi üretmez', () => {
    const finished = { board: b('XXXOO....'), status: evaluateStatus(b('XXXOO....')) }
    const next = applyComputerMove(finished, 'unbeatable')
    expect(next).toBe(finished)
  })

  it('rng enjekte edilebilir — easy zorlukta rng=0 ilk boş hücreyi seçer', () => {
    const afterHuman = applyHumanMove(createInitialState(), 0)
    const next = applyComputerMove(afterHuman, 'easy', () => 0)
    // Human 0'ı oynadıktan sonra boş hücreler [1..8]; rng=0 -> listenin ilki (1).
    expect(next.board).toEqual(b('XO.......'))
  })
})

/**
 * Yenilmezlik sondası (kart §oyna/bilgisayar kriter 8): `zorluk-unbeatable`
 * ile 200+ otomatik oyun, `applyHumanMove`/`applyComputerMove` ÜZERİNDEN —
 * yani bileşenin kullandığı TAM yoldan — sürülür. `game-core`'un kendi
 * `ai.test.ts`'i zaten tüm insan hamle ağacını tam tarayarak 642 oyunla
 * yenilmezliği kanıtlıyor; bu sonda O KANITI tekrar üretmez, bu KATMANIN
 * (`applyHumanMove`/`applyComputerMove` sarmalayıcıları) motoru doğru
 * çağırdığını sınar.
 *
 * Deterministik: mulberry32 tohumlu üreteç kullanılır, `Math.random` YOK —
 * test her koşuda aynı sonucu üretir.
 */
describe('yenilmezlik sondası — zorluk-unbeatable', () => {
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
    // `no-non-null-assertion` `!` yasaklıyor, `index` her zaman [0, moves.length) aralığında
    // olduğu için `as number` güvenli (bkz. game-core/ai.ts pickRandom aynı kalıp).
    // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- `!` yasak
    return moves[index] as number
  }

  /** Tek bir oyunu sonuna kadar sürer: insan ilk hamleyi `opening`de oynar, sonrasında rastgele oynar. */
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
  const GAMES_PER_OPENING = 23 // 9 açılış × 23 = 207 ≥ 200 (kart kriter 8)

  // Alfa-beta budaması olmayan minimax, insanın ilk hamlesinden sonraki 8 boş
  // hücreli tahtada tam ağacı tarar (~60 ms/çağrı — bkz. `game-core`
  // `placeStone` yorumu). 207 oyun × bu tek pahalı çağrı düz `vitest run`da
  // ~15 sn, V8 kapsam ölçümü AÇIKKEN (`test:coverage`) enstrümantasyon
  // yükünden ~2 katına çıkabiliyor; varsayılan 5 sn zaman aşımı bu yüzden
  // bolca pay bırakılarak yükseltilir (3. argüman).
  const SONDA_TIMEOUT_MS = 90_000

  it(
    '9 açılış varyantının tamamında 207 oyunda insan hiç kazanamaz',
    () => {
      let games = 0
      let humanWins = 0
      let aiWins = 0
      let draws = 0
      const rng = mulberry32(20260825)

      for (const opening of OPENINGS) {
        for (let i = 0; i < GAMES_PER_OPENING; i += 1) {
          const result = playOneGame(opening, rng)
          games += 1
          if (result === 'human-won') humanWins += 1
          else if (result === 'ai-won') aiWins += 1
          else draws += 1
        }
      }

      expect(games).toBe(207)
      expect(humanWins).toBe(0)
      expect(aiWins + draws).toBe(games)
      expect(aiWins).toBeGreaterThan(0)
    },
    SONDA_TIMEOUT_MS,
  )
})
