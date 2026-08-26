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

/**
 * ⚠️ MEMOİZASYON, TEST SIRASINI SÖZLEŞMEYE ÇEVİRİR (gotcha örüntü 6).
 *
 * `winLines` bir konfigürasyonu yalnız İLK istendiğinde hesaplar; sonraki
 * çağrılar önbellekten döner. Yani üretim kodunu (hat aritmetiği, `Object.freeze`,
 * önbelleğe yazma) GERÇEKTEN çalıştıran tek test, o konfigürasyonu ilk isteyen
 * testtir. Mutasyon koşucusu "hangi test hangi satırı çalıştırdı"ya göre seçim
 * yaptığı için, sonradan gelen bir test ne kadar sıkı iddia ederse etsin o
 * mutantları ÖLDÜREMEZ (ölçüldü: iddialar yerinde dururken skor %94 → %84).
 *
 * Bu yüzden her konfigürasyonun İLK İSTEYENİ, o konfigürasyon hakkında bilinmesi
 * gereken HER ŞEYİ tek testte iddia eder: değerler + sayı + donmuşluk + referans
 * kimliği. Aşağıdaki üç testin SIRASI ve İÇERİĞİ bu yüzden bir sözleşmedir.
 */
describe('winLines', () => {
  it('(3,3) İLK İSTEYEN — KK-B07/B08/B09/B10: değerler, sayı, donmuşluk, kimlik', () => {
    const lines = winLines(C33)

    // KK-B08: ELLE KOPYALANMIŞ sekiz hat, AYNI SIRADA.
    expect(lines.map((line) => [...line])).toEqual(WIN_LINES_3X3)
    expect(lines).toHaveLength(8)

    // KK-B09: dizi ve içindeki hatlar donmuş.
    expect(Object.isFrozen(lines)).toBe(true)
    expect(lines.every((line) => Object.isFrozen(line))).toBe(true)
    expect(() => {
      ;(lines as WinLine[]).push([0, 0, 0])
    }).toThrow(TypeError)
    expect(() => {
      ;(lines[0] as unknown as number[])[0] = 5
    }).toThrow(TypeError)
    expect(evaluateStatus(b('XXX......'))).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2] })

    // KK-B10: memoize — aynı değerli konfigürasyon aynı referansı döner.
    expect(winLines({ size: 3, winLength: 3 })).toBe(lines)
    // Varsayılan konfigürasyon (3,3)tür.
    expect(winLines()).toBe(lines)
  })

  /**
   * (6,4)'ün dört grubunun sınır hatları — hepsi ELLE hesaplanmış, `winLines`'a
   * referanssız. Her grupta `c > 0` olan EN AZ BİR hat vardır; yalnız `c = 0`
   * hatlarına bakan bir tablo, sütun teriminin işaretini bozan bir mutasyonu
   * (`r * n + c` -> `r * n - c`) GÖREMEZDİ — (3,3)'te `c` daima 0'dır.
   *
   * Yerleşim: 0..17 yatay (satır başına 3), 18..35 dikey (sütun başına 3),
   * 36..44 köşegen ↘ (3×3), 45..53 köşegen ↙ (3×3).
   */
  it('(6,4) İLK İSTEYEN — dört grubun sınır hatları, donmuşluk, kimlik', () => {
    const frozen = winLines(C64)
    const lines = frozen.map((line) => [...line])
    expect(lines).toHaveLength(54)

    expect(lines[0]).toEqual([0, 1, 2, 3]) // yatay r=0 c=0
    expect(lines[1]).toEqual([1, 2, 3, 4]) // yatay r=0 c=1
    expect(lines[2]).toEqual([2, 3, 4, 5]) // yatay r=0 c=2
    expect(lines[3]).toEqual([6, 7, 8, 9]) // yatay r=1 c=0
    expect(lines[17]).toEqual([32, 33, 34, 35]) // yatay r=5 c=2

    expect(lines[18]).toEqual([0, 6, 12, 18]) // dikey c=0 r=0
    expect(lines[19]).toEqual([6, 12, 18, 24]) // dikey c=0 r=1
    expect(lines[21]).toEqual([1, 7, 13, 19]) // dikey c=1 r=0
    expect(lines[35]).toEqual([17, 23, 29, 35]) // dikey c=5 r=2

    expect(lines[36]).toEqual([0, 7, 14, 21]) // ↘ r=0 c=0
    expect(lines[37]).toEqual([1, 8, 15, 22]) // ↘ r=0 c=1
    expect(lines[39]).toEqual([6, 13, 20, 27]) // ↘ r=1 c=0
    expect(lines[44]).toEqual([14, 21, 28, 35]) // ↘ r=2 c=2

    expect(lines[45]).toEqual([3, 8, 13, 18]) // ↙ r=0 c=3
    expect(lines[46]).toEqual([4, 9, 14, 19]) // ↙ r=0 c=4
    expect(lines[53]).toEqual([17, 22, 27, 32]) // ↙ r=2 c=5

    expect(Object.isFrozen(frozen)).toBe(true)
    expect(frozen.every((line) => Object.isFrozen(line))).toBe(true)
    expect(winLines({ size: 6, winLength: 4 })).toBe(frozen)
    expect(winLines(C65)).not.toBe(frozen)
  })

  /**
   * Kalan dört kombinasyonun İLK İSTEYENİ. Hat sayıları ÇIPLAK yazılır (KK-B07);
   * donmuşluk ve kimlik aynı testte iddia edilir, çünkü sonraki hiçbir test bu
   * konfigürasyonların üretim kodunu bir daha çalıştırmayacak.
   */
  it.each([
    [6, 5, 32],
    [11, 4, 304],
    [11, 5, 252],
    [11, 6, 204],
  ])('(%i,%i) İLK İSTEYEN — KK-B07: tam %i hat, donmuş, memoize', (size, winLength, expected) => {
    const lines = winLines({ size, winLength })
    expect(lines).toHaveLength(expected)
    expect(Object.isFrozen(lines)).toBe(true)
    expect(lines.every((line) => Object.isFrozen(line))).toBe(true)
    expect(lines.every((line) => line.length === winLength)).toBe(true)
    expect(winLines({ size, winLength })).toBe(lines)
  })

  it('KK-B07: altı kombinasyonun hat sayıları çıplak tabloyla eşleşir', () => {
    const combinations: readonly BoardConfig[] = [
      { size: 3, winLength: 3 },
      { size: 6, winLength: 4 },
      { size: 6, winLength: 5 },
      { size: 11, winLength: 4 },
      { size: 11, winLength: 5 },
      { size: 11, winLength: 6 },
    ]
    expect(combinations.map((config) => winLines(config).length)).toEqual([
      8, 54, 32, 304, 252, 204,
    ])
  })

  it('her hat indeksi kenar aralığındadır', () => {
    for (const line of winLines(C115)) {
      for (const index of line) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(121)
      }
    }
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

  /**
   * E-18 SINIFI: tahta 121 hücre ama tarama {6,4} konfigürasyonuyla yapılıyor.
   * Alt satır sınırı (`r < n`) olmasaydı, tarama konfigürasyonun DIŞINDAKİ
   * gerçek hücreleri okur ve HAYALET GALİBİYET üretirdi — indeksler 30, 36,
   * 42, 48 altı-genişlikte "aynı sütun" gibi görünüyor ama 30 son satırdır.
   */
  it('konfigürasyon-tahta uyuşmazlığında satır sınırı aşılmaz — hayalet galibiyet yok', () => {
    const cells: Cell[] = Array.from({ length: 121 }, () => null)
    for (const index of [24, 30, 36, 42, 48]) cells[index] = 'X'
    const oversized = boardFromCells(cells, C115)

    // {6,4}'e göre 30 son satırın (r=5) ilk hücresidir: aşağı doğru tarama
    // hemen durmalı. Yukarı doğru 24 sayılır -> 2 taş, K=4'e ulaşmaz.
    // `r < n` kaldırılırsa 36/42/48 de sayılır ve 5 taşla hayalet galibiyet olur.
    expect(wouldWin(oversized, 30, 'X', C64)).toBe(false)
    // `r < n` -> `r <= n` sapması TEK fazladan satır okur (36). K=3'te bu tek
    // hücre farkı sonucu çevirir: 24 + 30 + 36 = 3.
    expect(wouldWin(oversized, 30, 'X', { size: 6, winLength: 3 })).toBe(false)
    // POZİTİF KONTROL: aynı tahta, aynı hücre, DOĞRU konfigürasyonla okunduğunda
    // taşlar gerçekten oradadır — "her şey false" gibi anlamsız bir yeşil değil.
    expect(oversized[24]).toBe('X')
    expect(oversized[30]).toBe('X')
    expect(oversized[48]).toBe('X')
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
