import { describe, expect, it } from 'vitest'
import { bestMove, chooseMove } from './ai'
import { availableMoves, boardFromCells, emptyBoard } from './board'
import { cellCount } from './config'
import type { BoardConfig } from './config'
import { InvalidMoveError } from './errors'
import { applyMove } from './moves'
import { searchMove } from './search'
import { evaluateStatus } from './status'
import type { Board, Cell, Player } from './types'

/**
 * `chooseMove`in N > 3 dağıtımı. `ai.test.ts`e TEK SATIR eklenmedi: orada
 * KK-B20'nin tümevarımsal yenilmezlik kanıtı duruyor ve o kanıt bugünkü
 * `bestMove` gövdesini koşmaya devam etmeli (ADR-0013 §1). Yeni davranış
 * bu ayrı dosyada sınanır.
 */

const SIX_FOUR: BoardConfig = { size: 6, winLength: 4 }
const ELEVEN_FIVE: BoardConfig = { size: 11, winLength: 5 }
const THREE: BoardConfig = { size: 3, winLength: 3 }

const build = (config: BoardConfig, stones: ReadonlyMap<number, Player>): Board =>
  boardFromCells(
    Array.from({ length: cellCount(config) }, (_unused, i): Cell => stones.get(i) ?? null),
    config,
  )

const fromString = (cells: string, config: BoardConfig): Board =>
  boardFromCells(
    Array.from(cells).map((c): Cell => (c === '.' ? null : (c as Player))),
    config,
  )

const seededRng = (values: readonly number[]): (() => number) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

describe('chooseMove — imza sözleşmesi', () => {
  /**
   * BOŞ 3×3 tahta BİLEREK kullanılmadı: orada `bestMove` 549 945 düğüm gezer ve
   * Stryker'ın enstrümante ettiği kodda dokuz koşucu paralel çalışırken 20 sn
   * sınırını aşıyor (ölçüldü — ilk deneme "dry run" aşamasında patladı). Kısmen
   * dolu bir tahta AYNI kod yolunu koşar, saniyenin altında.
   */
  const partial = boardFromCells(
    Array.from('XOX.O....').map((c): Cell => (c === '.' ? null : (c as Player))),
  )

  it('rng DÖRDÜNCÜ parametredir, konfigürasyon BEŞİNCİ ve opsiyoneldir', () => {
    // Beşinci argüman hiç verilmezse davranış 3×3'tür — bugünkü sözleşme.
    expect(chooseMove(partial, 'X', 'unbeatable')).toBe(bestMove(partial, 'X'))
    expect(chooseMove(partial, 'X', 'unbeatable', Math.random, {})).toBe(bestMove(partial, 'X'))
    expect(chooseMove(partial, 'X', 'unbeatable', Math.random, { config: THREE })).toBe(
      bestMove(partial, 'X'),
    )
    expect(chooseMove(emptyBoard(), 'X', 'easy', seededRng([0.5]))).toBe(4)
  })
})

