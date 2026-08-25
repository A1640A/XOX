import { describe, expect, it } from 'vitest'
import { boardFromCells, emptyBoard } from './board'
import type { BoardConfig } from './config'
import { evaluateStatus, winLines, wouldWin } from './status'
import type { Board, Cell, WinLine } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** Nokta ile yazılmış çok satırlı tahtayı `Board`'a çevirir — büyük tahtalar okunabilir kalsın. */
const grid = (rows: readonly string[], config: BoardConfig): Board =>
  boardFromCells(
    Array.from(rows.join(''), (c) => (c === '.' ? null : (c as 'X' | 'O'))),
    config,
  )

const C33: BoardConfig = { size: 3, winLength: 3 }
const C64: BoardConfig = { size: 6, winLength: 4 }
const C65: BoardConfig = { size: 6, winLength: 5 }
const C115: BoardConfig = { size: 11, winLength: 5 }

/**
 * ELLE KOPYALANMIŞ beklenti (KK-B08) — `winLines`'a ya da eski `WIN_LINES`
 * sabitine REFERANS DEĞİLDİR. Üretim sırası SÖZLEŞMEDİR (ADR-0012):
 * yatay (r artan, c artan) -> dikey (c artan, r artan) -> köşegen ↘ -> köşegen ↙.
 */
const WIN_LINES_3X3 = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

describe('winLines', () => {
  it('KK-B08: (3,3) elle kopyalanmış sekiz hattı AYNI SIRADA üretir', () => {
    expect(winLines(C33).map((line) => [...line])).toEqual(WIN_LINES_3X3)
  })

  it('varsayılan konfigürasyon (3,3)tür', () => {
    expect(winLines().map((line) => [...line])).toEqual(WIN_LINES_3X3)
  })

  it.each([
    [3, 3, 8],
    [6, 4, 54],
    [6, 5, 32],
    [11, 4, 304],
    [11, 5, 252],
    [11, 6, 204],
  ])('KK-B07: (%i,%i) tam %i hat üretir', (size, winLength, expected) => {
    expect(winLines({ size, winLength })).toHaveLength(expected)
  })

  it('her hat tam olarak K indeks içerir ve indeksler kenar aralığındadır', () => {
    for (const line of winLines(C115)) {
      expect(line).toHaveLength(5)
      for (const index of line) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(121)
      }
    }
  })

  it('6x6 K=4de ilk yatay, ilk dikey ve iki köşegen elle yazılmış hatlardır', () => {
    const lines = winLines(C64).map((line) => [...line])
    expect(lines[0]).toEqual([0, 1, 2, 3])
    // 6 kenar, K=4 -> satır başına 3 hat; dikeyler 18. hattan başlar.
    expect(lines[18]).toEqual([0, 6, 12, 18])
    // Köşegenler 36. hattan başlar: ↘ sonra ↙.
    expect(lines[36]).toEqual([0, 7, 14, 21])
    expect(lines[45]).toEqual([3, 8, 13, 18])
  })

  it('KK-B09: dizi ve içindeki hatlar donmuştur — kazanma tespiti bozulamaz', () => {
    const lines = winLines(C33)
    expect(Object.isFrozen(lines)).toBe(true)
    expect(lines.every((line) => Object.isFrozen(line))).toBe(true)
    expect(() => {
      ;(lines as WinLine[]).push([0, 0, 0])
    }).toThrow(TypeError)
    expect(() => {
      ;(lines[0] as unknown as number[])[0] = 5
    }).toThrow(TypeError)
    expect(evaluateStatus(b('XXX......'))).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2] })
  })

  it('KK-B10: aynı konfigürasyon AYNI referansı döner, farklı konfigürasyon farklı', () => {
    expect(winLines(C33)).toBe(winLines({ size: 3, winLength: 3 }))
    expect(winLines(C64)).not.toBe(winLines(C65))
  })

  it('KK-B29: BOARD_MODES dışı konfigürasyon ÖNBELLEĞE ALINMAZ — her çağrı yeni dizi', () => {
    const first = winLines({ size: 4, winLength: 3 })
    const second = winLines({ size: 4, winLength: 3 })
    expect(first).not.toBe(second)
    expect(first.map((line) => [...line])).toEqual(second.map((line) => [...line]))
    // 4 kenar, K=3: yatay 4*2 + dikey 4*2 + ↘ 2*2 + ↙ 2*2 = 24
    expect(first).toHaveLength(24)
  })
})

