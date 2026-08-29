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

  it('UI-COMP-001: verilen konfigürasyonla (ör. {6,4}) doğru hücre sayısında başlar', () => {
    const config: BoardConfig = { size: 6, winLength: 4 }
    const state = createInitialState(config)
    expect(state.board).toHaveLength(36)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.status).toEqual({ kind: 'playing', turn: 'X' })
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
    // Human 0'ı oynadıktan sonra boş hücreler [1..8]; rng=0 -> listenin ilki (1).
    expect(next.board).toEqual(b('XO.......'))
  })
})

/**
 * UI-COMP-001: boyut/K seçimi `state.config`in İÇİNDE taşınır — bu blok
 * `applyHumanMove`/`applyComputerMove`in `DEFAULT_BOARD_CONFIG` DIŞINDA bir
 * konfigürasyonla da doğru çalıştığını (aralık kontrolü, kazanan tespiti,
 * `chooseMove`'a AKTARILAN config) kanıtlar — sözde "3×3 dışı çalışıyor"
 * iddiası tek bir `size`e özel test bırakmaz.
 */
describe('config plumbing (N > 3)', () => {
  const CONFIG_6: BoardConfig = { size: 6, winLength: 4 }

  it('applyHumanMove yeni konfigürasyonun ARALIĞINI kullanır (36 hücre, index 35 geçerli)', () => {
    const state = createInitialState(CONFIG_6)
    const next = applyHumanMove(state, 35)
    expect(next.board[35]).toBe('X')
    expect(next.config).toEqual(CONFIG_6)
  })

  it('applyHumanMove DEFAULT_BOARD_CONFIG (9 hücre) ARALIĞININ dışındaki bir indeksi (35) DEFAULT ile reddetmez — konfigürasyon DAİMA state.configden gelir', () => {
    // Bu test, `isValidMove`e sabit `DEFAULT_BOARD_CONFIG` geçirilseydi
    // 35'in "aralık dışı" reddedileceğini, gerçek davranışın ise `state.config`
    // (6×6, 36 hücre) kullandığını AYIRT EDER.
    const state = createInitialState(CONFIG_6)
    const next = applyHumanMove(state, 35)
    expect(next).not.toBe(state)
  })

  it('applyComputerMove chooseMovea config AKTARIR — easy zorlukta rng=0, 6×6 ilk hamleden sonraki 35 boş hücrenin ilkini (1) seçer', () => {
    const afterHuman = applyHumanMove(createInitialState(CONFIG_6), 0)
    const next = applyComputerMove(afterHuman, 'easy', () => 0)
    expect(next.board[1]).toBe('O')
    expect(next.config).toEqual(CONFIG_6)
  })

  it('evaluateStatus config ile 6×6/K4 kazanma hattını (default 3×3 kuralıyla DEĞİL) doğru değerlendirir', () => {
    // Üst satırın ilk dört hücresi (0,1,2,3) 6×6/K4'te bir kazanma hattıdır;
    // varsayılan (3,3) kuralında bu ANLAMSIZ olurdu (9 hücreye sığmaz).
    let state = createInitialState(CONFIG_6)
    state = applyHumanMove(state, 0) // X
    state = applyComputerMove(state, 'easy', () => 1) // O, tahtanın son boşuna gider
    state = applyHumanMove(state, 1) // X
    state = applyComputerMove(state, 'easy', () => 1)
    state = applyHumanMove(state, 2) // X
    state = applyComputerMove(state, 'easy', () => 1)
    state = applyHumanMove(state, 3) // X kazanır (0-1-2-3)

    expect(state.status.kind).toBe('won')
    expect(state.status.kind === 'won' && state.status.winner).toBe(HUMAN)
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

  // CI-005 (2026-08-29) GÜNCEL ÖLÇÜM: CORE-AI-002 3×3 minimax'a alfa-beta
  // budaması ekledikten SONRA bu 207 oyunluk sonda yüksüz ~2-4 sn, 5×
  // CPU aşırı-abonelik altında (10 çekirdekli makinede 50 arka plan
  // CPU-tüketici iş parçacığı + gerçek `turbo test:coverage --force`
  // 5-paket paralel) bile ~11-14 sn sürüyor — ölçülen en kötü durumun
  // yaklaşık 6-8 katı pay. Eski yorum (alfa-beta ÖNCESİ ~60 ms/çağrı,
  // ~15 sn toplam) artık GEÇERSİZ, CORE-AI-002 aynı gün ilerleyen
  // saatte birleşti; bkz. docs/board/reports/CI-005.md ölçüm tablosu.
  // Sondanın SELF-contention'ı (apps/web'in KENDİ ~95 diğer test dosyasıyla
  // aynı worker havuzunu paylaşması) `vitest.config.ts`teki ayrı
  // `web-yenilmezlik` projesiyle kesildi — bu zaman aşımı yalnız DIŞ
  // (turbo'nun diğer paketleri / başka bir agent) yüke karşı pay bırakır.
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
