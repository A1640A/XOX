import type { RoomDoc } from '@xox/db'
import {
  EMOJI_RATE_LIMIT,
  WS_HEARTBEAT_MS,
  type Cell,
  type ServerMessage,
  serverMessageSchema,
} from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { createRoomConnection } from '../connection'
import type { HandlerContext, RoomTransitions } from '../context'
import type { RoomHub, RoomHubStats, RoomSubscriber } from '../room-hub'
import { createRoomSession, type RoomSession } from '../session'
import type { SettlementTimer } from '../timers'
import { handleChatEmoji } from './emoji'

const NOW = 1_700_000_000_000
const CODE = 'ABC234'
const EMPTY: Cell[] = [null, null, null, null, null, null, null, null, null]

/**
 * ÇIPLAK sayılar. `EMOJI_RATE_LIMIT`ten türetilmiş bir beklenti, sabit
 * yanlışlıkla 50'ye çıkarılsa da testi yeşil tutardı (conventions.md
 * "iki katmanlı test"); sabitin kendisiyle ayrıca karşılaştırılıyorlar.
 */
const LIMIT = 5
const WINDOW_MS = 10_000

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

// ─── oturum (GERÇEK yol: zod → hız kapısı → handler) ──────────────────────

interface SessionFixture {
  session: RoomSession
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
  pushEmoji: ReturnType<typeof vi.fn<RoomTransitions['pushEmoji']>>
  /** Sahte saat — `advance()` ile kayan pencere ilerletilir. */
  advance(ms: number): void
  /** Bugüne kadar gönderilen `error` mesajlarının kodları. */
  errorCodes(): string[]
}

function sessionFixture(options: { connId?: string; userId?: string } = {}): SessionFixture {
  const sent: ServerMessage[] = []
  const closes: SessionFixture['closes'] = []
  const room = makeRoom()
  let clock = NOW

  const pushEmoji = vi.fn<RoomTransitions['pushEmoji']>(() =>
    Promise.resolve({ ok: true as const, room, events: [] }),
  )

  const db: RoomTransitions = {
    findRoom: () => Promise.resolve(room),
    joinRoom: () => Promise.resolve({ ok: true, room, events: [] }),
    applyMove: () => Promise.resolve({ ok: true, room, events: [] }),
    resign: () => Promise.resolve({ ok: true, room, events: [] }),
    offerRematch: () => Promise.resolve({ ok: true, room, events: [] }),
    acceptRematch: () => Promise.resolve({ ok: true, room, events: [] }),
    pushEmoji,
    settleDeadlines: () => Promise.resolve(null),
    detachConnection: () => Promise.resolve(),
  }

  const subscribers: RoomSubscriber[] = []
  const hub: RoomHub = {
    subscribe: (subscriber) => {
      subscribers.push(subscriber)
      return Promise.resolve()
    },
    unsubscribe: () => Promise.resolve(),
    stats: (): RoomHubStats => ({
      watchCalls: 1,
      openStreams: 1,
      rooms: 1,
      subscribers: subscribers.length,
      reopenAttempts: 0,
      hasResumeToken: false,
    }),
  }

  const settlementTimer: SettlementTimer = {
    schedule: () => undefined,
    cancel: () => undefined,
    isArmed: () => false,
  }

  const session = createRoomSession({
    roomCode: CODE,
    connId: options.connId ?? 'c1',
    identity: { userId: options.userId ?? 'u1', name: 'Ada' },
    socket: {
      send: (data) => sent.push(serverMessageSchema.parse(JSON.parse(data))),
      close: (code, reason) => closes.push({ code, reason: reason ?? '' }),
    },
    hub,
    db,
    now: () => clock,
    setTimer: () => 0,
    clearTimer: () => undefined,
    getDeadline: () => new Date(NOW + 800_000),
    logError: () => undefined,
    settlementTimer,
  })

  return {
    session,
    sent,
    closes,
    pushEmoji,
    advance: (ms) => {
      clock += ms
    },
    errorCodes: () =>
      sent.filter((message) => message.type === 'error').map((message) => message.code),
  }
}

function emojiFrame(emoji: string): string {
  return JSON.stringify({ type: 'chat:emoji', emoji })
}

// ─── doğrudan handler (oturumun ulaşamadığı dallar) ───────────────────────

interface HandlerFixture {
  context: HandlerContext
  sent: ServerMessage[]
  closes: { code: number; reason: string }[]
}

