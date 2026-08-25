import type { RoomDoc } from '@xox/db'
import { type Cell, type ServerMessage, serverMessageSchema } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { createRoomConnection, type RoomConnection } from '../connection'
import type { HandlerContext, RoomTransitions } from '../context'
import { handleRematchAccept, handleRematchOffer } from './rematch'

const NOW = 1_700_000_000_000
const CODE = 'ABC234'
const EMPTY: Cell[] = [null, null, null, null, null, null, null, null, null]

const ADA = { userId: 'u1', name: 'Ada' }
const KAAN = { userId: 'u2', name: 'Kaan' }

/** Ada X koltuğunda (`c1`), Kaan O koltuğunda (`c2`) — oyun bitmiş. */
function finishedRoom(overrides: Partial<RoomDoc> = {}): RoomDoc {
  return {
    code: CODE,
    state: 'finished',
    seats: { X: ADA, O: KAAN },
    presence: {
      X: { connId: 'c1', since: new Date(NOW) },
      O: { connId: 'c2', since: new Date(NOW) },
    },
    board: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
    moves: [
      { index: 0, by: 'X', at: new Date(NOW) },
      { index: 3, by: 'O', at: new Date(NOW) },
      { index: 1, by: 'X', at: new Date(NOW) },
      { index: 4, by: 'O', at: new Date(NOW) },
      { index: 2, by: 'X', at: new Date(NOW) },
    ],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    result: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
    lastEmoji: null,
    gameId: 'g1',
    version: 30,
    startedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  }
}

/** Koltuklar VE presence takas edilmiş, yeni oyun — otoritenin ürettiği oda. */
function afterRematch(overrides: Partial<RoomDoc> = {}): RoomDoc {
  return finishedRoom({
    state: 'playing',
    seats: { X: KAAN, O: ADA },
    presence: {
      X: { connId: 'c2', since: new Date(NOW) },
      O: { connId: 'c1', since: new Date(NOW) },
    },
    board: [...EMPTY],
    moves: [],
    result: null,
    rematch: null,
    gameId: 'g2',
    version: 32,
    ...overrides,
  })
}

interface Fixture {
  context: HandlerContext
  connection: RoomConnection
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
}

function fixture(overrides: Partial<RoomTransitions> = {}, userId = 'u1', connId = 'c1'): Fixture {
  const sent: ServerMessage[] = []
  const closes: Fixture['closes'] = []
  const room = finishedRoom()
  const ok = { ok: true as const, room, events: [] }

  const db: RoomTransitions = {
    findRoom: () => Promise.resolve(room),
    joinRoom: () => Promise.resolve(ok),
    applyMove: () => Promise.resolve(ok),
    resign: () => Promise.resolve(ok),
    offerRematch: () => Promise.resolve(ok),
    acceptRematch: () => Promise.resolve(ok),
    pushEmoji: () => Promise.resolve(ok),
    settleDeadlines: () => Promise.resolve(null),
    detachConnection: () => Promise.resolve(),
    ...overrides,
  }

  const connection = createRoomConnection({
    roomCode: CODE,
    connId,
    userId,
    now: () => NOW,
    socket: {
      send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
      close: (code, reason) => closes.push({ code, reason: reason ?? '' }),
    },
  })

  return {
    sent,
    closes,
    connection,
    context: {
      roomCode: CODE,
      connId,
      identity: { userId, name: 'Ada' },
      connection,
      db,
      now: () => NOW,
    },
  }
}

describe('rematch handler`ları (KK-055…058)', () => {
  it('teklif ve kabul otoriteye doğru argümanlarla delege edilir', async () => {
    const offerRematch = vi.fn(() =>
      Promise.resolve({ ok: true as const, room: finishedRoom(), events: [] }),
    )
    const acceptRematch = vi.fn(() =>
      Promise.resolve({ ok: true as const, room: afterRematch(), events: [] }),
    )
    const f = fixture({ offerRematch, acceptRematch })

    await handleRematchOffer(f.context)
    await handleRematchAccept(f.context)

    expect(offerRematch).toHaveBeenCalledWith(CODE, 'u1')
    expect(acceptRematch).toHaveBeenCalledWith(CODE, 'u1')
  })

  it('R1: başarılı teklif/kabulde doğrudan mesaj GÖNDERİLMEZ', async () => {
    const f = fixture()
    f.connection.primeState(finishedRoom())
    f.sent.length = 0

    await handleRematchOffer(f.context)
    await handleRematchAccept(f.context)

    expect(f.sent).toStrictEqual([])
    expect(f.closes).toStrictEqual([])
  })

  it('süresi geçmiş teklif REMATCH_EXPIRED hatası döner (KK-057)', async () => {
    const f = fixture({
      acceptRematch: () => Promise.resolve({ ok: false, code: 'REMATCH_EXPIRED' }),
    })

    await handleRematchAccept(f.context)

    expect(f.sent).toStrictEqual([
      {
        type: 'error',
        code: 'REMATCH_EXPIRED',
        message: 'Rövanş teklifi zaman aşımına uğradı.',
      },
    ])
    expect(f.closes).toStrictEqual([])
  })

  it('oyun bitmeden teklif INVALID_MESSAGE ile reddedilir', async () => {
    const f = fixture({
      offerRematch: () => Promise.resolve({ ok: false, code: 'INVALID_MESSAGE' }),
    })

    await handleRematchOffer(f.context)

    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'INVALID_MESSAGE' })
  })

  it('protokol dışı kod SERVER_ERROR`a daraltılır', async () => {
    const f = fixture({ offerRematch: () => Promise.resolve({ ok: false, code: 'game-over' }) })

    await handleRematchOffer(f.context)

    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'SERVER_ERROR', message: 'Rövanş teklifi gönderilemedi.' },
    ])
  })
})

