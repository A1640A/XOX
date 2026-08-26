import { describe, expect, it } from 'vitest'
import {
  AI_NODE_BUDGET,
  CANDIDATE_RADIUS,
  MAX_SEARCH_DEPTH,
  NODE_CHECK_INTERVAL,
} from './ai-config'
import { boardFromCells } from './board'
import { cellCount, colOf, rowOf } from './config'
import type { BoardConfig } from './config'
import { candidateMoves, searchMove } from './search'
import type { SearchResult } from './search'
import { evaluateStatus, wouldWin } from './status'
import type { Board, Cell, Player } from './types'

const SIX_FOUR: BoardConfig = { size: 6, winLength: 4 }
const SIX_FIVE: BoardConfig = { size: 6, winLength: 5 }
const ELEVEN_FOUR: BoardConfig = { size: 11, winLength: 4 }
const ELEVEN_FIVE: BoardConfig = { size: 11, winLength: 5 }
const ELEVEN_SIX: BoardConfig = { size: 11, winLength: 6 }

/** Desteklenen bütün N > 3 kombinasyonları — `BOARD_MODES`'un N > 3 kısmı. */
const LARGE_CONFIGS: readonly BoardConfig[] = [
  SIX_FOUR,
  SIX_FIVE,
  ELEVEN_FOUR,
  ELEVEN_FIVE,
  ELEVEN_SIX,
]

const build = (config: BoardConfig, stones: ReadonlyMap<number, Player>): Board =>
  boardFromCells(
    Array.from({ length: cellCount(config) }, (_unused, i): Cell => stones.get(i) ?? null),
    config,
  )

const emptyOf = (config: BoardConfig): Board => build(config, new Map())

const fromString = (cells: string, config: BoardConfig): Board =>
  boardFromCells(
    Array.from(cells).map((c): Cell => (c === '.' ? null : (c as Player))),
    config,
  )

/** Duran saat: duvar saati bütçesi ASLA dolmaz, yalnız düğüm bütçesi konuşur. */
const frozenClock = (): (() => number) => (): number => 0

describe('candidateMoves — Chebyshev ≤ CANDIDATE_RADIUS (KK-B45)', () => {
  it('tamamen boş tahtada tek aday MERKEZDİR', () => {
    expect(candidateMoves(emptyOf(ELEVEN_FIVE), ELEVEN_FIVE)).toEqual([60])
    expect(candidateMoves(emptyOf(SIX_FOUR), SIX_FOUR)).toEqual([21])
  })

  /**
   * SONDA (ADR-0013 §2): 11×11'de tek taş varken aday sayısı 5×5 − 1 = 24'tür,
   * 121 DEĞİL. Yarıçap 1 mutantı 8, yarıçap 3 mutantı 48 verir — ikisi de bu
   * çıplak listeyle ölür.
   */
  it('11×11 tek taşta 24 aday üretir — 121 değil', () => {
    const board = build(ELEVEN_FIVE, new Map([[60, 'X']]))
    const moves = candidateMoves(board, ELEVEN_FIVE)

    expect(moves).toHaveLength(24)
    expect(moves).toEqual([
      36, 37, 38, 39, 40, 47, 48, 49, 50, 51, 58, 59, 61, 62, 69, 70, 71, 72, 73, 80, 81, 82, 83,
      84,
    ])
  })

  it('köşedeki taşta kutu tahtayla kırpılır', () => {
    const board = build(ELEVEN_FIVE, new Map([[0, 'O']]))
    expect(candidateMoves(board, ELEVEN_FIVE)).toEqual([1, 2, 11, 12, 13, 22, 23, 24])
  })

  it('her aday bir taşa en fazla CANDIDATE_RADIUS uzaklıktadır', () => {
    const stones = new Map<number, Player>([
      [0, 'X'],
      [60, 'O'],
    ])
    const board = build(ELEVEN_FIVE, stones)
    for (const move of candidateMoves(board, ELEVEN_FIVE)) {
      const distances = [...stones.keys()].map((stone) =>
        Math.max(
          Math.abs(rowOf(move, ELEVEN_FIVE) - rowOf(stone, ELEVEN_FIVE)),
          Math.abs(colOf(move, ELEVEN_FIVE) - colOf(stone, ELEVEN_FIVE)),
        ),
      )
      expect(Math.min(...distances)).toBeLessThanOrEqual(CANDIDATE_RADIUS)
    }
  })

  it('dolu tahtada aday kalmaz', () => {
    const stones = new Map<number, Player>(
      Array.from({ length: cellCount(SIX_FOUR) }, (_unused, i): [number, Player] => [
        i,
        i % 2 === 0 ? 'X' : 'O',
      ]),
    )
    expect(candidateMoves(build(SIX_FOUR, stones), SIX_FOUR)).toEqual([])
  })
})