describe('evaluateStatus — 3x3 (bit düzeyinde korunan davranış)', () => {
  it('boş tahtada X sırası ile playing döner', () => {
    expect(evaluateStatus(b('.........'))).toEqual({ kind: 'playing', turn: 'X' })
  })

  it('tek hamle sonrası O sırası ile playing döner', () => {
    expect(evaluateStatus(b('X........'))).toEqual({ kind: 'playing', turn: 'O' })
  })

  it.each([
    ['üst yatay', 'XXXOO....', [0, 1, 2]],
    ['orta yatay', 'OO.XXX...', [3, 4, 5]],
    ['alt yatay', 'OO....XXX', [6, 7, 8]],
    ['sol dikey', 'XOOX..X..', [0, 3, 6]],
    ['orta dikey', 'OX.OX..X.', [1, 4, 7]],
    ['sağ dikey', 'OOX..X..X', [2, 5, 8]],
    ['ana çapraz', 'XO.OX...X', [0, 4, 8]],
    ['ters çapraz', 'OOX.X.X..', [2, 4, 6]],
  ])('%s hattında X kazanır', (_ad, cells, line) => {
    expect(evaluateStatus(b(cells))).toEqual({ kind: 'won', winner: 'X', line })
  })

  it('O kazandığında kazananı O olarak bildirir', () => {
    expect(evaluateStatus(b('OOOXX.X..'))).toEqual({ kind: 'won', winner: 'O', line: [0, 1, 2] })
  })

  it('tahta dolu ve kazanan yoksa draw döner', () => {
    expect(evaluateStatus(b('XXOOOXXOX'))).toEqual({ kind: 'draw' })
  })

  it('tahta dolu ama kazanan varsa won döner (draw değil)', () => {
    expect(evaluateStatus(b('XXXOOXOXO')).kind).toBe('won')
  })

  it('evaluateStatus donmuş hattı döndürür — çağıran motoru bozamaz', () => {
    const status = evaluateStatus(b('XXX......'))
    expect(status.kind).toBe('won')
    if (status.kind !== 'won') return
    expect(Object.isFrozen(status.line)).toBe(true)
  })

  it('karışık hat (iki oyuncu aynı hatta) kazanan saymaz', () => {
    expect(evaluateStatus(b('XXO......')).kind).toBe('playing')
    expect(evaluateStatus(b('XOX.O....')).kind).toBe('playing')
  })
})

describe('evaluateStatus — büyük tahtalar (KK-B22/B23/B24/B25)', () => {
  it('KK-B22: 6x6 K=4te yatay galibiyet tam 4 indeks döner, hepsi kazananın taşı', () => {
    const board = grid(['......', '.XXXX.', '..OO..', '.O....', '......', '......'], C64)
    const status = evaluateStatus(board, C64)
    expect(status).toEqual({ kind: 'won', winner: 'X', line: [7, 8, 9, 10] })
    if (status.kind !== 'won') return
    expect(status.line).toHaveLength(4)
    for (const index of status.line) {
      expect(board[index]).toBe('X')
    }
  })

  it('KK-B22: 11x11 K=5te köşegen galibiyet tam 5 indeks döner', () => {
    const board = grid(
      [
        'X..........',
        '.X.........',
        '..X........',
        '...X.......',
        '....X......',
        'OOOO.......',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
      ],
      C115,
    )
    expect(evaluateStatus(board, C115)).toEqual({
      kind: 'won',
      winner: 'X',
      line: [0, 12, 24, 36, 48],
    })
  })

  it('KK-B22: 6x6 K=5te ters köşegen galibiyet', () => {
    const board = grid(['....X.', '...X..', '..X...', '.X....', 'X.....', 'OOOO..'], C65)
    expect(evaluateStatus(board, C65)).toEqual({
      kind: 'won',
      winner: 'X',
      line: [4, 9, 14, 19, 24],
    })
  })

  it('KK-B23: iki hat aynı anda tamamlanırsa winLines sırasındaki İLK hat döner', () => {
    // 0-1-2-3 yatay ve 0-6-12-18 dikey aynı anda tam; yatay dikeyden önce gelir.
    const board = grid(['XXXX..', 'X.OO..', 'X.OO..', 'X.....', '......', '......'], C64)
    const first = evaluateStatus(board, C64)
    const second = evaluateStatus(board, C64)
    expect(first).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2, 3] })
    expect(second).toEqual(first)
  })

  it('KK-B24 FREESTYLE: K=5 iken 6lı kesintisiz dizi de galibiyettir', () => {
    const board = grid(['XXXXXX', 'OOOO..', '......', '......', '......', '......'], C65)
    const status = evaluateStatus(board, C65)
    expect(status.kind).toBe('won')
    if (status.kind !== 'won') return
    // Raporlanan hat dizinin İLK BEŞ indeksidir — pencere tarama sırası gereği.
    expect([...status.line]).toEqual([0, 1, 2, 3, 4])
    expect(status.line).toHaveLength(5)
  })

  it('KK-B24: overline ortada başlarsa da ilk pencere raporlanır', () => {
    const board = grid(['......', '......', '......', '......', '......', 'XXXXXX'], C65)
    const status = evaluateStatus(board, C65)
    expect(status.kind).toBe('won')
    if (status.kind !== 'won') return
    expect([...status.line]).toEqual([30, 31, 32, 33, 34])
  })

  it('K-1 uzunluğunda dizi kazandırmaz', () => {
    const board = grid(['XXXX..', 'OOO...', '......', '......', '......', '......'], C65)
    expect(evaluateStatus(board, C65).kind).toBe('playing')
  })

  it('KK-B25: 121 taşlı dolu 11x11 tahtada kazanan yoksa draw döner', () => {
    // Her satır 'XXOO' örüntüsünü satır indeksine göre kaydırır; 11 asal
    // olduğu için hiçbir yönde 5 kesintisiz aynı taş oluşmaz.
    const pattern: readonly Cell[] = ['X', 'X', 'O', 'O']
    const cells: Cell[] = []
    for (let r = 0; r < 11; r += 1) {
      for (let c = 0; c < 11; c += 1) {
        cells.push(pattern[(c + r * 2) % 4] ?? null)
      }
    }
    const board = boardFromCells(cells, C115)
    expect(board).toHaveLength(121)
    expect(board.every((cell) => cell !== null)).toBe(true)
    expect(evaluateStatus(board, C115)).toEqual({ kind: 'draw' })
  })

  it('11x11 boş tahtada playing döner ve sıra Xtedir', () => {
    expect(evaluateStatus(emptyBoard(C115), C115)).toEqual({ kind: 'playing', turn: 'X' })
  })
})

