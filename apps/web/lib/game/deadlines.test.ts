import type { RoomDoc } from '@xox/db'
import type { Cell } from '@xox/shared'
import { describe, expect, it } from 'vitest'
import { dueSettlement, type SettlementInput } from './deadlines'

/** `1970-01-01T00:16:40Z` — çıplak sayı bilerek: türetilmiş beklenti kör olur. */
const NOW = 1_000_000

function board(cells: string): Cell[] {
  const out: Cell[] = []
  for (let i = 0; i < 9; i += 1) {
    const c = cells.charAt(i)
    out.push(c === 'X' ? 'X' : c === 'O' ? 'O' : null)
  }
  return out
}

function room(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    state: 'playing',
    board: board('.........'),
    turnDeadline: null,
    disconnected: null,
    ...overrides,
  }
}

function disconnected(seat: 'X' | 'O', graceEndsAtMs: number): RoomDoc['disconnected'] {
  return { seat, at: new Date(graceEndsAtMs - 30_000), graceEndsAt: new Date(graceEndsAtMs) }
}

describe('dueSettlement', () => {
  it('oyun sürmüyorsa null döner (waiting)', () => {
    expect(dueSettlement(room({ state: 'waiting' }), NOW)).toBeNull()
  })

  it('oyun sürmüyorsa null döner — geçmiş deadline OLSA BİLE (finished)', () => {
    const input = room({
      state: 'finished',
      turnDeadline: new Date(NOW - 60_000),
      disconnected: disconnected('X', NOW - 60_000),
    })
    expect(dueSettlement(input, NOW)).toBeNull()
  })

  it('deadline yoksa null döner — P0 turnDeadline daima null (AS-08)', () => {
    expect(dueSettlement(room(), NOW)).toBeNull()
  })

  it('gelecekteki turnDeadline null döner', () => {
    expect(dueSettlement(room({ turnDeadline: new Date(NOW + 1) }), NOW)).toBeNull()
  })

  it('geçmiş turnDeadline: sırası gelen oyuncu KAYBEDER (boş tahtada X)', () => {
    const result = dueSettlement(room({ turnDeadline: new Date(NOW - 1) }), NOW)
    expect(result).toStrictEqual({ reason: 'timeout', loser: 'X' })
  })

  it('geçmiş turnDeadline: tek hamle sonrası sıra Oda ise O kaybeder', () => {
    const result = dueSettlement(
      room({ board: board('X........'), turnDeadline: new Date(NOW - 1) }),
      NOW,
    )
    expect(result).toStrictEqual({ reason: 'timeout', loser: 'O' })
  })

  it('turnDeadline tam NOW ise dolmuş sayılır (>= sınırı)', () => {
    expect(dueSettlement(room({ turnDeadline: new Date(NOW) }), NOW)).toStrictEqual({
      reason: 'timeout',
      loser: 'X',
    })
  })

  it('gelecekteki graceEndsAt null döner', () => {
    expect(dueSettlement(room({ disconnected: disconnected('O', NOW + 1) }), NOW)).toBeNull()
  })

  it('geçmiş graceEndsAt: kopan oyuncu kaybeder', () => {
    expect(dueSettlement(room({ disconnected: disconnected('O', NOW - 1) }), NOW)).toStrictEqual({
      reason: 'abandon',
      loser: 'O',
    })
  })

  it('ikisi de dolmuşsa ÖNCE dolan kazanır — grace daha erkense abandon', () => {
    const input = room({
      turnDeadline: new Date(NOW - 5_000),
      disconnected: disconnected('X', NOW - 9_000),
    })
    expect(dueSettlement(input, NOW)).toStrictEqual({ reason: 'abandon', loser: 'X' })
  })

  it('ikisi de dolmuşsa ÖNCE dolan kazanır — timeout daha erkense timeout', () => {
    const input = room({
      board: board('X........'),
      turnDeadline: new Date(NOW - 9_000),
      disconnected: disconnected('X', NOW - 5_000),
    })
    expect(dueSettlement(input, NOW)).toStrictEqual({ reason: 'timeout', loser: 'O' })
  })

  it('EŞİTLİKTE timeout kazanır (deterministik — spec §3.7)', () => {
    const input = room({
      turnDeadline: new Date(NOW - 7_000),
      disconnected: disconnected('O', NOW - 7_000),
    })
    expect(dueSettlement(input, NOW)).toStrictEqual({ reason: 'timeout', loser: 'X' })
  })
})
