import { describe, expect, it } from 'vitest'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants'
import {
  boardSchema,
  cellIndexSchema,
  epochMsSchema,
  playerSchema,
  playersSchema,
  roomCodeSchema,
  seatOccupantSchema,
} from './primitives'

describe('roomCodeSchema', () => {
  it('geçerli altı karakterli kodu kabul eder', () => {
    expect(roomCodeSchema.safeParse('AB2C3D').success).toBe(true)
  })

  /**
   * Şema alfabeden TÜRETİLMELİ. Elle yazılmış bir regex ikinci kopyadır:
   * W1-04 çarpışmayı azaltmak için alfabeye karakter eklerse oda kurulur ama
   * katılınamaz (kod üretilir, şema reddeder).
   */
  it('alfabedeki HER karakter geçerli koddur', () => {
    for (const ch of ROOM_CODE_ALPHABET) {
      expect(roomCodeSchema.safeParse(ch.repeat(ROOM_CODE_LENGTH)).success).toBe(true)
    }
  })

  it('alfabede olmayan hiçbir karakter geçmez', () => {
    for (const ch of 'IO01!-_ğ') {
      expect(ROOM_CODE_ALPHABET.includes(ch)).toBe(false)
      expect(roomCodeSchema.safeParse(ch.repeat(ROOM_CODE_LENGTH)).success).toBe(false)
    }
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

describe('koltuk şemaları — REST ve WS ortak okur', () => {
  it('koltuk sahibi kimlik ve boş olmayan ad taşır', () => {
    expect(seatOccupantSchema.safeParse({ userId: 'u1', name: 'Ömer' }).success).toBe(true)
    expect(seatOccupantSchema.safeParse({ userId: 'u1', name: '' }).success).toBe(false)
    expect(seatOccupantSchema.safeParse({ userId: '', name: 'Ömer' }).success).toBe(false)
  })

  it('iki koltuk da boş olabilir', () => {
    expect(playersSchema.safeParse({ X: null, O: null }).success).toBe(true)
  })

  it('eksik koltuğu reddeder', () => {
    expect(playersSchema.safeParse({ X: null }).success).toBe(false)
  })
})

describe('epochMsSchema', () => {
  it('tam sayı damgayı kabul eder, kesirliyi reddeder', () => {
    expect(epochMsSchema.safeParse(1_770_000_000_000).success).toBe(true)
    expect(epochMsSchema.safeParse(1.5).success).toBe(false)
  })
})