/**
 * KURULMUŞ tehdit pozisyonları — rastgele DEĞİL.
 *
 * Sabit bir çıpaya K uzunlukta bir pencere yerleştirilir; pencerenin `gap`
 * dışındaki bütün hücreleri `owner`'ın taşıdır ve pencerenin iki ucundaki
 * (tahtada varsa) hücreler rakip taşıyla KAPATILIR. Böylece `gap` o pozisyonun
 * TEK kazanma hücresidir — "en küçük indeksi seçti, tesadüfen doğruydu" gibi
 * bir yanlış yeşil imkânsızdır.
 */
const DIRECTIONS = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
] as const

interface Threat {
  readonly board: Board
  readonly gap: number
}

const threats = (config: BoardConfig, owner: Player): Threat[] => {
  const n = config.size
  const k = config.winLength
  const other: Player = owner === 'X' ? 'O' : 'X'
  const out: Threat[] = []

  for (const { dr, dc } of DIRECTIONS) {
    const startRow = dr === 0 ? Math.floor(n / 2) : 0
    const startCol = dc === 1 ? 0 : dc === -1 ? k - 1 : Math.floor(n / 2)

    for (let gapAt = 0; gapAt < k; gapAt += 1) {
      const stones = new Map<number, Player>()
      for (let i = 0; i < k; i += 1) {
        if (i === gapAt) continue
        stones.set((startRow + i * dr) * n + (startCol + i * dc), owner)
      }
      for (const cap of [-1, k]) {
        const r = startRow + cap * dr
        const c = startCol + cap * dc
        if (r >= 0 && r < n && c >= 0 && c < n) stones.set(r * n + c, other)
      }
      out.push({
        board: build(config, stones),
        gap: (startRow + gapAt * dr) * n + (startCol + gapAt * dc),
      })
    }
  }

  return out
}

describe('taktik tarama — bütçeden BAĞIMSIZ (KK-B46)', () => {
  for (const config of LARGE_CONFIGS) {
    const label = `${String(config.size)}×${String(config.size)} K${String(config.winLength)}`

    it(`${label}: kazanma hücresini alır — 1 ms bütçede de tam bütçede de`, () => {
      const cases = threats(config, 'X')
      expect(cases.length).toBeGreaterThanOrEqual(10)

      for (const { board, gap } of cases) {
        expect(evaluateStatus(board, config).kind).toBe('playing')
        expect(searchMove(board, 'X', { config }).move).toBe(gap)
        expect(searchMove(board, 'X', { config, budgetMs: 1, now: () => Date.now() }).move).toBe(
          gap,
        )
      }
    })

    it(`${label}: rakibin kazanmasını bloklar — 1 ms bütçede de tam bütçede de`, () => {
      const cases = threats(config, 'O')
      expect(cases.length).toBeGreaterThanOrEqual(10)

      for (const { board, gap } of cases) {
        expect(evaluateStatus(board, config).kind).toBe('playing')
        expect(searchMove(board, 'X', { config }).move).toBe(gap)
        expect(searchMove(board, 'X', { config, budgetMs: 1, now: () => Date.now() }).move).toBe(
          gap,
        )
      }
    })
  }

  /**
   * İki tehdit AYNI ANDA: X (2,0)-(2,1)-(2,2) yatay üçlüsünü 15'te kapatarak
   * kazanır, O (0,5)-(1,5)-(2,5) dikey üçlüsünü 23'te kapatarak kazanır.
   * Kazanma hücresi (15) bloklama hücresinden (23) KÜÇÜK indeksli seçilmedi
   * diye değil, taktik taramanın sırası "önce kazan" olduğu için 15 döner —
   * ama iki `find` çağrısının sırası ters çevrilirse bu test kırmızıya döner.
   */
  it('kazanmayı bloklamaya TERCİH eder', () => {
    const stones = new Map<number, Player>([
      [12, 'X'],
      [13, 'X'],
      [14, 'X'],
      [5, 'O'],
      [11, 'O'],
      [17, 'O'],
    ])
    const board = build(SIX_FOUR, stones)
    expect(wouldWin(board, 15, 'X', SIX_FOUR)).toBe(true)
    expect(wouldWin(board, 23, 'O', SIX_FOUR)).toBe(true)
    const result = searchMove(board, 'X', { config: SIX_FOUR })
    expect(result).toEqual({ move: 15, nodes: 0, depth: 0 })
  })
})

