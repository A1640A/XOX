import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  EMPTY_BOARD,
  availableMoves,
  boardFromCells,
  cellAt,
  nextPlayer,
} from './board'
import type { Board } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

describe('EMPTY_BOARD', () => {
  it('dokuz boş hücreden oluşur', () => {
    expect(EMPTY_BOARD).toHaveLength(BOARD_SIZE)
    expect(EMPTY_BOARD.every((c) => c === null)).toBe(true)
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