describe('wouldWin — hızlı yol (hat tablosuna BAKMAZ)', () => {
  it('3x3te kazanma hücresini bulur', () => {
    expect(wouldWin(b('XX.......'), 2, 'X')).toBe(true)
  })

  it('kazandırmayan hücrede false döner', () => {
    expect(wouldWin(b('XX.......'), 5, 'X')).toBe(false)
  })

  it('rakibin taşı diziyi böler', () => {
    // 0'da X, 1'de O; 2'ye oynayan X'in geriye taraması O'da durur.
    expect(wouldWin(b('XO.......'), 2, 'X')).toBe(false)
    // Aynı hücre O için de kazandırmaz (tek taş + boş).
    expect(wouldWin(b('XO.......'), 2, 'O')).toBe(false)
  })

  it('her dört yönü de tarar', () => {
    expect(wouldWin(b('X.X......'), 1, 'X')).toBe(true) // yatay
    expect(wouldWin(b('X..X.....'), 6, 'X')).toBe(true) // dikey
    expect(wouldWin(b('X...X....'), 8, 'X')).toBe(true) // köşegen ↘
    expect(wouldWin(b('..X.X....'), 6, 'X')).toBe(true) // köşegen ↙
  })

  it('kenarda taşma yoktur — satır sonu bir sonraki satıra bağlanmaz', () => {
    // 2 ve 3 yan yana görünür (indeks olarak) ama farklı satırlardadır.
    expect(wouldWin(b('..XX.....'), 4, 'X')).toBe(false)
    expect(wouldWin(b('..X.X....'), 3, 'X')).toBe(false)
  })

  it('her yönde İKİ tarafa birden bakar — hücre dizinin ortasındadır', () => {
    expect(wouldWin(b('X.X......'), 1, 'X')).toBe(true)
    expect(wouldWin(b('.XX......'), 0, 'X')).toBe(true)
    expect(wouldWin(b('XX.......'), 2, 'X')).toBe(true)
  })

  it('sınır taramaları dört kenarda da durur', () => {
    const board = emptyBoard()
    expect(wouldWin(board, 0, 'X')).toBe(false) // sol/üst kenar
    expect(wouldWin(board, 8, 'X')).toBe(false) // sağ/alt kenar
  })

  it('FREESTYLE: 6lı dizi K=5 için de kazandırır', () => {
    const board = grid(['XXXXX.', '......', '......', '......', '......', '......'], C65)
    expect(wouldWin(board, 5, 'X', C65)).toBe(true)
  })

  it('11x11 K=5te köşegen tamamlamayı bulur', () => {
    const board = grid(
      [
        'X..........',
        '.X.........',
        '..X........',
        '...........',
        '....X......',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
      ],
      C115,
    )
    expect(wouldWin(board, 36, 'X', C115)).toBe(true)
    expect(wouldWin(board, 36, 'O', C115)).toBe(false)
  })
})