describe('chooseMove — N > 3 searchMoveye gider (KK-B43)', () => {
  const opening = (config: BoardConfig): Board =>
    build(config, new Map<number, Player>([[cellCount(config) - 1, 'O']]))

  /**
   * Bütçe DÜĞÜM SAYAN sahte saatle daraltılıyor (`budgetMs: 2` → 2048 düğüm).
   * `chooseMove` düğüm bütçesini AÇMAZ (ADR-0013 §1'in üç alanlı sözleşmesi),
   * ama `now` zaten açık ve deterministik. Tam bütçeli (30 000 düğüm) arama
   * Stryker'ın enstrümante ettiği kodda mutasyon koşusunu dakikalara çıkarıyor.
   */
  const tickingClock = (): (() => number) => {
    let tick = 0
    return () => tick++
  }

  it('unbeatable, 6×6te searchMove ile aynı hamleyi verir', () => {
    const board = opening(SIX_FOUR)
    expect(
      chooseMove(board, 'X', 'unbeatable', Math.random, {
        config: SIX_FOUR,
        budgetMs: 2,
        now: tickingClock(),
      }),
    ).toBe(searchMove(board, 'X', { config: SIX_FOUR, budgetMs: 2, now: tickingClock() }).move)
  })

  it('unbeatable, 11×11de searchMove ile aynı hamleyi verir', () => {
    const board = opening(ELEVEN_FIVE)
    expect(
      chooseMove(board, 'X', 'unbeatable', Math.random, {
        config: ELEVEN_FIVE,
        budgetMs: 2,
        now: tickingClock(),
      }),
    ).toBe(searchMove(board, 'X', { config: ELEVEN_FIVE, budgetMs: 2, now: tickingClock() }).move)
  })

  /**
   * `budgetMs` ve `now` gerçekten `searchMove`a GEÇİYOR: aynı pozisyonda 1 ms
   * (1024 düğüm) derinlik 2'de kalıp 14'ü, 2 ms (2048 düğüm) derinlik 3'ü
   * bitirip 15'i oynuyor. İki alandan biri düşürülse iki çağrı aynı hamleyi
   * verirdi.
   */
  it('bütçe ve saat searchMovea GEÇİRİLİR — dar bütçe daha sığ arama verir', () => {
    const board = fromString('.....X.XO.........................O.', SIX_FOUR)
    const pick = (budgetMs: number): number =>
      chooseMove(board, 'X', 'unbeatable', Math.random, {
        config: SIX_FOUR,
        budgetMs,
        now: tickingClock(),
      })
    expect(pick(1)).toBe(14)
    expect(pick(2)).toBe(15)
  })

  it('mediumun "en iyi"si N > 3te searchMovedur; rastgele dalı DEĞİŞMEZ', () => {
    const board = opening(SIX_FOUR)
    expect(
      chooseMove(board, 'X', 'medium', seededRng([0.3]), {
        config: SIX_FOUR,
        budgetMs: 2,
        now: tickingClock(),
      }),
    ).toBe(searchMove(board, 'X', { config: SIX_FOUR, budgetMs: 2, now: tickingClock() }).move)

    // 0.9 → rastgele dal. Sıradaki değer indeks çarpanıdır.
    const moves = availableMoves(board)
    expect(chooseMove(board, 'X', 'medium', seededRng([0.9, 0]), { config: SIX_FOUR })).toBe(
      moves[0],
    )
  })

  it('easy N > 3te de yalnız rastgele oynar', () => {
    const board = opening(ELEVEN_FIVE)
    const moves = availableMoves(board)
    expect(chooseMove(board, 'X', 'easy', seededRng([0]), { config: ELEVEN_FIVE })).toBe(moves[0])
    expect(chooseMove(board, 'X', 'easy', () => 1, { config: ELEVEN_FIVE })).toBe(
      moves[moves.length - 1],
    )
  })

  it('biten oyunda KONFİGÜRASYONA göre hata verir', () => {
    // 6×6 K4: yatay dört taş X'i kazandırır, oyun bitmiştir.
    const won = build(
      SIX_FOUR,
      new Map<number, Player>([
        [0, 'X'],
        [1, 'X'],
        [2, 'X'],
        [3, 'X'],
      ]),
    )
    expect(() => chooseMove(won, 'O', 'unbeatable', Math.random, { config: SIX_FOUR })).toThrow(
      InvalidMoveError,
    )
    expect(() => chooseMove(won, 'O', 'easy', () => 0, { config: SIX_FOUR })).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })
})

describe('N > 3 gerçek oyun — motor kendine karşı', () => {
  /**
   * 6×6 K4'te iki `unbeatable` motor karşı karşıya. Sonda ÜÇ şeyi birden
   * doğrular: (a) her hamle geçerlidir, (b) oyun BİTER, (c) hiçbir hamlede
   * hata fırlamaz. Saat düğüm sayan sahte bir saattir — sonuç makineden
   * bağımsız ve deterministiktir, ayrıca sonda saniyeler değil milisaniyeler
   * sürer.
   *
   * Kazananın X çıkması bir İDDİA değil bir GÖZLEMDİR; 6×6 K4'te ilk oyuncu
   * avantajı bilinen bir olgudur (spec §8.4 dengelemeyi kapsam dışı bıraktı).
   */
  it('6×6 K4te oyun kurallı biçimde biter', () => {
    let tick = 0
    const options = { config: SIX_FOUR, budgetMs: 2, now: (): number => tick++ }
    let board = build(SIX_FOUR, new Map())
    let turn: Player = 'X'
    let plies = 0
    let status = evaluateStatus(board, SIX_FOUR)

    while (status.kind === 'playing') {
      const move = chooseMove(board, turn, 'unbeatable', Math.random, options)
      expect(availableMoves(board)).toContain(move)
      board = applyMove(board, move, turn, SIX_FOUR)
      status = evaluateStatus(board, SIX_FOUR)
      turn = turn === 'X' ? 'O' : 'X'
      plies += 1
    }

    expect(plies).toBeGreaterThan(config4WinLength())
    expect(plies).toBeLessThanOrEqual(cellCount(SIX_FOUR))
    expect(status.kind).not.toBe('playing')
  })
})

/** K'yi tabloya bağlar: en kısa oyun bile K yarım hamleden uzundur. */
function config4WinLength(): number {
  return SIX_FOUR.winLength
}
