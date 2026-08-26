import { describe, expect, it } from 'vitest'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants'
import {
  boardConfigSchema,
  boardSchema,
  boardSizeSchema,
  cellIndexSchema,
  epochMsSchema,
  playerSchema,
  playersSchema,
  roomCodeSchema,
  seatOccupantSchema,
  winLengthSchema,
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

describe('boardSchema (CTR-BOARD-001: 9..121, şekil korur — kural değil)', () => {
  it('dokuz hücreyi (3×3) kabul eder', () => {
    expect(boardSchema.safeParse(Array.from({ length: 9 }, () => null)).success).toBe(true)
  })

  it('36 hücreyi (6×6) ve 121 hücreyi (11×11) kabul eder', () => {
    expect(boardSchema.safeParse(Array.from({ length: 36 }, () => null)).success).toBe(true)
    expect(boardSchema.safeParse(Array.from({ length: 121 }, () => null)).success).toBe(true)
  })

  it('8 hücreyi (alt sınırın altı) ve 122 hücreyi (üst sınırın üstü) reddeder', () => {
    expect(boardSchema.safeParse(Array.from({ length: 8 }, () => null)).success).toBe(false)
    expect(boardSchema.safeParse(Array.from({ length: 122 }, () => null)).success).toBe(false)
  })

  it('geçersiz hücre değerini reddeder', () => {
    expect(
      boardSchema.safeParse(['A', null, null, null, null, null, null, null, null]).success,
    ).toBe(false)
  })
})

describe('cellIndexSchema (CTR-BOARD-001: 0..120)', () => {
  it('0..120 aralığını kabul eder', () => {
    expect(cellIndexSchema.safeParse(0).success).toBe(true)
    expect(cellIndexSchema.safeParse(8).success).toBe(true)
    expect(cellIndexSchema.safeParse(120).success).toBe(true)
  })

  it('aralık dışını ve tam sayı olmayanı reddeder', () => {
    expect(cellIndexSchema.safeParse(121).success).toBe(false)
    expect(cellIndexSchema.safeParse(-1).success).toBe(false)
    expect(cellIndexSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('boardSizeSchema — donmuş üçlü (spec §0.1)', () => {
  it('3, 6, 11 kabul eder', () => {
    expect(boardSizeSchema.safeParse(3).success).toBe(true)
    expect(boardSizeSchema.safeParse(6).success).toBe(true)
    expect(boardSizeSchema.safeParse(11).success).toBe(true)
  })

  it('listede olmayan boyutu reddeder', () => {
    expect(boardSizeSchema.safeParse(4).success).toBe(false)
    expect(boardSizeSchema.safeParse(9).success).toBe(false)
    expect(boardSizeSchema.safeParse('3').success).toBe(false)
  })
})

describe('winLengthSchema', () => {
  it('3..6 aralığını kabul eder', () => {
    for (const k of [3, 4, 5, 6]) expect(winLengthSchema.safeParse(k).success).toBe(true)
  })

  it('aralık dışını ve tam sayı olmayanı reddeder', () => {
    expect(winLengthSchema.safeParse(2).success).toBe(false)
    expect(winLengthSchema.safeParse(7).success).toBe(false)
    expect(winLengthSchema.safeParse(4.5).success).toBe(false)
  })
})

describe('boardConfigSchema', () => {
  it('geçerli boyut+K çiftini kabul eder', () => {
    expect(boardConfigSchema.safeParse({ size: 11, winLength: 5 }).success).toBe(true)
  })

  it('şema SEKLİ korur, KOMBİNASYONU değil: BOARD_MODES eşleşmesi burada YOKTUR', () => {
    // {6, 6} game-core'un BOARD_MODES'unda YOK ama primitives bunu bilmez —
    // kombinasyon kuralı game-core'dadır (ADR-0010), şema yalnız tip/aralık.
    expect(boardConfigSchema.safeParse({ size: 6, winLength: 6 }).success).toBe(true)
  })

  it('eksik alanı reddeder', () => {
    expect(boardConfigSchema.safeParse({ size: 3 }).success).toBe(false)
    expect(boardConfigSchema.safeParse({ winLength: 3 }).success).toBe(false)
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
