import type { RoomDoc } from '@xox/db'
import { type Cell, type ClientMessage, type ServerMessage, serverMessageSchema } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { createRoomConnection } from '../connection'
import type { HandlerContext, RoomTransitions } from '../context'
import { dispatchMessage, handlers } from './index'

const NOW = 1_700_000_000_000
const CODE = 'ABC234'
const EMPTY: Cell[] = [null, null, null, null, null, null, null, null, null]

/**
 * Beklenti tablosu **elle** yazıldı — `clientMessageSchema`dan TÜRETİLMEDİ.
 * Türetilmiş bir liste, protokolden bir mesaj tipi silindiğinde onunla birlikte
 * küçülür ve kaydın eksildiğini göremez (kendine-referanslı test tuzağı).
 */
const BEKLENEN_MESAJ_TIPLERI = [
  'join',
  'move',
  'resign',
  'rematch:offer',
  'rematch:accept',
  'chat:emoji',
  'ping',
] as const

/**
 * Gerçekten yazılan handler'lar. WS-001: `join`/`move`/`ping` · W1-02:
 * `resign`/`rematch:*` · W3-03: `chat:emoji` — hepsinin kendi test dosyası var.
 * **Artık iskelet KALMADI**; aşağıdaki "iskelet kalmadı" testi bunu kilitliyor,
 * yani bu küme bir gün sessizce kısalırsa test kırmızı olur.
 */
const UYGULANAN = new Set<string>([
  'join',
  'move',
  'ping',
  'resign',
  'rematch:offer',
  'rematch:accept',
  'chat:emoji',
])

/**
 * Başarı yolunda İSTEMCİYE HİÇBİR ŞEY göndermemesi gereken handler'lar (R1).
 * ELLE yazılır — önceki sürüm bu listeyi `!UYGULANAN.has(...)`'tan TÜRETİYORDU,
 * yani bir handler yazıldıkça R1 sondasının kapsamından sessizce DÜŞÜYORDU.
 * `join` ve `ping` bilerek dışarıda: ikisi doğrudan yanıt üretir.
 */
const YAZAN_HANDLERLAR = new Set<string>([
  'move',
  'resign',
  'rematch:offer',
  'rematch:accept',
  'chat:emoji',
])

function makeRoom(overrides: Partial<RoomDoc> = {}): RoomDoc {
  return {
    code: CODE,
    state: 'playing',
    seats: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
    presence: {
      X: { connId: 'c1', since: new Date(NOW) },
      O: { connId: 'c2', since: new Date(NOW) },
    },
    board: [...EMPTY],
    moves: [],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    result: null,
    lastEmoji: null,
    gameId: null,
    version: 10,
    startedAt: new Date(NOW),
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  }
}

interface Fixture {
  context: HandlerContext
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
  db: RoomTransitions
}

/** Her geçişin BAŞARILI döndüğü bir dünya: R1 sondasının koşacağı zemin. */
function fixture(overrides: Partial<RoomTransitions> = {}): Fixture {
  const sent: ServerMessage[] = []
  const closes: Fixture['closes'] = []
  const room = makeRoom()
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
    connId: 'c1',
    userId: 'u1',
    now: () => NOW,
    socket: {
      send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
      close: (code, reason) => closes.push({ code, reason: reason ?? '' }),
    },
  })

  return {
    sent,
    closes,
    db,
    context: {
      roomCode: CODE,
      connId: 'c1',
      identity: { userId: 'u1', name: 'Ada' },
      connection,
      db,
      now: () => NOW,
    },
  }
}

/** Her mesaj tipi için geçerli bir örnek — dispatch'i gerçekten koşturmak için. */
const ORNEK_MESAJLAR: ClientMessage[] = [
  { type: 'join', roomCode: CODE },
  { type: 'move', index: 4 },
  { type: 'resign' },
  { type: 'rematch:offer' },
  { type: 'rematch:accept' },
  { type: 'chat:emoji', emoji: '👏' },
  { type: 'ping' },
]

