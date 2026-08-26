import { describe, expect, it } from 'vitest'
import { ERROR_CODES, errorCodeSchema } from './errors'

/** Tasarım §2.3 — bu liste sözleşmedir; fazla ya da eksik kod testi kırar. */
const BEKLENEN_KODLAR = [
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'WEAK_PASSWORD',
  'INVALID_EMAIL',
  'INVALID_NAME',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'INVALID_CODE',
  'CODE_GENERATION_FAILED',
  'NOT_YOUR_TURN',
  'CELL_OCCUPIED',
  'GAME_OVER',
  'INVALID_MESSAGE',
  'SESSION_TAKEOVER',
  'REMATCH_EXPIRED',
  'RATE_LIMITED',
  'NOT_FRIENDS_ELIGIBLE',
  'SERVER_ERROR',
  'NETWORK',
  'INVALID_BOARD_CONFIG',
]

describe('errorCodeSchema', () => {
  it('tam 21 kod içerir', () => {
    expect(errorCodeSchema.options).toHaveLength(21)
    expect(BEKLENEN_KODLAR).toHaveLength(21)
  })

  it('tasarım §2.3 listesiyle birebir aynıdır (sıra dahil)', () => {
    expect(errorCodeSchema.options).toEqual(BEKLENEN_KODLAR)
  })

  it('ERROR_CODES şemanın seçenekleriyle aynı diziyi verir', () => {
    expect([...ERROR_CODES]).toEqual(errorCodeSchema.options)
  })

  it('her kodu tek tek çözer', () => {
    for (const code of BEKLENEN_KODLAR) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true)
    }
  })

  it('listede olmayan kodu reddeder', () => {
    expect(errorCodeSchema.safeParse('OOPS').success).toBe(false)
    expect(errorCodeSchema.safeParse('unauthenticated').success).toBe(false)
  })
})