function handlerFixture(
  pushEmojiImpl: RoomTransitions['pushEmoji'],
  seated = true,
): HandlerFixture {
  const sent: ServerMessage[] = []
  const closes: HandlerFixture['closes'] = []
  const room = makeRoom()
  const ok = { ok: true as const, room, events: [] }

  const db: RoomTransitions = {
    findRoom: () => Promise.resolve(room),
    joinRoom: () => Promise.resolve(ok),
    applyMove: () => Promise.resolve(ok),
    resign: () => Promise.resolve(ok),
    offerRematch: () => Promise.resolve(ok),
    acceptRematch: () => Promise.resolve(ok),
    pushEmoji: pushEmojiImpl,
    settleDeadlines: () => Promise.resolve(null),
    detachConnection: () => Promise.resolve(),
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
  if (seated) {
    connection.primeState(room)
    sent.length = 0
  }

  return {
    sent,
    closes,
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

describe('chat:emoji handler`ı — KK-122…124', () => {
  it('geçerli emoji otoriteye koltuk + emoji ile delege edilir', async () => {
    const f = sessionFixture()
    await f.session.start()

    await f.session.handleMessage(emojiFrame('🔥'))

    expect(f.pushEmoji).toHaveBeenCalledExactlyOnceWith(CODE, 'X', '🔥')
  })

  it('R1: BAŞARILI emojide istemciye tek bayt gitmez — yankı change stream`den', async () => {
    const f = sessionFixture()
    await f.session.start()
    f.sent.length = 0

    await f.session.handleMessage(emojiFrame('👏'))

    expect(f.sent).toStrictEqual([])
    expect(f.closes).toStrictEqual([])
  })

  it('KK-124: 10 sn içinde 6. emoji RATE_LIMITED alır ve otoriteye HİÇ ulaşmaz', async () => {
    const f = sessionFixture()
    await f.session.start()
    f.sent.length = 0

    for (let i = 0; i < LIMIT; i += 1) {
      await f.session.handleMessage(emojiFrame('👋'))
      f.advance(100)
    }
    // Eşik altındaki beş çerçeve TEMİZ geçti — "yokluk" iddiasının pozitif eşi.
    expect(f.pushEmoji).toHaveBeenCalledTimes(LIMIT)
    expect(f.errorCodes()).toStrictEqual([])

    await f.session.handleMessage(emojiFrame('👋'))

    expect(f.errorCodes()).toStrictEqual(['RATE_LIMITED'])
    // Fazla mesaj İLETİLMEZ: sayaç 5'te takılı kaldı, 6'ya çıkmadı.
    expect(f.pushEmoji).toHaveBeenCalledTimes(LIMIT)
    expect(LIMIT).toBe(EMOJI_RATE_LIMIT.count)
  })

  it('sınırı aşmak bağlantıyı KAPATMAZ; oturum çalışmaya devam eder', async () => {
    const f = sessionFixture()
    await f.session.start()

    for (let i = 0; i < LIMIT + 1; i += 1) {
      await f.session.handleMessage(emojiFrame('😀'))
    }
    f.sent.length = 0
    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))

    expect(f.closes).toStrictEqual([])
    expect(f.sent.map((message) => message.type)).toStrictEqual(['pong'])
  })

  it('pencere kayınca meşru emoji YİNE geçer (kalıcı ceza yok)', async () => {
    const f = sessionFixture()
    await f.session.start()
    for (let i = 0; i < LIMIT + 1; i += 1) {
      await f.session.handleMessage(emojiFrame('😢'))
    }
    expect(f.errorCodes()).toStrictEqual(['RATE_LIMITED'])
    f.sent.length = 0

    f.advance(WINDOW_MS)
    await f.session.handleMessage(emojiFrame('🤝'))

    expect(f.errorCodes()).toStrictEqual([])
    expect(f.pushEmoji).toHaveBeenLastCalledWith(CODE, 'X', '🤝')
    expect(WINDOW_MS).toBe(EMOJI_RATE_LIMIT.windowMs)
  })

  it('pencere DOLMADAN (1 ms eksik) hâlâ reddedilir — sınır kayan pencere', async () => {
    const f = sessionFixture()
    await f.session.start()
    for (let i = 0; i < LIMIT; i += 1) await f.session.handleMessage(emojiFrame('😮'))
    f.sent.length = 0

    f.advance(WINDOW_MS - 1)
    await f.session.handleMessage(emojiFrame('😮'))

    expect(f.errorCodes()).toStrictEqual(['RATE_LIMITED'])
    expect(f.pushEmoji).toHaveBeenCalledTimes(LIMIT)
  })

  it('bütçe bağlantı BAŞINA: tükenen bir bağlantı diğerini etkilemez', async () => {
    const ada = sessionFixture({ connId: 'c1', userId: 'u1' })
    const kaan = sessionFixture({ connId: 'c2', userId: 'u2' })
    await ada.session.start()
    await kaan.session.start()

    for (let i = 0; i < LIMIT + 1; i += 1) await ada.session.handleMessage(emojiFrame('🔥'))
    await kaan.session.handleMessage(emojiFrame('🔥'))

    expect(ada.errorCodes()).toStrictEqual(['RATE_LIMITED'])
    expect(kaan.errorCodes()).toStrictEqual([])
    expect(kaan.pushEmoji).toHaveBeenCalledExactlyOnceWith(CODE, 'O', '🔥')
  })

  it('KK-123: palet DIŞI emoji INVALID_MESSAGE alır ve otoriteye ULAŞMAZ', async () => {
    const f = sessionFixture()
    await f.session.start()
    // POZİTİF kontrol: aynı oturumda geçerli emoji GERÇEKTEN geçiyor.
    await f.session.handleMessage(emojiFrame('👋'))
    expect(f.pushEmoji).toHaveBeenCalledTimes(1)
    f.sent.length = 0

    await f.session.handleMessage(emojiFrame('💣'))

    expect(f.errorCodes()).toStrictEqual(['INVALID_MESSAGE'])
    expect(f.pushEmoji).toHaveBeenCalledTimes(1)
  })

  it('KK-123: serbest metin de INVALID_MESSAGE — uzunluk kontrolü YETMEZ', async () => {
    const f = sessionFixture()
    await f.session.start()
    await f.session.handleMessage(emojiFrame('👋'))
    f.sent.length = 0

    await f.session.handleMessage(emojiFrame('<img src=x onerror=alert(1)>'))
    await f.session.handleMessage(emojiFrame('a'))

    expect(f.errorCodes()).toStrictEqual(['INVALID_MESSAGE', 'INVALID_MESSAGE'])
    expect(f.pushEmoji).toHaveBeenCalledTimes(1)
  })

  it('GENEL sınırla çakışmaz: 5 emoji + nabız + hamle aynı pencerede temiz geçer', async () => {
    const f = sessionFixture()
    await f.session.start()
    f.sent.length = 0

    for (let i = 0; i < LIMIT; i += 1) {
      await f.session.handleMessage(emojiFrame('👏'))
      f.advance(50)
    }
    await f.session.handleMessage(JSON.stringify({ type: 'ping' }))
    await f.session.handleMessage(JSON.stringify({ type: 'move', index: 0 }))

    // Genel bütçe 10 sn / 20 çerçeve; buradaki 7 çerçeve onun ÇOK altında.
    // Nabız gerçekte 25 sn'de bir (`WS_HEARTBEAT_MS`), yani penceresine en
    // fazla bir kez düşer — meşru kullanım iki sınırın hiçbirine değmez.
    expect(f.errorCodes()).toStrictEqual([])
    expect(f.pushEmoji).toHaveBeenCalledTimes(LIMIT)
    expect(WS_HEARTBEAT_MS).toBeGreaterThan(WINDOW_MS)
  })

  it('emoji sınırı GENEL sınırdan ÖNCE ateşlenir (5 < 20) — bağlantı yaşar', async () => {
    const f = sessionFixture()
    await f.session.start()
    f.sent.length = 0

    // 19 emoji çerçevesi: genel bütçe (20) hâlâ aşılmadı, emoji bütçesi (5) çoktan.
    for (let i = 0; i < 19; i += 1) await f.session.handleMessage(emojiFrame('😂'))

    expect(new Set(f.errorCodes())).toStrictEqual(new Set(['RATE_LIMITED']))
    expect(f.closes).toStrictEqual([])
    expect(f.pushEmoji).toHaveBeenCalledTimes(LIMIT)
  })

  it('otorite ROOM_NOT_FOUND dönerse hata istemciye yazılır', async () => {
    const f = handlerFixture(() => Promise.resolve({ ok: false, code: 'ROOM_NOT_FOUND' }))

    await handleChatEmoji(f.context, { type: 'chat:emoji', emoji: '🔥' })

    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Oda bulunamadı.' },
    ])
    expect(f.closes).toStrictEqual([])
  })

  it('protokol dışı bir kod SERVER_ERROR`a daraltılır (ham kod tele KONMAZ)', async () => {
    const f = handlerFixture(() => Promise.resolve({ ok: false, code: 'not-your-turn' }))

    await handleChatEmoji(f.context, { type: 'chat:emoji', emoji: '🔥' })

    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'SERVER_ERROR', message: 'Emoji gönderilemedi.' },
    ])
  })

  it('koltuksuz bağlantı ROOM_FULL alır ve otorite HİÇ çağrılmaz', async () => {
    const pushEmoji = vi.fn<RoomTransitions['pushEmoji']>(() =>
      Promise.resolve({ ok: true as const, room: makeRoom(), events: [] }),
    )
    const f = handlerFixture(pushEmoji, false)

    await handleChatEmoji(f.context, { type: 'chat:emoji', emoji: '🔥' })

    expect(f.sent).toStrictEqual([
      { type: 'error', code: 'ROOM_FULL', message: 'Bu odada bir koltuğunuz yok.' },
    ])
    expect(pushEmoji).not.toHaveBeenCalled()
  })
})
