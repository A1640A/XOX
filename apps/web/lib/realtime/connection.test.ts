import type { RoomDoc } from '@xox/db'
import { type Cell, type ServerMessage, serverMessageSchema } from '@xox/shared'
import { describe, expect, it } from 'vitest'
import { createRoomConnection, type RoomConnection } from './connection'

const NOW = 1_700_000_000_000
const CODE = 'ABC234'

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
    code: CODE,
    state: 'playing',
    seats: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
    presence: {
      X: { connId: 'c1', since: new Date(NOW) },
      O: { connId: 'c2', since: new Date(NOW) },
    },
    board: cells('.........'),
    moves: [],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    lastEmoji: null,
    gameId: null,
    version: 10,
    startedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  }
}

interface Harness {
  conn: RoomConnection
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
}

/** Bağlantıyı X koltuğunda, `c1` bağlantı kimliğiyle, tam durum gönderilmiş olarak kurar. */
function harness(room: RoomDoc = makeRoom()): Harness {
  const sent: ServerMessage[] = []
  const closes: Harness['closes'] = []
  const conn = createRoomConnection({
    roomCode: CODE,
    connId: 'c1',
    userId: 'u1',
    now: () => NOW,
    socket: {
      send: (data) => {
        const parsed = serverMessageSchema.safeParse(JSON.parse(data))
        // Her giden mesaj protokole uymak ZORUNDA: sözleşme dışı bir mesaj
        // istemcide sessizce düşerdi.
        if (!parsed.success) throw new Error(`protokol dışı mesaj: ${data}`)
        sent.push(parsed.data)
      },
      close: (code, reason) => {
        closes.push({ code, reason: reason ?? '' })
      },
    },
  })
  conn.primeState(room)
  sent.length = 0
  return { conn, sent, closes }
}

describe('connection · ilk tam durum', () => {
  it('primeState tam state gönderir ve koltuğu belirler', () => {
    const sent: ServerMessage[] = []
    const conn = createRoomConnection({
      roomCode: CODE,
      connId: 'c2',
      userId: 'u2',
      now: () => NOW,
      socket: {
        send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
        close: () => undefined,
      },
    })
    conn.primeState(makeRoom())

    expect(conn.seat()).toBe('O')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'state', you: 'O', version: 10, roomCode: CODE })
  })

  it('koltuğu olmayan kullanıcı için primeState false döner ve mesaj GÖNDERMEZ', () => {
    const sent: ServerMessage[] = []
    const conn = createRoomConnection({
      roomCode: CODE,
      connId: 'c9',
      userId: 'yabanci',
      now: () => NOW,
      socket: {
        send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
        close: () => undefined,
      },
    })
    expect(conn.primeState(makeRoom())).toBe(false)
    expect(sent).toHaveLength(0)
    expect(conn.seat()).toBeNull()
  })
})

