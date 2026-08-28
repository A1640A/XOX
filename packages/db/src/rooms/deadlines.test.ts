import type { Cell } from '@xox/shared'
import { describe, expect, it } from 'vitest'
import type { RoomDoc } from '../models/room'
import { dueSettlement, nextDeadlineAt, type SettlementInput } from './deadlines'

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

function bigBoard(placed: number): Cell[] {
  const out: Cell[] = []
  for (let i = 0; i < 121; i += 1) out.push(i < placed ? (i % 2 === 0 ? 'X' : 'O') : null)
  return out
}

function presence(connected: { X: boolean; O: boolean }): RoomDoc['presence'] {
  return {
    X: connected.X ? { connId: 'c-x', since: new Date(NOW) } : null,
    O: connected.O ? { connId: 'c-o', since: new Date(NOW) } : null,
  }
}

function room(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    state: 'playing',
    board: board('.........'),
    presence: presence({ X: true, O: true }),
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

  it('deadline yoksa null döner', () => {
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

  // ── KK-076: bağlı otorite yoksa yazma yok ──────────────────────────────
  // `&&` iki operandlıdır: TEK bir vaka onu öldüremez. Aşağıdaki üç test
  // operandları AYRI AYRI false yapıyor (yalnız X bağlı / yalnız O bağlı) ve
  // ikisini birden true yapıyor (ikisi de kopuk).

  it('KK-076: İKİ koltuk da bağlı değilse hiçbir sonuç yazılmaz — null döner', () => {
    const input = room({
      presence: presence({ X: false, O: false }),
      turnDeadline: new Date(NOW - 1),
      disconnected: disconnected('O', NOW - 1),
    })
    expect(dueSettlement(input, NOW)).toBeNull()
  })

  it('KK-076: YALNIZ X bağlıyken karar VERİLİR (O kopmuş, grace dolmuş)', () => {
    const input = room({
      presence: presence({ X: true, O: false }),
      disconnected: disconnected('O', NOW - 1),
    })
    expect(dueSettlement(input, NOW)).toStrictEqual({ reason: 'abandon', loser: 'O' })
  })

  it('KK-076: YALNIZ O bağlıyken karar VERİLİR (X kopmuş, grace dolmuş)', () => {
    const input = room({
      presence: presence({ X: false, O: true }),
      disconnected: disconnected('X', NOW - 1),
    })
    expect(dueSettlement(input, NOW)).toStrictEqual({ reason: 'abandon', loser: 'X' })
  })

  // ── ADR-0014: tahta 3×3 olmak zorunda değil ────────────────────────────

  it('11×11 odada süre aşımı FIRLATMAZ — sıra sahibi odanın kendi config`iyle okunur', () => {
    const input = room({
      size: 11,
      winLength: 5,
      board: bigBoard(3),
      turnDeadline: new Date(NOW - 1),
    })
    // 3 taş konmuş → sıra O'da; 3×3 varsayılanıyla okunsaydı RangeError atardı.
    expect(dueSettlement(input, NOW)).toStrictEqual({ reason: 'timeout', loser: 'O' })
  })
})

describe('nextDeadlineAt', () => {
  it('oyun sürmüyorsa null — geçmiş deadline olsa bile', () => {
    expect(
      nextDeadlineAt({ ...room({ state: 'finished' }), turnDeadline: new Date(NOW) }),
    ).toBeNull()
  })

  it('hiç son tarih yoksa null', () => {
    expect(nextDeadlineAt(room())).toBeNull()
  })

  it('yalnız turnDeadline varsa onu döner', () => {
    expect(nextDeadlineAt(room({ turnDeadline: new Date(NOW + 60_000) }))).toBe(NOW + 60_000)
  })

  it('yalnız grace varsa onu döner', () => {
    expect(nextDeadlineAt(room({ disconnected: disconnected('O', NOW + 30_000) }))).toBe(
      NOW + 30_000,
    )
  })

  it('ikisi de varsa ÖNCE doleni döner — grace daha erken', () => {
    const input = room({
      turnDeadline: new Date(NOW + 45_000),
      disconnected: disconnected('X', NOW + 12_000),
    })
    expect(nextDeadlineAt(input)).toBe(NOW + 12_000)
  })

  it('ikisi de varsa ÖNCE doleni döner — turnDeadline daha erken', () => {
    const input = room({
      turnDeadline: new Date(NOW + 8_000),
      disconnected: disconnected('X', NOW + 12_000),
    })
    expect(nextDeadlineAt(input)).toBe(NOW + 8_000)
  })

  it('geçmişte kalmış son tarihi OLDUĞU GİBİ döner — kırpma çağıranın işi', () => {
    expect(nextDeadlineAt(room({ turnDeadline: new Date(NOW - 90_000) }))).toBe(NOW - 90_000)
  })

  it('presence`e BAKMAZ — zamanlayıcı kurmak yazma değildir', () => {
    const input = room({
      presence: presence({ X: false, O: false }),
      turnDeadline: new Date(NOW + 1_000),
    })
    expect(nextDeadlineAt(input)).toBe(NOW + 1_000)
  })
})
