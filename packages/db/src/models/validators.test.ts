import { describe, expect, it } from 'vitest'
import { hasAtMostLength, hasExactLength, isNullOrLengthBetween } from './validators'

describe('hasExactLength', () => {
  it('tam uzunlukta diziyi kabul eder', () => {
    expect(hasExactLength(9)(Array.from({ length: 9 }))).toBe(true)
  })

  it('kısa ve uzun diziyi reddeder', () => {
    expect(hasExactLength(9)(Array.from({ length: 8 }))).toBe(false)
    expect(hasExactLength(9)(Array.from({ length: 10 }))).toBe(false)
  })
})

describe('hasAtMostLength', () => {
  it('sınırdaki ve altındaki diziyi kabul eder', () => {
    expect(hasAtMostLength(9)(Array.from({ length: 9 }))).toBe(true)
    expect(hasAtMostLength(9)([])).toBe(true)
  })

  it('sınırı aşan diziyi reddeder', () => {
    expect(hasAtMostLength(9)(Array.from({ length: 10 }))).toBe(false)
  })
})

/**
 * `isNullOrExactLength(3)`'ün yerini alır. Tip "3..6 indeks" derken
 * doğrulayıcının "tam 3" demesi, ancak 6×6 İLK KEZ oynandığında patlayan bir
 * tutarsızlık olurdu — tipin ve doğrulayıcının aynı commit'te hareket etmesi
 * şarttır (ADR-0011).
 *
 * Beklentiler ÇIPLAK yazılır; `winLineSchema`'dan ya da `BOARD_MODES`'tan
 * türetilmez (gotcha örüntü 2).
 */
describe('isNullOrLengthBetween(3, 6)', () => {
  const validate = isNullOrLengthBetween(3, 6)

  it('null kabul edilir — beraberlikte/pes etmede çizgi yoktur', () => {
    expect(validate(null)).toBe(true)
  })

  it.each([
    [2, false],
    [3, true],
    [4, true],
    [5, true],
    [6, true],
    [7, false],
  ])('%i indeksli çizgi kabul durumu: %s', (length, accepted) => {
    expect(validate(Array.from({ length }))).toBe(accepted)
  })

  it('boş dizi reddedilir', () => {
    expect(validate([])).toBe(false)
  })
})