describe('connection · tahta deltası (§5.3)', () => {
  it('version+1 ve tek yeni hamle → ince yol move:applied', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        board: cells('X........'),
        moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
      }),
    )
    expect(h.sent).toStrictEqual([{ type: 'move:applied', index: 0, by: 'X', version: 11 }])
  })

  it('YAZAN bağlantı da kendi hamlesini bu yoldan öğrenir (R1)', () => {
    const h = harness()
    // Hamleyi yazan biziz (by: 'X' = bizim koltuğumuz) — yine de tek kaynak
    // change stream yankısıdır; süreç içi kısayol YOK.
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        board: cells('X........'),
        moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
      }),
    )
    expect(h.sent).toStrictEqual([{ type: 'move:applied', index: 0, by: 'X', version: 11 }])
  })

  it('version 2 atlarsa tam state gönderilir (boşluk → resync)', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 12,
        board: cells('XO.......'),
        moves: [
          { index: 0, by: 'X', at: new Date(NOW) },
          { index: 1, by: 'O', at: new Date(NOW) },
        ],
      }),
    )
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ type: 'state', version: 12 })
  })

  it('version+1 ama hamle sayısı DEĞİŞMEDİYSE tam state gönderilir', () => {
    const h = harness()
    h.conn.onRoomChange(makeRoom({ version: 11 }))
    expect(h.sent[0]).toMatchObject({ type: 'state', version: 11 })
  })

  it('hamle listesi DOLU ama uzunluğu değişmemişse ESKİ hamle tekrar yayınlanmaz', () => {
    // Presence/rematch gibi tahtaya dokunmayan bir yazma da version'ı artırır.
    // İnce yol yalnız hamle sayısına bakarak seçilmezse, aynı hamle ikinci kez
    // `move:applied` olarak gider ve istemci sürüm boşluğu sanıp resync ister.
    const afterMove = makeRoom({
      version: 11,
      board: cells('X........'),
      moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
    })
    const h = harness(afterMove)

    h.conn.onRoomChange({
      ...afterMove,
      version: 12,
      disconnected: { seat: 'O', at: new Date(NOW), graceEndsAt: new Date(NOW + 30_000) },
    })

    expect(h.sent.filter((m) => m.type === 'move:applied')).toHaveLength(0)
    expect(h.sent.filter((m) => m.type === 'state')).toHaveLength(1)
  })

  it('aynı version → hiçbir şey gönderilmez (kendi yazımızın yankısı işlenmişti)', () => {
    const h = harness()
    h.conn.onRoomChange(makeRoom({ version: 10 }))
    expect(h.sent).toStrictEqual([])
  })

  it('art arda iki hamle iki ayrı move:applied üretir', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        board: cells('X........'),
        moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
      }),
    )
    h.conn.onRoomChange(
      makeRoom({
        version: 12,
        board: cells('XO.......'),
        moves: [
          { index: 0, by: 'X', at: new Date(NOW) },
          { index: 4, by: 'O', at: new Date(NOW) },
        ],
      }),
    )
    expect(h.sent).toStrictEqual([
      { type: 'move:applied', index: 0, by: 'X', version: 11 },
      { type: 'move:applied', index: 4, by: 'O', version: 12 },
    ])
  })
})

describe('connection · türetilmiş olaylar', () => {
  it('rakip koltuğu dolunca opponent:joined', () => {
    const h = harness(makeRoom({ seats: { X: { userId: 'u1', name: 'Ada' }, O: null } }))
    h.conn.onRoomChange(makeRoom({ version: 11 }))
    expect(h.sent[0]).toStrictEqual({
      type: 'opponent:joined',
      userId: 'u2',
      seat: 'O',
      name: 'Kaan',
    })
  })

  it('KENDİ koltuğumuz için opponent:joined gönderilmez', () => {
    const empty = makeRoom({ seats: { X: null, O: { userId: 'u2', name: 'Kaan' } }, version: 9 })
    const sent: ServerMessage[] = []
    const conn = createRoomConnection({
      roomCode: CODE,
      connId: 'c1',
      userId: 'u1',
      now: () => NOW,
      socket: {
        send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
        close: () => undefined,
      },
    })
    // Koltuğumuz henüz yokken tam durum kurulamaz; join sonrası kurulur.
    expect(conn.primeState(empty)).toBe(false)
    conn.primeState(makeRoom())
    sent.length = 0

    conn.onRoomChange(makeRoom({ version: 11 }))
    expect(sent.filter((m) => m.type === 'opponent:joined')).toHaveLength(0)
  })

  it('rakip koparsa opponent:left, dönerse opponent:returned', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        disconnected: { seat: 'O', at: new Date(NOW), graceEndsAt: new Date(NOW + 30_000) },
      }),
    )
    expect(h.sent[0]).toStrictEqual({
      type: 'opponent:left',
      userId: 'u2',
      seat: 'O',
      graceEndsAt: NOW + 30_000,
    })

    h.sent.length = 0
    h.conn.onRoomChange(makeRoom({ version: 12 }))
    expect(h.sent[0]).toStrictEqual({ type: 'opponent:returned', seat: 'O' })
  })

  it('KENDİ kopmamız opponent:left üretmez', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        disconnected: { seat: 'X', at: new Date(NOW), graceEndsAt: new Date(NOW + 30_000) },
      }),
    )
    expect(h.sent.filter((m) => m.type === 'opponent:left')).toHaveLength(0)
  })

  it('rövanş teklifi ve iptali yayınlanır', () => {
    const finished = makeRoom({ state: 'finished', board: cells('XXXOO....'), version: 20 })
    const h = harness(finished)

    h.conn.onRoomChange(
      makeRoom({
        ...finished,
        version: 21,
        rematch: { by: 'O', expiresAt: new Date(NOW + 60_000) },
      }),
    )
    expect(h.sent[0]).toStrictEqual({
      type: 'rematch:offered',
      by: 'O',
      expiresAt: NOW + 60_000,
    })

    h.sent.length = 0
    h.conn.onRoomChange(makeRoom({ ...finished, version: 22 }))
    expect(h.sent[0]).toStrictEqual({ type: 'rematch:cancelled', reason: 'expired' })
  })

  it('oyun bitince game:over sonucu taşır', () => {
    const h = harness()
    const finishedAt = new Date(NOW + 500)
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        state: 'finished',
        board: cells('XXXOO....'),
        moves: [{ index: 2, by: 'X', at: new Date(NOW) }],
        updatedAt: finishedAt,
      }),
    )
    expect(h.sent).toStrictEqual([
      {
        type: 'game:over',
        status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
        endedAt: NOW + 500,
      },
      { type: 'move:applied', index: 2, by: 'X', version: 11 },
    ])
  })
})

