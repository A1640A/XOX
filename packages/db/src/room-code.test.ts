import { describe, expect, it } from 'vitest'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@xox/shared'
import { generateRoomCode } from './room-code'

describe('generateRoomCode', () => {
  it('doğru uzunlukta kod üretir', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it('yalnızca izin verilen alfabeden karakter kullanır', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const ch of generateRoomCode()) {
        expect(ROOM_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('200 üretimde tekrar oranı düşüktür', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateRoomCode()))
    expect(codes.size).toBeGreaterThan(190)
  })
})