describe('bütçe — düğüm sayacı YAPISAL, duvar saati enjekte edilir (KK-B44)', () => {
  const midGame = (): Board =>
    build(
      ELEVEN_FIVE,
      new Map<number, Player>([
        [48, 'X'],
        [60, 'O'],
        [62, 'X'],
        [71, 'O'],
        [83, 'X'],
        [39, 'O'],
      ]),
    )

  /**
   * Düğüm bütçesi HER düğümde okunur, o yüzden bir tahmin değil YAPISAL bir
   * üst sınırdır: sayaç sınıra DEĞDİĞİ anda durur, aşmaz. `>=` yerine `>`
   * yazılsaydı 501 düğüm gezilirdi.
   *
   * Bütçe burada ENJEKTE EDİLİYOR (500), çünkü gerçek `AI_NODE_BUDGET`
   * (30 000) enstrümante edilmiş kodda mutasyon koşusunu dakikalara çıkarıyor.
   * VARSAYILANIN gerçekten `AI_NODE_BUDGET` olduğunu `search-corpus-*.test.ts`
   * dosyaları hiçbir bütçe geçirmeden doğrular.
   */
  it('düğüm bütçesi YAPISAL üst sınırdır — sınıra DEĞER, aşmaz', () => {
    const result = searchMove(midGame(), 'X', {
      config: ELEVEN_FIVE,
      now: frozenClock(),
      nodeBudget: 500,
    })
    expect(result.nodes).toBe(500)
    expect(result.nodes).toBeLessThanOrEqual(AI_NODE_BUDGET)
  })

  it('bütçe 1 msye düşürülünce yine GEÇERLİ bir hamle döner ve hata FIRLATMAZ', () => {
    let tick = 0
    const result = searchMove(midGame(), 'X', {
      config: ELEVEN_FIVE,
      budgetMs: 1,
      nodeBudget: 3000,
      now: () => tick++,
    })
    expect(candidateMoves(midGame(), ELEVEN_FIVE)).toContain(result.move)
    expect(result.nodes).toBe(NODE_CHECK_INTERVAL)
  })

  /**
   * Sınır DAHİLDİR. Saat ilk çağrıda 0, sonra HER ZAMAN tam olarak `deadline`
   * döner: `>=` ile arama ilk kontrolde (1024. düğüm) durur, `>` ile HİÇ
   * durmaz ve düğüm bütçesine (burada 3000) kadar koşardı.
   */
  it('süre kontrolü SINIRA DAHİLDİR — now() tam olarak deadline ise durur', () => {
    let calls = 0
    const result = searchMove(midGame(), 'X', {
      config: ELEVEN_FIVE,
      budgetMs: 1000,
      nodeBudget: 3000,
      now: () => (calls++ === 0 ? 0 : 1000),
    })
    expect({ nodes: result.nodes, depth: result.depth }).toEqual({
      nodes: NODE_CHECK_INTERVAL,
      depth: 2,
    })
  })

  /**
   * YARIM İTERASYON ATILIR. Üç koşu, aynı (6,4) pozisyonu, yalnız bütçe farklı:
   *
   *    200 düğüm → derinlik 2 BİTER, hamle 14
   *   1200 düğüm → derinlik 3'ün ORTASINDA kesilir; ALTI KAT düğüm harcanmış
   *                olmasına rağmen hamle hâlâ 14 — yarım iterasyon ATILDI
   *   1400 düğüm → derinlik 3 BİTER ve hamle 15'e döner
   *
   * Üçüncü koşu ikincisinin neden önemli olduğunu gösterir: atılan iterasyon
   * gerçekten BAŞKA bir hamle üretecek iterasyondu.
   */
  it('YARIM İTERASYON ATILIR — biten en derin iterasyonun hamlesi döner', () => {
    const board = fromString('.....X.XO.........................O.', SIX_FOUR)
    const run = (nodeBudget: number): SearchResult =>
      searchMove(board, 'X', { config: SIX_FOUR, now: frozenClock(), nodeBudget })

    expect(run(200)).toEqual({ move: 14, nodes: 200, depth: 2 })
    expect(run(1200)).toEqual({ move: 14, nodes: 1200, depth: 2 })
    expect(run(1400)).toEqual({ move: 15, nodes: 1400, depth: 3 })
  })

  it('varsayılan saat Date.now — enjekte edilmezse gerçek zaman kullanılır', () => {
    const result = searchMove(midGame(), 'X', {
      config: ELEVEN_FIVE,
      budgetMs: 0,
      nodeBudget: 3000,
    })
    expect(result.nodes).toBe(NODE_CHECK_INTERVAL)
    expect(candidateMoves(midGame(), ELEVEN_FIVE)).toContain(result.move)
  })
})