describe('connection · emoji version kapısından ÖNCE', () => {
  it('version değişmese bile emoji yayınlanır', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({ version: 10, lastEmoji: { from: 'O', emoji: '👏', at: new Date(NOW + 10) } }),
    )
    expect(h.sent).toStrictEqual([{ type: 'chat:emoji', from: 'O', emoji: '👏', at: NOW + 10 }])
  })

  it('aynı emoji iki kez yayınlanmaz', () => {
    const h = harness()
    const withEmoji = makeRoom({
      version: 10,
      lastEmoji: { from: 'O', emoji: '👏', at: new Date(NOW + 10) },
    })
    h.conn.onRoomChange(withEmoji)
    h.conn.onRoomChange(withEmoji)
    expect(h.sent).toHaveLength(1)
  })

  it('primeState anındaki emoji tekrar yayınlanmaz', () => {
    const h = harness(makeRoom({ lastEmoji: { from: 'O', emoji: '🔥', at: new Date(NOW - 5) } }))
    h.conn.onRoomChange(
      makeRoom({ version: 10, lastEmoji: { from: 'O', emoji: '🔥', at: new Date(NOW - 5) } }),
    )
    expect(h.sent).toHaveLength(0)
  })

  it('palet dışı emoji yayınlanmaz — bozuk veri protokolü kirletmez', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({ version: 10, lastEmoji: { from: 'O', emoji: '<script>', at: new Date(NOW + 1) } }),
    )
    expect(h.sent).toStrictEqual([])
  })
})

describe('connection · takeover ve oda kaybı', () => {
  it('presence başka bir connId gösteriyorsa 4409 ile kapanır', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        presence: {
          X: { connId: 'YENI', since: new Date(NOW) },
          O: { connId: 'c2', since: new Date(NOW) },
        },
      }),
    )
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ type: 'error', code: 'SESSION_TAKEOVER' })
    expect(h.closes).toStrictEqual([{ code: 4409, reason: 'takeover' }])
  })

  it('kapandıktan sonra hiçbir mesaj gönderilmez', () => {
    const h = harness()
    h.conn.close(4409, 'takeover')
    h.sent.length = 0
    h.conn.onRoomChange(makeRoom({ version: 11 }))
    expect(h.sent).toStrictEqual([])
  })

  it('oda silinirse 4404 ile kapanır', () => {
    const h = harness()
    h.conn.onRoomDeleted()
    expect(h.closes).toStrictEqual([{ code: 4404, reason: 'room-deleted' }])
  })

  it('zorunlu resync tam state gönderir ve anlık görüntüyü tazeler', () => {
    const h = harness()
    h.conn.onForcedState(makeRoom({ version: 30, board: cells('XOX......') }))
    expect(h.sent[0]).toMatchObject({ type: 'state', version: 30 })

    h.sent.length = 0
    h.conn.onRoomChange(makeRoom({ version: 30, board: cells('XOX......') }))
    expect(h.sent).toStrictEqual([])
  })

  it('zorunlu resync odayı bulamazsa 4404 ile kapanır', () => {
    const h = harness()
    h.conn.onForcedState(null)
    expect(h.closes).toStrictEqual([{ code: 4404, reason: 'room-gone' }])
  })
})

