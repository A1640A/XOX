import type { RoomDoc } from '@xox/db'
import { type Cell, stateMessageSchema } from '@xox/shared'
import { describe, expect, it } from 'vitest'
import { roomTransportStatus, toStateMessage } from './room-view'

const NOW = 1_700_000_000_000

function cells(pattern: string): Cell[] {
  const out: Cell[] = []
  for (let i = 0; i < 9; i += 1) {
    const c = pattern.charAt(i)
    out.push(c === 'X' ? 'X' : c === 'O' ? 'O' : null)
  }
  return out
}

function makeRoom(overrides: Partial<RoomDoc> = {}): RoomDoc {
  return {
    code: 'ABC234',
    state: 'playing',
    seats: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
    presence: { X: null, O: null },
    board: cells('.........'),
    moves: [],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    lastEmoji: null,
    gameId: null,
    version: 7,
    startedAt: new Date(NOW - 1000),
    createdAt: new Date(NOW - 2000),
    updatedAt: new Date(NOW),
    ...overrides,
  }
}

describe('roomTransportStatus', () => {
  it('sürerken sıradaki oyuncuyu verir', () => {
    expect(roomTransportStatus(makeRoom())).toStrictEqual({ kind: 'playing', turn: 'X' })
  })

  it('bir hamle sonrası sıra Oda', () => {
    expect(roomTransportStatus(makeRoom({ board: cells('X........') }))).toStrictEqual({
      kind: 'playing',
      turn: 'O',
    })
  })

  it('kazanan çizgi varsa reason line ve çizgi taşınır', () => {
    const status = roomTransportStatus(makeRoom({ board: cells('XXXOO....'), state: 'finished' }))
    expect(status).toStrictEqual({ kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' })
  })

  it('berabere biten tahta draw döner', () => {
    const status = roomTransportStatus(makeRoom({ board: cells('XXOOOXXOX'), state: 'finished' }))
    expect(status).toStrictEqual({ kind: 'draw' })
  })

  it('oda waiting iken tahta boşken bile playing/X döner (henüz sonuç yok)', () => {
    expect(roomTransportStatus(makeRoom({ state: 'waiting' }))).toStrictEqual({
      kind: 'playing',
      turn: 'X',
    })
  })

  it('state finished ama tahta bitmemişse draw ile kapatır — sebep odada YAZILI DEĞİL', () => {
    // Pes/süre aşımı/terk sonucunu `rooms` dokümanı taşımıyor (§3.2). P0'da bu
    // dal üretilmez; W1-02 gerçek sebebi `games`ten okuyup buraya taşıyacak.
    // Sözleşme: uydurma bir KAZANAN yazmak yerine oyunu sonuçsuz kapat.
    expect(
      roomTransportStatus(makeRoom({ state: 'finished', board: cells('X........') })),
    ).toStrictEqual({ kind: 'draw' })
  })
})

describe('toStateMessage', () => {
  it('protokol şemasını geçen tam bir state üretir', () => {
    const message = toStateMessage(makeRoom(), 'O', NOW)
    expect(stateMessageSchema.safeParse(message).success).toBe(true)
  })

  it('alanları odadan birebir taşır', () => {
    const room = makeRoom({
      board: cells('XO.......'),
      version: 12,
      turnDeadline: new Date(NOW + 60_000),
      disconnected: { seat: 'O', at: new Date(NOW), graceEndsAt: new Date(NOW + 30_000) },
      rematch: { by: 'X', expiresAt: new Date(NOW + 60_000) },
    })
    expect(toStateMessage(room, 'X', NOW)).toStrictEqual({
      type: 'state',
      roomCode: 'ABC234',
      board: ['X', 'O', null, null, null, null, null, null, null],
      status: { kind: 'playing', turn: 'X' },
      players: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
      you: 'X',
      version: 12,
      turnDeadline: NOW + 60_000,
      graceEndsAt: NOW + 30_000,
      rematch: { by: 'X', expiresAt: NOW + 60_000 },
      serverTime: NOW,
    })
  })

  it('boş koltuk null taşınır, deadline yoksa null kalır', () => {
    const message = toStateMessage(
      makeRoom({ seats: { X: { userId: 'u1', name: 'Ada' }, O: null } }),
      'X',
      NOW,
    )
    expect(message.players.O).toBeNull()
    expect(message.turnDeadline).toBeNull()
    expect(message.graceEndsAt).toBeNull()
    expect(message.rematch).toBeNull()
  })

  it('tahta KOPYALANIR — oda dokümanının dizisiyle aynı referans olmaz', () => {
    const room = makeRoom()
    const message = toStateMessage(room, 'X', NOW)
    expect(message.board).not.toBe(room.board)
  })
})
