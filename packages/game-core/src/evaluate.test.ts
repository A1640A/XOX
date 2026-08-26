import { describe, expect, it } from 'vitest'
import { DEFENSE_BIAS } from './ai-config'
import { boardFromCells } from './board'
import type { BoardConfig } from './config'
import { evaluateBoard, opponentOf, orderMoves, windowsThrough } from './evaluate'
import type { Board, Player } from './types'

const SIX_FOUR: BoardConfig = { size: 6, winLength: 4 }

const b = (cells: string, config: BoardConfig = SIX_FOUR): Board =>
  boardFromCells(
    Array.from(cells).map((c) => (c === '.' ? null : (c as 'X' | 'O'))),
    config,
  )

/** `size × size` uzunlukta, verilen indekslere taş konmuş metin tahta. */
const withStones = (config: BoardConfig, stones: Readonly<Record<number, 'X' | 'O'>>): string =>
  Array.from({ length: config.size * config.size }, (_unused, i) => stones[i] ?? '.').join('')

describe('opponentOf', () => {
  it('iki taşı birbirine çevirir', () => {
    expect(opponentOf('X')).toBe('O')
    expect(opponentOf('O')).toBe('X')
  })
})

describe('evaluateBoard — pencere ağırlığı', () => {
  /**
   * ÇIPLAK beklenti, elle sayıldı. (6,4)'te köşedeki tek taş üç CANLI pencereye
   * girer: yatay (0,0)-(0,3), dikey (0,0)-(3,0), köşegen ↘ (0,0)-(3,3).
   * Köşegen ↙ hiç pencere vermez — (0,0)'dan sola-aşağı giden dört hücre
   * tahtanın dışındadır. Üç pencere × WINDOW_WEIGHT[1] = 3.
   *
   * (3,3) BİLEREK kullanılmadı: orada N − K = 0 olduğu için pencere sayımının
   * sütun terimi nötr elemana düşer ve hiçbir şey ölçmez (gotchas, "Parametrik
   * üreticide sıfır olan terim").
   */
  it('köşedeki tek taş üç canlı pencere üretir', () => {
    expect(evaluateBoard(b(withStones(SIX_FOUR, { 0: 'X' })), 'X', SIX_FOUR)).toBe(3)
  })

  it('rakip taşı DEFENSE_BIAS ile cezalandırılır', () => {
    expect(evaluateBoard(b(withStones(SIX_FOUR, { 0: 'X' })), 'O', SIX_FOUR)).toBeCloseTo(
      -3 * DEFENSE_BIAS,
      9,
    )
  })

  /**
   * (2,2) merkeze yakın: yatay 3, dikey 3, köşegen ↘ 3, köşegen ↙ 2 pencere.
   * ↙ yönünde ilk deneme ((2,2) başlangıçlı pencere) tahtanın dışına taşar ve
   * ATLANIR — ama arkadaki (1,3) ve (0,4) başlangıçları GEÇERLİDİR, yani
   * "dışarı taştı, döngüyü bitir" yanlış olurdu.
   */
  it('merkeze yakın taş 11 canlı pencere üretir', () => {
    expect(evaluateBoard(b(withStones(SIX_FOUR, { 14: 'X' })), 'X', SIX_FOUR)).toBe(11)
  })

  it('rakip taşı olan pencere ÖLÜDÜR — iki tarafa da puan vermez', () => {
    // X(0,0) + O(0,1): ortak yatay pencere (0,0)-(0,3) ölür.
    // X'e kalan: dikey + köşegen ↘ = 2. O'ya kalan: kendi üç penceresi = 3.
    expect(evaluateBoard(b(withStones(SIX_FOUR, { 0: 'X', 1: 'O' })), 'X', SIX_FOUR)).toBeCloseTo(
      2 - 3 * DEFENSE_BIAS,
      9,
    )
  })

  it('yan yana iki taş tek pencerede WINDOW_WEIGHT[2] alır — pencere İKİ KEZ sayılmaz', () => {
    // (0,0)-(0,3) penceresi iki taşı da içerir: 8. Kalan beş pencere birer taş.
    expect(evaluateBoard(b(withStones(SIX_FOUR, { 0: 'X', 1: 'X' })), 'X', SIX_FOUR)).toBe(13)
  })

  it('boş tahtada puan sıfırdır', () => {
    expect(evaluateBoard(b(withStones(SIX_FOUR, {})), 'X', SIX_FOUR)).toBe(0)
  })
})

