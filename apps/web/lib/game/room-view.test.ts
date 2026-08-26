import type { RoomDoc } from '@xox/db'
import { type Cell, stateMessageSchema } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
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
    result: null,
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

  it('state finished ama rooms.result BOŞSA GÜRÜLTÜ çıkarır (sessiz değişmez ihlali yok)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    roomTransportStatus(makeRoom({ state: 'finished', board: cells('X........') }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]?.[0])).toContain('rooms.result')
    spy.mockRestore()
  })

  it('normal yollarda HİÇ gürültü çıkmaz', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    roomTransportStatus(makeRoom())
    roomTransportStatus(makeRoom({ board: cells('XXXOO....'), state: 'finished' }))
    roomTransportStatus(makeRoom({ board: cells('XXOOOXXOX'), state: 'finished' }))
    roomTransportStatus(
      makeRoom({
        state: 'finished',
        board: cells('X........'),
        result: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
      }),
    )
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('state finished ama sonuç alanı boşsa draw ile kapatır — uydurma kazanan YAZILMAZ', () => {
    expect(
      roomTransportStatus(makeRoom({ state: 'finished', board: cells('X........') })),
    ).toStrictEqual({ kind: 'draw' })
  })
})

/**
 * BORÇ KAPANIŞI (WS-001 incelemesi): pes/süre aşımı/terk ile biten oyunun
 * kazananı `rooms.result` alanından okunuyor. Bu alan olmadan `resign`
 * yazıldığı an pes eden oyuncu da rakibi de `game:over {kind:'draw'}` görürdü.
 */
describe('roomTransportStatus · rooms.result önceliği', () => {
  it('pes sonucu: tahta bitmemiş olsa bile KAZANAN ve sebep okunur', () => {
    const status = roomTransportStatus(
      makeRoom({
        state: 'finished',
        board: cells('XO.......'),
        result: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
      }),
    )
    expect(status).toStrictEqual({ kind: 'won', winner: 'O', line: null, reason: 'resign' })
  })

  it('süre aşımı ve terk sonuçları da aynı alandan taşınır', () => {
    for (const reason of ['timeout', 'abandon'] as const) {
      expect(
        roomTransportStatus(
          makeRoom({
            state: 'finished',
            board: cells('X........'),
            result: { kind: 'won', winner: 'X', line: null, reason },
          }),
        ),
      ).toStrictEqual({ kind: 'won', winner: 'X', line: null, reason })
    }
  })

  it('çizgi ile kazanılmış oyunda çizgi alandan gelir', () => {
    expect(
      roomTransportStatus(
        makeRoom({
          state: 'finished',
          board: cells('XXXOO....'),
          result: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
        }),
      ),
    ).toStrictEqual({ kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' })
  })

  it('beraberlik alanı draw olarak okunur', () => {
    expect(
      roomTransportStatus(
        makeRoom({
          state: 'finished',
          board: cells('XXOOOXXOX'),
          result: { kind: 'draw', winner: null, line: null, reason: null },
        }),
      ),
    ).toStrictEqual({ kind: 'draw' })
  })

  it('ADR-0001 değişmezini İHLAL EDEN bir kayıt kabul EDİLMEZ — gürültü + tahtaya düşüş', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // `reason:'resign'` + dolu `line`: şema bunu reddeder (superRefine).
    const status = roomTransportStatus(
      makeRoom({
        state: 'finished',
        board: cells('XXXOO....'),
        result: { kind: 'won', winner: 'O', line: [0, 1, 2], reason: 'resign' },
      }),
    )
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]?.[0])).toContain('protokol şemasına uymuyor')
    // Bozuk kayıt yok sayıldı; tahtadan okunan gerçek sonuç kaldı.
    expect(status).toStrictEqual({ kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' })
    spy.mockRestore()
  })

  it('toStateMessage sonucu aynı alandan taşır', () => {
    const message = toStateMessage(
      makeRoom({
        state: 'finished',
        board: cells('XO.......'),
        result: { kind: 'won', winner: 'X', line: null, reason: 'timeout' },
      }),
      'X',
      NOW,
    )
    expect(message.status).toStrictEqual({
      kind: 'won',
      winner: 'X',
      line: null,
      reason: 'timeout',
    })
    expect(stateMessageSchema.safeParse(message).success).toBe(true)
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
      size: 3,
      winLength: 3,
      lastMove: null,
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

/**
 * DB-BOARD-001 (ADR-0014 §2/§7) — `size`/`winLength`/`lastMove` `resolveBoardConfig`
 * ve `RoomDoc.moves`'un SON elemanından türetilir; sabitten TÜRETİLMİŞ bir
 * beklenti değil, ELLE yazılmış çıplak değerlerle sınanır (nötr eleman körlüğüne
 * karşı: {3,3} DIŞINDA bir vaka da — {11,5} — sınanır).
 */
describe('toStateMessage · size/winLength/lastMove (ADR-0014)', () => {
  it('alan yoksa (eski kayıt) SESSİZCE {3,3} döner ve lastMove null olur', () => {
    const message = toStateMessage(makeRoom({ size: undefined, winLength: undefined }), 'X', NOW)
    expect(message.size).toBe(3)
    expect(message.winLength).toBe(3)
    expect(message.lastMove).toBeNull()
  })

  it('sıfır OLMAYAN bir konfigürasyon ({11,5}) birebir taşınır', () => {
    const room = makeRoom({
      size: 11,
      winLength: 5,
      board: Array.from({ length: 121 }, () => null),
    })
    const message = toStateMessage(room, 'X', NOW)
    expect(message.size).toBe(11)
    expect(message.winLength).toBe(5)
    expect(message.board).toHaveLength(121)
  })

  it('lastMove RoomDoc.moves diziSİNİN SON elemanından üretilir, tamamı GÖNDERİLMEZ', () => {
    const room = makeRoom({
      moves: [
        { index: 0, by: 'X', at: new Date(NOW - 2000) },
        { index: 4, by: 'O', at: new Date(NOW - 1000) },
      ],
    })
    const message = toStateMessage(room, 'X', NOW)
    expect(message.lastMove).toStrictEqual({ index: 4, by: 'O' })
    expect(message).not.toHaveProperty('moves')
  })

  it('moves boşsa lastMove null olur', () => {
    const message = toStateMessage(makeRoom({ moves: [] }), 'X', NOW)
    expect(message.lastMove).toBeNull()
  })

  it('KK-B70: 11×11 DOLU tahtada state mesajının JSON.stringify çıktısı < 4 KiB olur', () => {
    const pattern: ('X' | 'O')[] = ['X', 'O']
    const board = Array.from({ length: 121 }, (_, i) => pattern[i % 2] ?? 'X')
    const moves = board.map((by, index) => ({
      index,
      by,
      at: new Date(NOW - (121 - index) * 1000),
    }))
    const room = makeRoom({
      size: 11,
      winLength: 5,
      board,
      moves,
      seats: {
        X: { userId: 'kullanici-1-uzunca-bir-id', name: 'Çok Uzun Görünen Bir Ad' },
        O: { userId: 'kullanici-2-uzunca-bir-id', name: 'Diğer Oyuncunun Da Uzun Adı' },
      },
    })

    const message = toStateMessage(room, 'X', NOW)
    const bytes = new TextEncoder().encode(JSON.stringify(message)).length
    // Ölçüm bu testin kendisidir (kart kabul kriteri) — çıplak sınır 4096 bayt
    // (WS maxPayload 8 KiB'in yarısı).
    expect(bytes).toBeLessThan(4096)
  })
})