describe('handlers kayıt defteri · DONDURULMUŞ', () => {
  it('protokoldeki her istemci mesaj tipi için TAM bir giriş vardır', () => {
    expect(Object.keys(handlers).toSorted()).toStrictEqual([...BEKLENEN_MESAJ_TIPLERI].toSorted())
  })

  it('her giriş bir fonksiyondur (iskelet olsa bile)', () => {
    for (const type of BEKLENEN_MESAJ_TIPLERI) {
      expect(typeof handlers[type]).toBe('function')
    }
  })

  it('örnek mesaj tablosu protokolün tamamını kapsar', () => {
    expect(ORNEK_MESAJLAR.map((m) => m.type).toSorted()).toStrictEqual(
      [...BEKLENEN_MESAJ_TIPLERI].toSorted(),
    )
  })
})

describe('R1 SONDASI · yazan bağlantıya süreç içi kısayol YOK', () => {
  it('BAŞARILI bir geçişten sonra hiçbir yazma handler`ı mesaj göndermez', async () => {
    const yazanHandlerlar = ORNEK_MESAJLAR.filter((m) => YAZAN_HANDLERLAR.has(m.type))
    expect(yazanHandlerlar).toHaveLength(YAZAN_HANDLERLAR.size)

    for (const message of yazanHandlerlar) {
      const f = fixture()
      f.context.connection.primeState(makeRoom())
      f.sent.length = 0

      await dispatchMessage(f.context, message)

      const kacak = f.sent.filter((m) => m.type !== 'error')
      expect(
        kacak,
        `${message.type} başarı yolunda mesaj gönderdi — fan-out yalnız change stream'den olmalı`,
      ).toStrictEqual([])
    }
  })

  it('move başarılıysa TEK bir bayt bile gitmez', async () => {
    const f = fixture()
    f.context.connection.primeState(makeRoom())
    f.sent.length = 0

    await dispatchMessage(f.context, { type: 'move', index: 4 })

    expect(f.sent).toStrictEqual([])
    expect(f.closes).toStrictEqual([])
  })

  it('yalnız join (resync) ve ping doğrudan yanıt üretir', async () => {
    const f = fixture()
    await dispatchMessage(f.context, { type: 'join', roomCode: CODE })
    expect(f.sent.map((m) => m.type)).toStrictEqual(['state'])

    f.sent.length = 0
    await dispatchMessage(f.context, { type: 'ping' })
    expect(f.sent).toStrictEqual([{ type: 'pong' }])
  })
})

describe('iskelet handler kalmadı (W3-03 sonuncusunu kapattı)', () => {
  it('protokoldeki HER mesaj tipinin gerçek bir handler`ı var', () => {
    const iskeletler = ORNEK_MESAJLAR.map((m) => m.type).filter((type) => !UYGULANAN.has(type))

    expect(iskeletler).toStrictEqual([])
    // "Yokluk" iddiasının yanında DOLU liste: küme gerçekten yedi tipi sayıyor,
    // boş bir `UYGULANAN` da yukarıdaki iddiayı sessizce yeşil yapardı.
    expect(UYGULANAN.size).toBe(7)
    expect([...UYGULANAN].toSorted()).toStrictEqual([...BEKLENEN_MESAJ_TIPLERI].toSorted())
  })

  it('mutlu yolda hiçbir handler SERVER_ERROR yazmıyor (iskelet cevabı yok)', async () => {
    const gorulen: string[] = []

    for (const message of ORNEK_MESAJLAR) {
      const f = fixture()
      f.context.connection.primeState(makeRoom())
      f.sent.length = 0

      await dispatchMessage(f.context, message)
      gorulen.push(message.type)

      const sunucuHatalari = f.sent.filter((m) => m.type === 'error' && m.code === 'SERVER_ERROR')
      expect(sunucuHatalari, message.type).toStrictEqual([])
    }

    // Döngü GERÇEKTEN yedi tipi dolaştı — boş bir dizi de yukarıyı yeşil yapardı.
    expect(gorulen).toHaveLength(7)
  })
})

