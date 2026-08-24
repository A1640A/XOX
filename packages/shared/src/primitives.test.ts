import { describe, expect, it } from 'vitest'
import {
  boardSchema,
  cellIndexSchema,
  epochMsSchema,
  playerSchema,
  roomCodeSchema,
} from './primitives'

describe('roomCodeSchema', () => {
  it('geçerli altı karakterli kodu kabul eder', () => {
    expect(roomCodeSchema.safeParse('AB2C3D').success).toBe(true)
  })

  it('karışan karakterleri (I, O, 0, 1) reddeder', () => {
    expect(roomCodeSchema.safeParse('ABIC3D').success).toBe(false)
    expect(roomCodeSchema.safeParse('AB0C3D').success).toBe(false)
  })

  it('yanlış uzunluğu reddeder', () => {
    expect(roomCodeSchema.safeParse('AB2C3').success).toBe(false)
  })

  it('küçük harfi reddeder', () => {
    expect(roomCodeSchema.safeParse('ab2c3d').success).toBe(false)
  })
})

describe('playerSchema', () => {
  it('yalnız X ve O kabul eder', () => {
    expect(playerSchema.options).toEqual(['X', 'O'])
    expect(playerSchema.safeParse('Z').success).toBe(false)
  })
})

describe('boardSchema', () => {
  it('dokuz hücreyi kabul eder', () => {
    expect(boardSchema.safeParse(Array.from({ length: 9 }, () => null)).success).toBe(true)
  })

  it('dokuzdan farklı uzunluğu reddeder', () => {
    expect(boardSchema.safeParse([null, null]).success).toBe(false)
  })

  it('geçersiz hücre değerini reddeder', () => {
    expect(
      boardSchema.safeParse(['A', null, null, null, null, null, null, null, null]).success,
    ).toBe(false)
  })
})

describe('cellIndexSchema', () => {
  it('0..8 aralığını kabul eder', () => {
    expect(cellIndexSchema.safeParse(0).success).toBe(true)
    expect(cellIndexSchema.safeParse(8).success).toBe(true)
  })

  it('aralık dışını ve tam sayı olmayanı reddeder', () => {
    expect(cellIndexSchema.safeParse(9).success).toBe(false)
    expect(cellIndexSchema.safeParse(-1).success).toBe(false)
    expect(cellIndexSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('epochMsSchema', () => {
  it('tam sayı damgayı kabul eder, kesirliyi reddeder', () => {
    expect(epochMsSchema.safeParse(1_770_000_000_000).success).toBe(true)
    expect(epochMsSchema.safeParse(1.5).success).toBe(false)
  })
})