/**
 * KK-B26 — İKİ BAĞIMSIZ UYGULAMANIN BİRBİRİNİ DENETLEMESİ.
 *
 * `evaluateStatus` hat tablosunu tarar, `wouldWin` son taşın komşuluğunu.
 * Biri diğerinden TÜRETİLMEZ. Denklik, tohumlu bir üreteçle sabitlenmiş
 * 500 POZİSYONLUK korpusun tamamında iddia edilir. Bu test SİLİNEMEZ,
 * örneklem DÜŞÜRÜLEMEZ (ADR-0012 §5).
 */
describe('KK-B26: wouldWin ↔ evaluateStatus denkliği (500 pozisyon)', () => {
  const CORPUS_SIZE = 500

  /** Mulberry32 — tohumlu, platformdan bağımsız, yeniden üretilebilir. */
  const seeded = (seed: number): (() => number) => {
    let state = seed >>> 0
    return () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const CONFIGS: readonly BoardConfig[] = [C33, C64, C65, C115]

  /** Listeden tohumlu seçim. Boş liste bir test kurgusu hatasıdır, sessiz geçmez. */
  const pick = <T>(items: readonly T[], rng: () => number): T => {
    const value = items[Math.floor(rng() * items.length)]
    if (value === undefined) throw new Error('boş listeden seçim yapılamaz')
    return value
  }

  interface Probe {
    board: Board
    config: BoardConfig
    index: number
    player: 'X' | 'O'
  }

  /** Kurallı rastgele oyunla üretilmiş, HENÜZ BİTMEMİŞ bir pozisyon. */
  const buildCorpus = (): Probe[] => {
    const rng = seeded(20260826)
    const probes: Probe[] = []
    while (probes.length < CORPUS_SIZE) {
      const config = pick(CONFIGS, rng)
      const total = config.size * config.size
      const cells: Cell[] = Array.from({ length: total }, () => null)
      const plies = Math.floor(rng() * Math.min(total, 24))
      let board = boardFromCells(cells, config)
      let player: 'X' | 'O' = 'X'
      let alive = true
      for (let i = 0; i < plies && alive; i += 1) {
        const empty: number[] = []
        for (let j = 0; j < total; j += 1) {
          if (board[j] === null) empty.push(j)
        }
        const chosen = pick(empty, rng)
        const next = [...board]
        next[chosen] = player
        board = boardFromCells(next, config)
        player = player === 'X' ? 'O' : 'X'
        if (evaluateStatus(board, config).kind !== 'playing') alive = false
      }
      if (!alive) continue
      const empty: number[] = []
      for (let j = 0; j < total; j += 1) {
        if (board[j] === null) empty.push(j)
      }
      const index = pick(empty, rng)
      probes.push({ board, config, index, player: rng() < 0.5 ? 'X' : 'O' })
    }
    return probes
  }

  it('500 pozisyonun TAMAMINDA iki uygulama aynı cevabı verir', () => {
    const probes = buildCorpus()
    expect(probes).toHaveLength(CORPUS_SIZE)

    let wins = 0
    const mismatches: string[] = []
    for (const probe of probes) {
      const fast = wouldWin(probe.board, probe.index, probe.player, probe.config)
      const next = [...probe.board]
      next[probe.index] = probe.player
      const status = evaluateStatus(boardFromCells(next, probe.config), probe.config)
      const authoritative = status.kind === 'won' && status.winner === probe.player
      if (fast) wins += 1
      if (fast !== authoritative) {
        mismatches.push(
          `${String(probe.config.size)}x${String(probe.config.winLength)} @${String(probe.index)} ${probe.player}`,
        )
      }
    }

    expect(mismatches).toEqual([])
    // NEGATİF KONTROL: korpus hem kazandıran hem kazandırmayan hamle içermeli,
    // yoksa "ikisi de hep false" gibi anlamsız bir yeşil olurdu.
    expect(wins).toBeGreaterThan(0)
    expect(wins).toBeLessThan(CORPUS_SIZE)
  })
})
