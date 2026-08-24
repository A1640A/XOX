import { describe, expect, it } from 'vitest'
import {
  DISCONNECT_GRACE_SECONDS,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  ELO_FLOOR,
  ELO_K,
  ELO_MIN_MOVES,
  ELO_PAIR_MAX_RATED,
  ELO_PAIR_WINDOW_HOURS,
  ELO_START,
  EMOJI_PALETTE,
  EMOJI_RATE_LIMIT,
  HISTORY_PAGE_SIZE,
  LEADERBOARD_MIN_RATED_GAMES,
  LEADERBOARD_SIZE,
  MAX_PASSWORD_LENGTH,
  MAX_PROTOCOL_VIOLATIONS,
  MIN_PASSWORD_LENGTH,
  MOBILE_ACCESS_TTL_SECONDS,
  MOBILE_REFRESH_TTL_SECONDS,
  MOVE_TIMEOUT_SECONDS,
  REMATCH_OFFER_TTL_SECONDS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CREATE_MAX_ATTEMPTS,
  ROOM_TTL_SECONDS,
  WS_HEARTBEAT_MS,
  WS_IDLE_TIMEOUT_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
  WS_ROTATE_MARGIN_MS,
  WS_TICKET_TTL_SECONDS,
} from './constants'

describe('mevcut sabitler korunur', () => {
  it('oda kodu sözleşmesi değişmez', () => {
    expect(ROOM_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
    expect(ROOM_CODE_LENGTH).toBe(6)
    expect(ROOM_TTL_SECONDS).toBe(7200)
  })

  it('oyun ve taşıma zamanlamaları değişmez', () => {
    expect(MOVE_TIMEOUT_SECONDS).toBe(60)
    expect(WS_HEARTBEAT_MS).toBe(25_000)
    expect(WS_RECONNECT_BASE_MS).toBe(500)
    expect(WS_RECONNECT_MAX_MS).toBe(10_000)
  })
})

describe('tasarım §2.7 yeni sabitleri', () => {
  it('DISCONNECT_GRACE_SECONDS 30', () => {
    expect(DISCONNECT_GRACE_SECONDS).toBe(30)
  })

  it('REMATCH_OFFER_TTL_SECONDS 60', () => {
    expect(REMATCH_OFFER_TTL_SECONDS).toBe(60)
  })

  it('WS_IDLE_TIMEOUT_MS heartbeat × 3 = 75 sn', () => {
    expect(WS_IDLE_TIMEOUT_MS).toBe(75_000)
    expect(WS_IDLE_TIMEOUT_MS).toBe(WS_HEARTBEAT_MS * 3)
  })

  it('WS_ROTATE_MARGIN_MS 10_000', () => {
    expect(WS_ROTATE_MARGIN_MS).toBe(10_000)
  })

  it('WS_TICKET_TTL_SECONDS 30', () => {
    expect(WS_TICKET_TTL_SECONDS).toBe(30)
  })

  it('MAX_PROTOCOL_VIOLATIONS 3', () => {
    expect(MAX_PROTOCOL_VIOLATIONS).toBe(3)
  })

  it('MOBILE_ACCESS_TTL_SECONDS 900 (15 dk)', () => {
    expect(MOBILE_ACCESS_TTL_SECONDS).toBe(900)
  })

  it('MOBILE_REFRESH_TTL_SECONDS 2_592_000 (30 gün)', () => {
    expect(MOBILE_REFRESH_TTL_SECONDS).toBe(2_592_000)
  })

  it('MIN_PASSWORD_LENGTH 8 · MAX_PASSWORD_LENGTH 128', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(MAX_PASSWORD_LENGTH).toBe(128)
  })

  it('DISPLAY_NAME_MIN 2 · DISPLAY_NAME_MAX 40', () => {
    expect(DISPLAY_NAME_MIN).toBe(2)
    expect(DISPLAY_NAME_MAX).toBe(40)
  })

  it('EMOJI_PALETTE tam sekiz emoji ve sıra sabit', () => {
    expect(EMOJI_PALETTE).toEqual(['👋', '😀', '😂', '😮', '😢', '👏', '🔥', '🤝'])
    expect(EMOJI_PALETTE).toHaveLength(8)
  })

  it('EMOJI_RATE_LIMIT 10 saniyede 5', () => {
    expect(EMOJI_RATE_LIMIT).toEqual({ count: 5, windowMs: 10_000 })
  })

  it('ELO_K 24', () => {
    expect(ELO_K).toBe(24)
  })

  it('ELO_FLOOR 100 · ELO_START 1200', () => {
    expect(ELO_FLOOR).toBe(100)
    expect(ELO_START).toBe(1200)
  })

  it('ELO_MIN_MOVES 3', () => {
    expect(ELO_MIN_MOVES).toBe(3)
  })

  it('ELO_PAIR_WINDOW_HOURS 24 · ELO_PAIR_MAX_RATED 3', () => {
    expect(ELO_PAIR_WINDOW_HOURS).toBe(24)
    expect(ELO_PAIR_MAX_RATED).toBe(3)
  })

  it('LEADERBOARD_MIN_RATED_GAMES 5 · LEADERBOARD_SIZE 50', () => {
    expect(LEADERBOARD_MIN_RATED_GAMES).toBe(5)
    expect(LEADERBOARD_SIZE).toBe(50)
  })

  it('HISTORY_PAGE_SIZE 20', () => {
    expect(HISTORY_PAGE_SIZE).toBe(20)
  })

  it('ROOM_CREATE_MAX_ATTEMPTS 5', () => {
    expect(ROOM_CREATE_MAX_ATTEMPTS).toBe(5)
  })
})
