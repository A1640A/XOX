import { describe, expect, it } from 'vitest'
import { InvalidMoveError } from './errors'

describe('InvalidMoveError', () => {
  it('indeksi ve sebebi mesajda bildirir', () => {
    expect(new InvalidMoveError(4, 'occupied').message).toBe('Geçersiz hamle: 4 (occupied)')
  })

  it('her sebep için mesajı ayrı ayrı biçimlendirir', () => {
    expect(new InvalidMoveError(-1, 'game-over').message).toBe('Geçersiz hamle: -1 (game-over)')
    expect(new InvalidMoveError(9, 'out-of-range').message).toBe('Geçersiz hamle: 9 (out-of-range)')
  })

  it('adını, indeksini ve sebebini alan olarak taşır', () => {
    const error = new InvalidMoveError(2, 'occupied')
    expect(error.name).toBe('InvalidMoveError')
    expect(error.index).toBe(2)
    expect(error.reason).toBe('occupied')
  })

  it('Error alt sınıfıdır', () => {
    expect(new InvalidMoveError(0, 'occupied')).toBeInstanceOf(Error)
  })
})
