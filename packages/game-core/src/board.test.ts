import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  EMPTY_BOARD,
  availableMoves,
  boardFromCells,
  boardToString,
  cellAt,
  nextPlayer,
} from './board'
import type { Board, Cell } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** Tip sistemini aşan girdiyi taklit eder: kalıcı katmandan böyle veri gelebilir. */
const asCells = (values: readonly unknown[]): readonly Cell[] => values as readonly Cell[]

describe('EMPTY_BOARD', () => {
  it('dokuz boş hücreden oluşur', () => {
    expect(EMPTY_BOARD).toHaveLength(BOARD_SIZE)
    expect(EMPTY_BOARD.every((c) => c === null)).toBe(true)
  })

  it('donmuştur — yazma denemesi hata atar ve tahtayı bozmaz', () => {
    expect(Object.isFrozen(EMPTY_BOARD)).toBe(true)
    expect(() => {
      ;(EMPTY_BOARD as unknown as Cell[])[0] = 'X'
    }).toThrow(TypeError)
    expect(cellAt(EMPTY_BOARD, 0)).toBeNull()
  })
})

describe('boardFromCells', () => {
  it('dokuz hücreyi tahtaya çevirir', () => {
    expect(cellAt(b('X........'), 0)).toBe('X')
  })

  it('dokuz olmayan uzunlukta hata atar', () => {
    expect(() => boardFromCells([null, null])).toThrow(RangeError)
  })

  it('hata mesajı beklenen ve gelen hücre sayısını bildirir', () => {
    expect(() => boardFromCells([null, null])).toThrow('Tahta 9 hücre olmalı, 2 geldi')
  })

  it('X, O ve null dolu tahtayı kabul eder', () => {
    expect(boardFromCells(asCells(['X', 'O', null, 'O', 'X', null, null, 'X', 'O']))).toHaveLength(
      BOARD_SIZE,
    )
  })

  it('tanımsız hücre içeren diziyi reddeder — boş sanılan tahta kazanmış görünmesin', () => {
    expect(() => boardFromCells(asCells(Array.from({ length: BOARD_SIZE })))).toThrow(RangeError)
  })

  it('oyuncu olmayan hücre değerini reddeder', () => {
    expect(() => boardFromCells(asCells(['a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g']))).toThrow(
      RangeError,
    )
  })

  it('hata mesajı bozuk hücrenin sırasını ve değerini bildirir', () => {
    expect(() =>
      boardFromCells(asCells([null, 'X', 'O', 'x', null, null, null, null, null])),
    ).toThrow("Tahta hücresi 3 geçersiz: x — yalnız 'X', 'O' veya null olabilir")
  })

  it('küçük harf oyuncu simgesini reddeder', () => {
    expect(() =>
      boardFromCells(asCells(['o', null, null, null, null, null, null, null, null])),
    ).toThrow(RangeError)
  })

  it('son hücredeki bozuk değeri de yakalar', () => {
    expect(() =>
      boardFromCells(asCells([null, null, null, null, null, null, null, null, 0])),
    ).toThrow('Tahta hücresi 8 geçersiz')
  })
})

describe('boardToString', () => {
  it('boş tahtayı dokuz nokta olarak döndürür', () => {
    expect(boardToString(EMPTY_BOARD)).toBe('.........')
  })

  it('her hücreyi X, O ya da nokta olarak yazar', () => {
    expect(boardToString(b('XO.XO.XO.'))).toBe('XO.XO.XO.')
  })

  it('gidiş-dönüş: metne çevrilip boardFromCells ile geri okunan tahta birebir eşittir', () => {
    const board = b('XXO.O.X..')
    expect(b(boardToString(board))).toEqual(board)
  })
})

describe('availableMoves', () => {
  it('boş tahtada dokuz hamle döner', () => {
    expect(availableMoves(EMPTY_BOARD)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('dolu hücreleri atlar', () => {
    expect(availableMoves(b('XO.......'))).toEqual([2, 3, 4, 5, 6, 7, 8])
  })

  it('dolu tahtada boş dizi döner', () => {
    expect(availableMoves(b('XOXOXOXOX'))).toEqual([])
  })
})

describe('nextPlayer', () => {
  it('boş tahtada X ile başlar', () => {
    expect(nextPlayer(EMPTY_BOARD)).toBe('X')
  })

  it('X oynadıktan sonra O sırası', () => {
    expect(nextPlayer(b('X........'))).toBe('O')
  })

  it('eşit sayıda taş varsa X sırası', () => {
    expect(nextPlayer(b('XO.......'))).toBe('X')
  })
})
