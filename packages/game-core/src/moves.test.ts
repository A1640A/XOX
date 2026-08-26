import { describe, expect, it } from 'vitest'
import { boardFromCells, cellAt, emptyBoard } from './board'
import type { BoardConfig } from './config'
import { InvalidMoveError } from './errors'
import { applyMove, isValidMove } from './moves'
import { evaluateStatus } from './status'
import type { Board } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** X 0-1-2 hattıyla kazanmıştır; 5 dahil dört hücre boş durur. */
const wonBoard = 'XXXOO....'

const C115: BoardConfig = { size: 11, winLength: 5 }

describe('isValidMove', () => {
  it('boş hücre için true döner', () => {
    expect(isValidMove(emptyBoard(), 4)).toBe(true)
  })

  it('dolu hücre için false döner', () => {
    expect(isValidMove(b('....X....'), 4)).toBe(false)
  })

  it('sınırdaki geçerli indeksler için true döner', () => {
    expect(isValidMove(emptyBoard(), 0)).toBe(true)
    expect(isValidMove(emptyBoard(), 8)).toBe(true)
  })

  it('aralık dışı indeks için false döner', () => {
    expect(isValidMove(emptyBoard(), -1)).toBe(false)
    expect(isValidMove(emptyBoard(), 9)).toBe(false)
  })

  it('tam sayı olmayan indeks için false döner', () => {
    expect(isValidMove(emptyBoard(), 1.5)).toBe(false)
  })

  it('oyun kazanılmışsa boş hücre için bile false döner', () => {
    expect(cellAt(b(wonBoard), 5)).toBeNull()
    expect(isValidMove(b(wonBoard), 5)).toBe(false)
  })

  it('tahta dolduğunda false döner', () => {
    expect(isValidMove(b('XXOOOXXOX'), 0)).toBe(false)
  })

  it('KK-B27: {11,5}te 120 geçerli, 121 aralık dışıdır', () => {
    const board = emptyBoard(C115)
    expect(isValidMove(board, 120, C115)).toBe(true)
    expect(isValidMove(board, 121, C115)).toBe(false)
  })
})

describe('applyMove', () => {
  it('yeni tahta döner, girdiyi değiştirmez', () => {
    const before = emptyBoard()
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
      applyMove(emptyBoard(), 9, 'X')
      expect.unreachable('hata atmalıydı')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMoveError)
      expect((error as InvalidMoveError).reason).toBe('out-of-range')
    }
  })

  it('tam sayı olmayan indekste InvalidMoveError atar', () => {
    expect(() => applyMove(emptyBoard(), 2.5, 'X')).toThrow(InvalidMoveError)
  })

  it('tam sayı olmayan indeksi occupied değil out-of-range sayar', () => {
    expect(() => applyMove(emptyBoard(), 2.5, 'X')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('negatif indeksi occupied değil out-of-range sayar', () => {
    expect(() => applyMove(emptyBoard(), -1, 'X')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('oyun kazanıldıktan sonra boş hücreye hamleyi reddeder', () => {
    expect(() => applyMove(b(wonBoard), 5, 'O')).toThrow(
      expect.objectContaining({ index: 5, reason: 'game-over' }),
    )
  })

  it('biten oyunda ikinci bir kazanan hat oluşturulamaz', () => {
    // Doğrulanmasaydı 5 hamlesi 3-4-5 hattını da tamamlar ve iki kazananlı,
    // sunucuda onarılamaz bir oyun kaydı üretirdi.
    expect(evaluateStatus(b(wonBoard))).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2] })
    expect(() => applyMove(b(wonBoard), 5, 'O')).toThrow(InvalidMoveError)
  })

  it('biten oyunda dolu hücre için occupied değil game-over bildirir', () => {
    expect(() => applyMove(b(wonBoard), 0, 'O')).toThrow(
      expect.objectContaining({ reason: 'game-over' }),
    )
  })

  it('biten oyunda bile aralık dışı indeks out-of-range kalır', () => {
    expect(() => applyMove(b(wonBoard), 9, 'O')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('beraberlikle dolan tahtada hamleyi reddeder', () => {
    expect(() => applyMove(b('XXOOOXXOX'), 0, 'X')).toThrow(
      expect.objectContaining({ reason: 'game-over' }),
    )
  })

  it('KK-B27: {11,5}te 120 oynanır, 121 out-of-range atar', () => {
    const board = emptyBoard(C115)
    expect(cellAt(applyMove(board, 120, 'X', C115), 120)).toBe('X')
    expect(() => applyMove(board, 121, 'X', C115)).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('KK-B27: büyük tahtada reddetme sırası korunur — game-over occupieddan önce', () => {
    // 0..4 X ile dolu: X {11,5}te kazandı. 0 hücresi DOLU ama beklenen sebep
    // 'occupied' değil 'game-over'dır.
    const cells = Array.from({ length: 121 }, () => null) as (string | null)[]
    for (let i = 0; i < 5; i += 1) cells[i] = 'X'
    const board = boardFromCells(cells as ('X' | 'O' | null)[], C115)
    expect(evaluateStatus(board, C115).kind).toBe('won')
    expect(() => applyMove(board, 0, 'O', C115)).toThrow(
      expect.objectContaining({ reason: 'game-over' }),
    )
    expect(() => applyMove(board, 200, 'O', C115)).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('6x6 tahtada dolu hücre occupied bildirir', () => {
    const config: BoardConfig = { size: 6, winLength: 4 }
    const cells = Array.from({ length: 36 }, () => null) as ('X' | 'O' | null)[]
    cells[35] = 'O'
    const board = boardFromCells(cells, config)
    expect(() => applyMove(board, 35, 'X', config)).toThrow(
      expect.objectContaining({ reason: 'occupied' }),
    )
  })
})