describe('arama — determinizm ve derinlik cezası', () => {
  it('aynı girdi aynı hamleyi verir — hiç rastgelelik yok', () => {
    const board = build(
      ELEVEN_FOUR,
      new Map<number, Player>([
        [60, 'X'],
        [61, 'O'],
        [72, 'X'],
      ]),
    )
    const options = { config: ELEVEN_FOUR, now: frozenClock(), nodeBudget: 800 }
    const first = searchMove(board, 'O', options)
    const second = searchMove(board, 'O', options)
    expect(second).toEqual(first)
  })

  it('tahta dolarken beraberliği görür ve hata fırlatmaz', () => {
    // 6×6 K5: tek boş hücre, hiçbir hat tamamlanmıyor.
    const pattern = 'XXOOXX' + 'OOXXOO' + 'XXOOXX' + 'OOXXOO' + 'XXOOXX' + 'OOXXO.'
    const board = boardFromCells(
      Array.from(pattern).map((c) => (c === '.' ? null : (c as Player))),
      SIX_FIVE,
    )
    expect(evaluateStatus(board, SIX_FIVE).kind).toBe('playing')
    const result = searchMove(board, 'X', { config: SIX_FIVE, now: frozenClock() })
    // Tek aday, tek yaprak: beş düğüm. Derinlik MAX_SEARCH_DEPTH'te DURUR —
    // döngü `<=` yerine `<` ya da sınır MAX+1 olsaydı bu sayı 5 ya da 7 olurdu.
    expect(result).toEqual({ move: 35, nodes: 5, depth: MAX_SEARCH_DEPTH })
  })

  /**
   * DERİNLİK CEZASI (`TERMINAL_SCORE − ply`): erken kazanç geç kazançtan
   * iyidir. Bu pozisyon sondayla SEÇİLDİ, uydurulmadı — (6,4) korpusunun
   * 202 pozisyonu iki motorla (cezalı / cezası ters çevrilmiş) taranıp
   * ayrışan pozisyonlardan biri alındı.
   *
   * Taktik tarama burada DEVRE DIŞI: iki tarafın da tek hamlelik kazancı yok,
   * karar tamamen aramanındır ve derinlik 5 tamamlanır. `TERMINAL_SCORE − ply`
   * `TERMINAL_SCORE + ply` olduğunda motor 8 yerine 1'i oynuyor (ölçüldü),
   * yani aynı kazancı DAHA GEÇE erteliyor.
   */
  it('TERMINAL_SCORE derinlik cezalıdır — geç kazanç erken kazançtan düşüktür', () => {
    const board = fromString('...X..O....X..OXX.O...X....OO...X.O.', SIX_FOUR)
    expect(candidateMoves(board, SIX_FOUR).some((m) => wouldWin(board, m, 'X', SIX_FOUR))).toBe(
      false,
    )
    const result = searchMove(board, 'X', {
      config: SIX_FOUR,
      now: frozenClock(),
      nodeBudget: 6000,
    })
    expect({ move: result.move, depth: result.depth }).toEqual({ move: 8, depth: 5 })
  })

  /**
   * KAYIP PUANI NEGATİFTİR (`ply − TERMINAL_SCORE`). Bu, cezanın simetriği
   * değil AYRI bir iddiadır: işareti ters çevrilirse motor rakibin kazandığı
   * dalları EN YÜKSEK puanlı sanar ve kaybı KOVALAR.
   *
   * Neden hiçbir taktik test bunu yakalamıyor: rakibin TEK hamlelik kazancı
   * varsa taktik tarama zaten bloklayıp dönüyor, yani `ply − TERMINAL_SCORE`
   * kökte hiç değerlendirilmiyor. Terim ancak ply 4/6'da — rakip ply 2'de
   * çifte tehdit kurduğunda — ateşleniyor. O yüzden bu pozisyon da sondayla
   * SEÇİLDİ: işaret ters çevrilmiş motorla taranan ayrışan pozisyonlardan
   * biri. Doğru işaretle 17 (derinlik 4), ters işaretle 21 (derinlik 3)
   * oynanıyor (ölçüldü).
   */
  it('kayıp puanı NEGATİFTİR — motor kaybı kovalamaz', () => {
    const board = fromString('X...OOX...OX......O....XO.X.....OX..', SIX_FOUR)
    const result = searchMove(board, 'X', {
      config: SIX_FOUR,
      now: frozenClock(),
      nodeBudget: 3000,
    })
    expect({ move: result.move, depth: result.depth }).toEqual({ move: 17, depth: 4 })
  })
})