describe('move handler`ı', () => {
  it('reddedilen hamlede YALNIZ move:rejected yazar', async () => {
    const f = fixture({ applyMove: () => Promise.resolve({ ok: false, code: 'not-your-turn' }) })
    await dispatchMessage(f.context, { type: 'move', index: 3 })
    expect(f.sent).toStrictEqual([{ type: 'move:rejected', index: 3, reason: 'not-your-turn' }])
  })

  it('dolu hücre reddi sebebi taşır', async () => {
    const f = fixture({ applyMove: () => Promise.resolve({ ok: false, code: 'occupied' }) })
    await dispatchMessage(f.context, { type: 'move', index: 0 })
    expect(f.sent).toStrictEqual([{ type: 'move:rejected', index: 0, reason: 'occupied' }])
  })

  it('hamle dışı bir hata kodu error olarak gider (move:rejected DEĞİL)', async () => {
    const f = fixture({ applyMove: () => Promise.resolve({ ok: false, code: 'ROOM_NOT_FOUND' }) })
    await dispatchMessage(f.context, { type: 'move', index: 0 })
    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'ROOM_NOT_FOUND', message: expect.stringContaining('Oda') },
    ])
  })

  it('doğru argümanlarla applyMove çağrılır', async () => {
    const applyMove = vi.fn(() =>
      Promise.resolve({ ok: true as const, room: makeRoom(), events: [] }),
    )
    const f = fixture({ applyMove })
    await dispatchMessage(f.context, { type: 'move', index: 7 })
    expect(applyMove).toHaveBeenCalledWith(CODE, 'u1', 7)
  })
})

describe('join handler`ı', () => {
  it('başarılı katılımda tam state gönderir', async () => {
    const f = fixture()
    await dispatchMessage(f.context, { type: 'join', roomCode: CODE })
    expect(f.sent[0]).toMatchObject({ type: 'state', you: 'X', roomCode: CODE })
  })

  it('oda yoksa 4404 ile kapatır', async () => {
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: false, code: 'ROOM_NOT_FOUND' }) })
    await dispatchMessage(f.context, { type: 'join', roomCode: CODE })
    expect(f.closes).toStrictEqual([{ code: 4404, reason: 'room-not-found' }])
  })

  it('oda doluysa 4403 ile kapatır', async () => {
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: false, code: 'ROOM_FULL' }) })
    await dispatchMessage(f.context, { type: 'join', roomCode: CODE })
    expect(f.closes).toStrictEqual([{ code: 4403, reason: 'room-full' }])
  })

  it('BAŞKA bir odanın kodu reddedilir — soket tek odaya bağlıdır', async () => {
    const joinRoom = vi.fn(() =>
      Promise.resolve({ ok: true as const, room: makeRoom(), events: [] }),
    )
    const f = fixture({ joinRoom })
    await dispatchMessage(f.context, { type: 'join', roomCode: 'ZZZ999' })

    expect(joinRoom).not.toHaveBeenCalled()
    expect(f.sent[0]).toMatchObject({ type: 'error', code: 'INVALID_CODE' })
    expect(f.closes).toStrictEqual([])
  })

  it('koltuk alınamadıysa 4403 ile kapatır (savunmacı dal)', async () => {
    const room = makeRoom({ seats: { X: { userId: 'baskasi', name: 'Zeynep' }, O: null } })
    const f = fixture({ joinRoom: () => Promise.resolve({ ok: true, room, events: [] }) })
    await dispatchMessage(f.context, { type: 'join', roomCode: CODE })
    expect(f.closes).toStrictEqual([{ code: 4403, reason: 'no-seat' }])
  })
})