/**
 * Teklifin KARŞI TARAFA ulaşması R1 gereği change stream üzerindendir: oda
 * dokümanı değişir, `connection.ts` türetilmiş olayı üretir. Buradaki testler
 * o yolu (odanın yeni hâli → giden mesaj) doğruluyor; ağ gecikmesi
 * (KK-055'in ≤2 sn bütçesi) preview E2E'nin konusudur.
 */
describe('rövanşın canlı katmana yansıması', () => {
  it('rakibin teklifi rematch:offered olarak düşer', () => {
    const f = fixture({}, 'u2', 'c2')
    f.connection.primeState(finishedRoom())
    f.sent.length = 0

    const expiresAt = new Date(NOW + 60_000)
    f.connection.onRoomChange(finishedRoom({ version: 31, rematch: { by: 'X', expiresAt } }))

    expect(f.sent[0]).toStrictEqual({
      type: 'rematch:offered',
      by: 'X',
      expiresAt: NOW + 60_000,
    })
  })

  it('teklif state mesajında da görünür (Z2 rotasyonundan sonra kaybolmaz)', () => {
    const f = fixture({}, 'u2', 'c2')
    const expiresAt = new Date(NOW + 60_000)

    f.connection.primeState(finishedRoom({ version: 31, rematch: { by: 'X', expiresAt } }))

    expect(f.sent[0]).toMatchObject({
      type: 'state',
      rematch: { by: 'X', expiresAt: NOW + 60_000 },
    })
  })

  it('pes sonucu game:over olarak KAZANAN ile gider (rooms.result borcu kapandı)', () => {
    const f = fixture({}, 'u1', 'c1')
    f.connection.primeState(finishedRoom({ state: 'playing', result: null, board: [...EMPTY] }))
    f.sent.length = 0

    f.connection.onRoomChange(
      finishedRoom({
        version: 31,
        board: [...EMPTY],
        moves: [],
        result: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
      }),
    )

    expect(f.sent[0]).toStrictEqual({
      type: 'game:over',
      status: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
      endedAt: NOW,
    })
  })

  it('KOLTUK TAKASINDA seat-lost/takeover TETİKLENMEZ — iki istemci de bağlı kalır', () => {
    const ada = fixture({}, 'u1', 'c1')
    const kaan = fixture({}, 'u2', 'c2')
    ada.connection.primeState(finishedRoom())
    kaan.connection.primeState(finishedRoom())
    ada.sent.length = 0
    kaan.sent.length = 0

    const swapped = afterRematch()
    ada.connection.onRoomChange(swapped)
    kaan.connection.onRoomChange(swapped)

    // Hiçbir 4403 (`seat-lost`) ve hiçbir 4409 (`takeover`) yok.
    expect(ada.closes).toStrictEqual([])
    expect(kaan.closes).toStrictEqual([])
    expect(ada.connection.isClosed()).toBe(false)
    expect(kaan.connection.isClosed()).toBe(false)
    // Her ikisi de YENİ koltuğuyla tam durum aldı.
    expect(ada.connection.seat()).toBe('O')
    expect(kaan.connection.seat()).toBe('X')
    expect(ada.sent.at(-1)).toMatchObject({ type: 'state', you: 'O', version: 32 })
    expect(kaan.sent.at(-1)).toMatchObject({ type: 'state', you: 'X', version: 32 })
    // Tahta TÜMÜYLE değişti: rövanş ince delta ile gönderilemez (KK-047).
    expect(ada.sent.at(-1)).toMatchObject({ board: EMPTY })
  })

  it('NEGATİF KONTROL: presence takas EDİLMEZSE aynı akış 4409 üretir', () => {
    // Bu test koltuk takasının neden presence`i de taşımak ZORUNDA olduğunu
    // kilitler; `rooms/rematch.ts` presence takasını düşürürse kırmızı olur.
    const ada = fixture({}, 'u1', 'c1')
    ada.connection.primeState(finishedRoom())
    ada.sent.length = 0

    ada.connection.onRoomChange(
      afterRematch({
        presence: {
          X: { connId: 'c1', since: new Date(NOW) },
          O: { connId: 'c2', since: new Date(NOW) },
        },
      }),
    )

    expect(ada.closes).toStrictEqual([{ code: 4409, reason: 'takeover' }])
  })
})