describe('connection · sürüm gerilemesi (yarış koruması)', () => {
  it('ESKİ sürümlü bir olay YOK SAYILIR — tahta geriye alınmaz', () => {
    const h = harness()
    const v11 = makeRoom({
      version: 11,
      board: cells('X........'),
      moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
    })
    h.conn.onRoomChange(v11)
    h.sent.length = 0

    // Geç gelen v10 (yeniden açılış okuması ile canlı olay yarıştı)
    h.conn.onRoomChange(makeRoom({ version: 10 }))
    expect(h.sent).toStrictEqual([])
  })

  it('zorunlu resync ESKİ doküman getirirse tam state GÖNDERİLMEZ', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        board: cells('X........'),
        moves: [{ index: 0, by: 'X', at: new Date(NOW) }],
      }),
    )
    h.sent.length = 0

    h.conn.onForcedState(makeRoom({ version: 10 }))
    expect(h.sent).toStrictEqual([])
  })

  it('AYNI sürümlü zorunlu resync HÂLÂ gönderilir (sessizce sağır kalmak yasak)', () => {
    const h = harness()
    h.conn.onForcedState(makeRoom({ version: 10 }))
    expect(h.sent[0]).toMatchObject({ type: 'state', version: 10 })
  })
})

describe('connection · koltuk kaybı (4403)', () => {
  it('koltuklar başka kullanıcılara geçmişse olayda 4403 seat-lost ile kapanır', () => {
    const h = harness()
    h.conn.onRoomChange(
      makeRoom({
        version: 11,
        seats: { X: { userId: 'baska1', name: 'Zeynep' }, O: { userId: 'baska2', name: 'Efe' } },
      }),
    )
    expect(h.closes).toStrictEqual([{ code: 4403, reason: 'seat-lost' }])
    expect(h.sent).toStrictEqual([])
  })

  it('zorunlu resync koltuksuz oda getirirse 4403 seat-lost ile kapanır', () => {
    const h = harness()
    h.conn.onForcedState(
      makeRoom({
        version: 40,
        seats: { X: { userId: 'baska1', name: 'Zeynep' }, O: null },
      }),
    )
    expect(h.closes).toStrictEqual([{ code: 4403, reason: 'seat-lost' }])
    expect(h.sent).toStrictEqual([])
  })
})

describe('connection · protokol ihlali sayacı (KK-048)', () => {
  it('üçüncü ardışık ihlalde kapatma sinyali verir', () => {
    const h = harness()
    expect(h.conn.noteProtocolViolation()).toBe(false)
    expect(h.conn.noteProtocolViolation()).toBe(false)
    expect(h.conn.noteProtocolViolation()).toBe(true)
  })

  it('araya geçerli bir mesaj girerse sayaç sıfırlanır (ARDIŞIK olmalı)', () => {
    const h = harness()
    h.conn.noteProtocolViolation()
    h.conn.noteProtocolViolation()
    h.conn.noteValidMessage()
    expect(h.conn.noteProtocolViolation()).toBe(false)
    expect(h.conn.noteProtocolViolation()).toBe(false)
    expect(h.conn.noteProtocolViolation()).toBe(true)
  })
})