describe('windowsThrough — artımlı değerlendirmenin dayanağı', () => {
  it('köşedeki hücreden geçen üç pencereyi sayar', () => {
    expect(windowsThrough(b(withStones(SIX_FOUR, { 0: 'X' })), SIX_FOUR, 0, 'X')).toBe(3)
  })

  /**
   * DEĞİŞMEZ (arama motorunun tamamı buna dayanır): bir hücreye taş konunca
   * tahtanın TOPLAM puanındaki değişim, YALNIZ o hücreden geçen pencerelerin
   * puanındaki değişime eşittir. Yani `searchMove` her düğümde tam tahtayı
   * yeniden taramak zorunda değildir.
   *
   * Sonda gerçek bir oyun akışıdır (tohumlu, deterministik): 6×6 K4'te 24
   * hamlelik bir dizi boyunca her adımda iki hesap KARŞILAŞTIRILIR.
   */
  it('artımlı fark tam taramanın farkına EŞİTTİR', () => {
    const config = SIX_FOUR
    const cells: ('X' | 'O')[] = []
    const stones: Record<number, 'X' | 'O'> = {}
    let seed = 12345
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }

    for (let step = 0; step < 24; step += 1) {
      let cell = Math.floor(next() * 36)
      while (stones[cell] !== undefined) cell = (cell + 1) % 36
      const player: Player = step % 2 === 0 ? 'X' : 'O'

      const before = b(withStones(config, stones), config)
      const beforeWindows = windowsThrough(before, config, cell, 'X')
      const beforeTotal = evaluateBoard(before, 'X', config)

      stones[cell] = player
      cells.push(player)
      const after = b(withStones(config, stones), config)

      expect(evaluateBoard(after, 'X', config) - beforeTotal).toBeCloseTo(
        windowsThrough(after, config, cell, 'X') - beforeWindows,
        9,
      )
    }

    expect(cells).toHaveLength(24)
  })
})

describe('orderMoves — kazandıran > bloklayan > örüntü > merkeze yakınlık', () => {
  // (0,0)-(0,2) X, (1,0)-(1,2) O. 3 = X'in kazanma hücresi, 9 = O'nun
  // kazanma hücresi (yani X'in bloklama hücresi), 12 = yalnız örüntü,
  // 35 = ıssız köşe.
  const tacticalBoard = b('XXX...OOO...' + '.'.repeat(24))

  it('dört sınıfı sırasıyla dizer', () => {
    expect(orderMoves(tacticalBoard, [35, 12, 9, 3], 'X', SIX_FOUR)).toEqual([3, 9, 12, 35])
  })

  it('örüntüsü eşit hamlelerde merkeze yakın olan öne geçer', () => {
    const board = b(withStones(SIX_FOUR, { 0: 'X' }))
    expect(orderMoves(board, [35, 21], 'X', SIX_FOUR)).toEqual([21, 35])
  })

  it('her şeyi eşit hamlelerde küçük indeks öne geçer', () => {
    const board = b(withStones(SIX_FOUR, { 0: 'X' }))
    expect(orderMoves(board, [30, 5], 'X', SIX_FOUR)).toEqual([5, 30])
  })

  it('girdi dizisini DEĞİŞTİRMEZ', () => {
    const moves = [35, 12, 9, 3]
    orderMoves(tacticalBoard, moves, 'X', SIX_FOUR)
    expect(moves).toEqual([35, 12, 9, 3])
  })
})
