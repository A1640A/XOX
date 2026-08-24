import { describe, expect, it } from 'vitest'
import { EMPTY_BOARD, boardFromCells, cellAt } from './board'
import { InvalidMoveError } from './errors'
import { applyMove, isValidMove } from './moves'
import type { Board } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

describe('isValidMove', () => {
  it('boş hücre için true döner', () => {
    expect(isValidMove(EMPTY_BOARD, 4)).toBe(true)
  })

  it('dolu hücre için false döner', () => {
    expect(isValidMove(b('....X....'), 4)).toBe(false)
  })

  it('sınırdaki geçerli indeksler için true döner', () => {
    expect(isValidMove(EMPTY_BOARD, 0)).toBe(true)
    expect(isValidMove(EMPTY_BOARD, 8)).toBe(true)
  })

  it('aralık dışı indeks için false döner', () => {
    expect(isValidMove(EMPTY_BOARD, -1)).toBe(false)
    expect(isValidMove(EMPTY_BOARD, 9)).toBe(false)
  })

  it('tam sayı olmayan indeks için false döner', () => {
    expect(isValidMove(EMPTY_BOARD, 1.5)).toBe(false)
  })
})

describe('applyMove', () => {
  it('yeni tahta döner, girdiyi değiştirmez', () => {
    const before = EMPTY_BOARD
    const after = applyMove(before, 0, 'X')
    expect(cellAt(after, 0)).toBe('X')
    expect(cellAt(before, 0)).toBeNull()
  })

  it('dolu hücrede InvalidMoveError atar', () => {
    expect(() => applyMove(b('X........'), 0, 'O')).toThrow(
      expect.objectContaining({ name: 'InvalidMoveError', reason: 'occupied' }),
    )
  })

  it('aralık dışı indekste InvalidMoveError atar', () => {
    try {
      applyMove(EMPTY_BOARD, 9, 'X')
      expect.unreachable('hata atmalıydı')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMoveError)
      expect((error as InvalidMoveError).reason).toBe('out-of-range')
    }
  })

  it('tam sayı olmayan indekste InvalidMoveError atar', () => {
    expect(() => applyMove(EMPTY_BOARD, 2.5, 'X')).toThrow(InvalidMoveError)
  })

  it('tam sayı olmayan indeksi occupied değil out-of-range sayar', () => {
    expect(() => applyMove(EMPTY_BOARD, 2.5, 'X')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('negatif indeksi occupied değil out-of-range sayar', () => {
    expect(() => applyMove(EMPTY_BOARD, -1, 'X')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })
})
