import { describe, expect, it } from 'vitest'
import { DISCONNECT_GRACE_SECONDS, WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS } from './constants'
import type { Cell } from './primitives'
import {
  OPPONENT_LEFT_DISPLAY_DELAY_MS,
  type RoomClientEvent,
  type RoomClientState,
  initialRoomClientState,
  nextReconnectDelay,
  opponentLeftVisible,
  roomClientReducer,
} from './room-client'
import {
  WS_CLOSE,
  isPermanentCloseCode,
  isReconnectableCloseCode,
  requiresReauth,
} from './ws-close'
import type { ServerMessage, StateMessage } from './ws-protocol'

// ─── yardımcılar ──────────────────────────────────────────────────────────
// Beklentiler tasarım §5.6 tablosundan ELLE yazıldı; hiçbir beklenen değer
// test edilen koddan türetilmiyor (bkz. gotchas: kendine-referanslı test).

const bosTahta = (): Cell[] => [null, null, null, null, null, null, null, null, null]

/** Sırası X'te olan, bağlı, koltuğu X olan bir istemci. */
function bagliDurum(patch: Partial<RoomClientState> = {}): RoomClientState {
  return { ...initialRoomClientState(), connection: 'bagli', you: 'X', version: 3, ...patch }
}

function tamDurumMesaji(patch: Partial<StateMessage> = {}): StateMessage {
  return {
    type: 'state',
    roomCode: 'ABC234',
    board: bosTahta(),
    status: { kind: 'playing', turn: 'X' },
    players: { X: { userId: 'u1', name: 'Ayse' }, O: null },
    you: 'X',
    version: 7,
    turnDeadline: null,
    graceEndsAt: null,
    rematch: null,
    serverTime: 5_000,
    ...patch,
  }
}

function sunucudan(message: ServerMessage, now = 1_000): RoomClientEvent {
  return { type: 'server', message, now }
}

// ─── §5.6 satır 1 — kullanıcı hücreye bastı ───────────────────────────────

describe('§5.6/1 — kullanıcı hücreye bastı', () => {
  it('sıra bendeyse ve hücre boşsa pending kurulur ve move gönderilir', () => {
    const { state, effects } = roomClientReducer(bagliDurum(), { type: 'ui:cell', index: 4 })

    expect(state.pending).toEqual({ index: 4, by: 'X' })
    expect(effects).toEqual([{ type: 'send', message: { type: 'move', index: 4 } }])
  })

  it('R1 — kendi hamlesi sunucu yankısı olmadan tahtaya İŞLENMEZ, yalnız pending', () => {
    const onceki = bagliDurum()
    const { state } = roomClientReducer(onceki, { type: 'ui:cell', index: 4 })

    // İyimser GÖSTERİM serbest (pending dolu), kalıcı UYGULAMA yasak:
    expect(state.pending).not.toBeNull()
    expect(state.board[4]).toBeNull()
    expect(state.board).toEqual(onceki.board)
    expect(state.version).toBe(onceki.version)
    expect(state.status).toEqual({ kind: 'playing', turn: 'X' })
  })

  it('yankı geldiğinde tahta değişir ve pending düşer — iki hâl ayırt edilir', () => {
    const { state: iyimser } = roomClientReducer(bagliDurum(), { type: 'ui:cell', index: 4 })
    const { state } = roomClientReducer(
      iyimser,
      sunucudan({ type: 'move:applied', index: 4, by: 'X', version: 4 }),
    )

    expect(state.board[4]).toBe('X')
    expect(state.pending).toBeNull()
  })

  it('sıra rakipteyse mesaj bile üretilmez', () => {
    const durum = bagliDurum({ status: { kind: 'playing', turn: 'O' } })
    const sonuc = roomClientReducer(durum, { type: 'ui:cell', index: 4 })

    expect(sonuc.effects).toEqual([])
    expect(sonuc.state).toBe(durum)
  })

  it('hücre doluysa mesaj bile üretilmez', () => {
    const tahta = bosTahta()
    tahta[4] = 'O'
    const durum = bagliDurum({ board: tahta })
    const sonuc = roomClientReducer(durum, { type: 'ui:cell', index: 4 })

    expect(sonuc.effects).toEqual([])
    expect(sonuc.state.pending).toBeNull()
  })

  it('bağlantı yoksa mesaj bile üretilmez', () => {
    const durum = bagliDurum({ connection: 'kopuk' })
    const sonuc = roomClientReducer(durum, { type: 'ui:cell', index: 4 })

    expect(sonuc.effects).toEqual([])
    expect(sonuc.state.pending).toBeNull()
  })

  it('devredilmiş oturumda tahta salt-okunurdur', () => {
    const durum = bagliDurum({ connection: 'devredildi' })

    expect(roomClientReducer(durum, { type: 'ui:cell', index: 0 }).effects).toEqual([])
  })

  it('bekleyen hamle varken ikinci basış ikinci mesaj üretmez', () => {
    const durum = bagliDurum({ pending: { index: 4, by: 'X' } })

    expect(roomClientReducer(durum, { type: 'ui:cell', index: 0 }).effects).toEqual([])
  })

  it('oyun bittiyse mesaj üretilmez', () => {
    const durum = bagliDurum({
      status: { kind: 'won', winner: 'O', line: [0, 1, 2], reason: 'line' },
    })

    expect(roomClientReducer(durum, { type: 'ui:cell', index: 4 }).effects).toEqual([])
  })

  it('koltuğu olmayan izleyici mesaj üretmez', () => {
    const durum = bagliDurum({ you: null })

    expect(roomClientReducer(durum, { type: 'ui:cell', index: 4 }).effects).toEqual([])
  })

  it('tahta dışındaki indeks mesaj üretmez', () => {
    expect(roomClientReducer(bagliDurum(), { type: 'ui:cell', index: 9 }).effects).toEqual([])
    expect(roomClientReducer(bagliDurum(), { type: 'ui:cell', index: -1 }).effects).toEqual([])
  })
})

// ─── §5.6 satır 2/3/4 — move:applied ──────────────────────────────────────

describe('§5.6/2 — move:applied, version === state.version + 1', () => {
  it('hamleyi uygular ve sürümü ilerletir', () => {
    const { state, effects } = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'move:applied', index: 2, by: 'X', version: 4 }),
    )

    expect(state.board[2]).toBe('X')
    expect(state.version).toBe(4)
    expect(state.status).toEqual({ kind: 'playing', turn: 'O' })
    expect(effects).toEqual([])
  })

  it('başka hücrenin yankısı bekleyen hamleyi temizlemez', () => {
    const durum = bagliDurum({ pending: { index: 4, by: 'X' } })
    const { state } = roomClientReducer(
      durum,
      sunucudan({ type: 'move:applied', index: 2, by: 'O', version: 4 }),
    )

    expect(state.pending).toEqual({ index: 4, by: 'X' })
  })

  it('kazanan hamlede sonuç game:over beklemeden tahtadan türetilir', () => {
    const tahta = bosTahta()
    tahta[0] = 'X'
    tahta[1] = 'X'
    tahta[3] = 'O'
    tahta[4] = 'O'
    const durum = bagliDurum({ board: tahta, status: { kind: 'playing', turn: 'X' } })
    const { state } = roomClientReducer(
      durum,
      sunucudan({ type: 'move:applied', index: 2, by: 'X', version: 4 }),
    )

    expect(state.status).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' })
  })

  it('sunucunun bildirdiği çizgisiz bitişi geç gelen yankı playing yapmaz', () => {
    const durum = bagliDurum({
      status: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
    })
    const { state } = roomClientReducer(
      durum,
      sunucudan({ type: 'move:applied', index: 2, by: 'X', version: 4 }),
    )

    expect(state.status).toEqual({ kind: 'won', winner: 'O', line: null, reason: 'resign' })
    expect(state.board[2]).toBe('X')
  })
})

describe('§5.6/3 — move:applied, version > state.version + 1 (boşluk)', () => {
  it('uygulamaz, resync ister', () => {
    const durum = bagliDurum()
    const { state, effects } = roomClientReducer(
      durum,
      sunucudan({ type: 'move:applied', index: 2, by: 'X', version: 9 }),
    )

    expect(state.board[2]).toBeNull()
    expect(state.version).toBe(3)
    expect(effects).toEqual([{ type: 'resync' }])
  })

  it('hiç durum alınmamışken gelen yankı da resync ister', () => {
    const { effects } = roomClientReducer(
      initialRoomClientState(),
      sunucudan({ type: 'move:applied', index: 2, by: 'X', version: 5 }),
    )

    expect(effects).toEqual([{ type: 'resync' }])
  })
})

describe('§5.6/4 — move:applied, version <= state.version (yinelenen yankı)', () => {
  it.each([
    ['aynı sürüm', 3],
    ['eski sürüm', 2],
  ])('%s yoksayılır', (_ad, version) => {
    const durum = bagliDurum()
    const sonuc = roomClientReducer(
      durum,
      sunucudan({ type: 'move:applied', index: 2, by: 'X', version }),
    )

    expect(sonuc.state).toBe(durum)
    expect(sonuc.effects).toEqual([])
  })
})

// ─── §5.6 satır 5 — move:rejected ─────────────────────────────────────────

describe('§5.6/5 — move:rejected', () => {
  it('pending temizlenir ve hata kurulur', () => {
    const durum = bagliDurum({ pending: { index: 4, by: 'X' } })
    const { state, effects } = roomClientReducer(
      durum,
      sunucudan({ type: 'move:rejected', index: 4, reason: 'not-your-turn' }),
    )

    expect(state.pending).toBeNull()
    expect(state.lastError).toBe('NOT_YOUR_TURN')
    expect(effects).toEqual([])
  })

  it('reddedilen hücre tahtada zaten yoktur — rakibin taşı silinmez', () => {
    const tahta = bosTahta()
    tahta[4] = 'O'
    const durum = bagliDurum({ board: tahta, pending: { index: 4, by: 'X' } })
    const { state } = roomClientReducer(
      durum,
      sunucudan({ type: 'move:rejected', index: 4, reason: 'occupied' }),
    )

    expect(state.board[4]).toBe('O')
  })

  it.each([
    ['not-your-turn', 'NOT_YOUR_TURN'],
    ['occupied', 'CELL_OCCUPIED'],
    ['game-over', 'GAME_OVER'],
    ['out-of-range', 'INVALID_MESSAGE'],
  ] as const)('%s sebebi %s koduna çevrilir', (reason, kod) => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'move:rejected', index: 4, reason }),
    )

    expect(state.lastError).toBe(kod)
  })
})

// ─── §5.6 satır 6/7 — state ───────────────────────────────────────────────

describe('§5.6/6 — state mesajı', () => {
  it('tahtayı tümüyle değiştirir, birleştirme yapmaz', () => {
    const yerel = bosTahta()
    yerel[8] = 'X'
    const gelen = bosTahta()
    gelen[0] = 'O'
    const { state } = roomClientReducer(
      bagliDurum({ board: yerel }),
      sunucudan(tamDurumMesaji({ board: gelen })),
    )

    expect(state.board).toEqual(gelen)
    expect(state.board[8]).toBeNull()
  })

  it('pending gelen tahtada varsa onaylanır', () => {
    const gelen = bosTahta()
    gelen[4] = 'X'
    const { state } = roomClientReducer(
      bagliDurum({ pending: { index: 4, by: 'X' } }),
      sunucudan(tamDurumMesaji({ board: gelen })),
    )

    expect(state.board[4]).toBe('X')
    expect(state.pending).toBeNull()
  })

  it('pending gelen tahtada yoksa SESSİZCE silinir — hata kurulmaz', () => {
    const { state } = roomClientReducer(
      bagliDurum({ pending: { index: 4, by: 'X' } }),
      sunucudan(tamDurumMesaji()),
    )

    expect(state.pending).toBeNull()
    expect(state.lastError).toBeNull()
  })

  it('tüm alanları sunucudan alır', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan(
        tamDurumMesaji({
          you: 'O',
          version: 12,
          turnDeadline: 90_000,
          graceEndsAt: 60_000,
          rematch: { by: 'O', expiresAt: 70_000 },
          players: { X: { userId: 'u1', name: 'Ayse' }, O: { userId: 'u2', name: 'Veli' } },
        }),
      ),
    )

    expect(state.you).toBe('O')
    expect(state.version).toBe(12)
    expect(state.turnDeadline).toBe(90_000)
    expect(state.graceEndsAt).toBe(60_000)
    expect(state.rematch).toEqual({ by: 'O', expiresAt: 70_000 })
    expect(state.players.O).toEqual({ userId: 'u2', name: 'Veli' })
  })

  it('saat sapmasını serverTime - now olarak saklar', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan(tamDurumMesaji({ serverTime: 5_000 }), 3_000),
    )

    expect(state.serverOffsetMs).toBe(2_000)
  })

  it('bağlantıyı bagli yapar ve backoff sayacını sıfırlar', () => {
    const { state } = roomClientReducer(
      bagliDurum({ connection: 'baglaniyor', reconnectAttempt: 4 }),
      sunucudan(tamDurumMesaji()),
    )

    expect(state.connection).toBe('bagli')
    expect(state.reconnectAttempt).toBe(0)
  })
})

describe('§5.6/7 — bitmiş durum doğrudan sonuç ekranıdır', () => {
  it('state.status playing değilse game:over beklenmez', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan(
        tamDurumMesaji({ status: { kind: 'won', winner: 'O', line: null, reason: 'abandon' } }),
      ),
    )

    expect(state.status).toEqual({ kind: 'won', winner: 'O', line: null, reason: 'abandon' })
  })
})

// ─── §5.6 satır 8/9/10 — kapanış kodları ──────────────────────────────────

describe('§5.6/8 — 4409 SESSION_TAKEOVER', () => {
  it("connection 'devredildi' olur ve HİÇBİR effect üretilmez", () => {
    const { state, effects } = roomClientReducer(bagliDurum(), {
      type: 'socket:closed',
      code: WS_CLOSE.SESSION_TAKEOVER,
    })

    expect(state.connection).toBe('devredildi')
    expect(effects).toEqual([])
  })

  it('devralma hatası kullanıcıya gösterilmek üzere kaydedilir', () => {
    const { state } = roomClientReducer(bagliDurum({ pending: { index: 1, by: 'X' } }), {
      type: 'socket:closed',
      code: WS_CLOSE.SESSION_TAKEOVER,
    })

    expect(state.lastError).toBe('SESSION_TAKEOVER')
    expect(state.pending).toBeNull()
  })
})

describe('§5.6/9 — 4499 ROTATE (planlı rotasyon)', () => {
  it("connection 'baglaniyor' olur, gecikmesiz bağlanılır", () => {
    const { state, effects } = roomClientReducer(bagliDurum(), {
      type: 'socket:closed',
      code: WS_CLOSE.ROTATE,
    })

    expect(state.connection).toBe('baglaniyor')
    expect(effects).toEqual([{ type: 'reconnect', attempt: 0, immediate: true }])
  })

  it('backoff sayacı önceki değeri ne olursa olsun sıfırlanır', () => {
    const { state, effects } = roomClientReducer(bagliDurum({ reconnectAttempt: 6 }), {
      type: 'socket:closed',
      code: WS_CLOSE.ROTATE,
    })

    expect(state.reconnectAttempt).toBe(0)
    expect(effects).toEqual([{ type: 'reconnect', attempt: 0, immediate: true }])
  })
})

describe('§5.6/10 — diğer kapanışlar', () => {
  it('4408 sonrası kopuk olunur ve üstel geri çekilmeyle bağlanılır', () => {
    const { state, effects } = roomClientReducer(bagliDurum(), {
      type: 'socket:closed',
      code: WS_CLOSE.IDLE_TIMEOUT,
    })

    expect(state.connection).toBe('kopuk')
    expect(effects).toEqual([{ type: 'reconnect', attempt: 0, immediate: false }])
  })

  it('ardışık kopmalarda deneme sayacı büyür', () => {
    const birinci = roomClientReducer(bagliDurum(), { type: 'socket:closed', code: 1006 })
    expect(birinci.state.reconnectAttempt).toBe(1)

    const ikinci = roomClientReducer(birinci.state, { type: 'socket:closed', code: 1006 })
    expect(ikinci.state.reconnectAttempt).toBe(2)
    expect(ikinci.effects).toEqual([{ type: 'reconnect', attempt: 1, immediate: false }])
  })

  // 4000-4999 kapanışlarının TAMAMI başarılı el sıkışmadan sonra gelir. Soket
  // açılışını "başarı" sayıp sayacı sıfırlarsak bu sınıf için geri çekilme ölür.
  it('soket açılışı TEK BAŞINA backoff sayacını sıfırlamaz', () => {
    const { state } = roomClientReducer(bagliDurum({ reconnectAttempt: 3 }), {
      type: 'socket:open',
    })

    expect(state.connection).toBe('bagli')
    expect(state.reconnectAttempt).toBe(3)
  })

  it('sayacı yalnız kullanılabilir oturum (tam durum) sıfırlar', () => {
    const acildi = roomClientReducer(bagliDurum({ reconnectAttempt: 3 }), { type: 'socket:open' })
    const { state } = roomClientReducer(acildi.state, sunucudan(tamDurumMesaji()))

    expect(state.reconnectAttempt).toBe(0)
  })

  it('kabul edip hemen kapatan sunucuda gecikme GERÇEKTEN büyür', () => {
    let durum = bagliDurum({ reconnectAttempt: 0 })
    const gecikmeler: number[] = []

    for (let tur = 0; tur < 5; tur += 1) {
      durum = roomClientReducer(durum, { type: 'socket:connecting' }).state
      durum = roomClientReducer(durum, { type: 'socket:open' }).state
      const kapandi = roomClientReducer(durum, { type: 'socket:closed', code: 1006 })
      durum = kapandi.state
      for (const effect of kapandi.effects) {
        if (effect.type === 'reconnect')
          gecikmeler.push(nextReconnectDelay(effect.attempt, () => 0.5))
      }
    }

    expect(gecikmeler).toEqual([500, 1_000, 2_000, 4_000, 8_000])
  })

  it.each([
    ['PROTOCOL_VIOLATION', WS_CLOSE.PROTOCOL_VIOLATION, 'INVALID_MESSAGE'],
    ['FORBIDDEN', WS_CLOSE.FORBIDDEN, 'ROOM_FULL'],
    ['NOT_FOUND', WS_CLOSE.NOT_FOUND, 'ROOM_NOT_FOUND'],
  ] as const)('kalıcı kapanış %s yeniden bağlanma üretmez', (_ad, code, kod) => {
    const { state, effects } = roomClientReducer(bagliDurum(), { type: 'socket:closed', code })

    expect(state.connection).toBe('kopuk')
    expect(state.lastError).toBe(kod)
    expect(effects).toEqual([])
  })

  it('4401 kör backoff yerine yeniden kimlik ister', () => {
    const { state, effects } = roomClientReducer(bagliDurum(), {
      type: 'socket:closed',
      code: WS_CLOSE.UNAUTHENTICATED,
    })

    expect(state.connection).toBe('baglaniyor')
    expect(state.lastError).toBe('UNAUTHENTICATED')
    expect(effects).toEqual([{ type: 'reauth', attempt: 0 }])
  })

  // "Kör backoff yok" ile "hiç sınır yok" aynı şey değil: bozuk bilet üreten bir
  // sunucuda zaman hiç ilerlemeden soket açılmaya devam ederdi. Sayaç efektle
  // TAŞINIR ki bileti tazeleyen taraf pes edebilsin.
  it('ardışık 4401 denemeleri sayacı efekte taşır', () => {
    const bir = roomClientReducer(bagliDurum(), {
      type: 'socket:closed',
      code: WS_CLOSE.UNAUTHENTICATED,
    })
    const iki = roomClientReducer(bir.state, {
      type: 'socket:closed',
      code: WS_CLOSE.UNAUTHENTICATED,
    })

    expect(bir.effects).toEqual([{ type: 'reauth', attempt: 0 }])
    expect(iki.effects).toEqual([{ type: 'reauth', attempt: 1 }])
    expect(iki.state.reconnectAttempt).toBe(2)
  })

  // Beklenti CTR-001'in dondurulmuş sınıflandırıcılarından okunuyor; bu üçlü bu
  // dosyanın DIŞINDA yaşıyor. Yarın listeye yeni bir kalıcı kod eklenirse bu
  // test indirgeyiciyi ona uymaya zorlar.
  it.each([
    ['PROTOCOL_VIOLATION', WS_CLOSE.PROTOCOL_VIOLATION],
    ['UNAUTHENTICATED', WS_CLOSE.UNAUTHENTICATED],
    ['FORBIDDEN', WS_CLOSE.FORBIDDEN],
    ['NOT_FOUND', WS_CLOSE.NOT_FOUND],
    ['IDLE_TIMEOUT', WS_CLOSE.IDLE_TIMEOUT],
    ['SESSION_TAKEOVER', WS_CLOSE.SESSION_TAKEOVER],
    ['ROTATE', WS_CLOSE.ROTATE],
    ['sınıflandırılmamış 1006', 1006],
  ])('%s davranışı ws-close sınıflandırmasıyla örtüşür', (_ad, code) => {
    const { state, effects } = roomClientReducer(bagliDurum(), { type: 'socket:closed', code })
    const tipler = effects.map((effect) => effect.type)

    if (code === WS_CLOSE.SESSION_TAKEOVER) {
      // §3.2 — devralma bağlanabilir sayılsaydı sonsuz takeover savaşı olurdu.
      expect(state.connection).toBe('devredildi')
      expect(tipler).toEqual([])
      return
    }
    if (!isReconnectableCloseCode(code)) {
      expect(tipler).toEqual([])
      return
    }
    expect(tipler).toEqual(requiresReauth(code) ? ['reauth'] : ['reconnect'])
    expect(isPermanentCloseCode(code)).toBe(false)
  })

  it('kullanıcı kapatınca terminal kopuk olunur, yeniden bağlanma İSTENMEZ', () => {
    const { state, effects } = roomClientReducer(
      bagliDurum({ pending: { index: 1, by: 'X' }, inFlight: 'resign' }),
      { type: 'client:closed' },
    )

    expect(state.connection).toBe('kopuk')
    expect(state.pending).toBeNull()
    expect(state.inFlight).toBeNull()
    expect(effects).toEqual([])
  })

  it('yeniden bağlanma denemesi başlarken connection baglaniyor olur', () => {
    const { state, effects } = roomClientReducer(bagliDurum({ connection: 'kopuk' }), {
      type: 'socket:connecting',
    })

    expect(state.connection).toBe('baglaniyor')
    expect(effects).toEqual([])
  })
})

// ─── nextReconnectDelay ───────────────────────────────────────────────────

describe('nextReconnectDelay — saf, rng enjekte edilir', () => {
  it('ilk denemede taban gecikme ±%20 jitter ile uygulanır', () => {
    expect(nextReconnectDelay(0, () => 0)).toBe(WS_RECONNECT_BASE_MS * 0.8)
    expect(nextReconnectDelay(0, () => 0.5)).toBe(WS_RECONNECT_BASE_MS)
    expect(nextReconnectDelay(0, () => 1)).toBe(WS_RECONNECT_BASE_MS * 1.2)
  })

  it('üstel büyür', () => {
    expect(nextReconnectDelay(1, () => 0.5)).toBe(1_000)
    expect(nextReconnectDelay(2, () => 0.5)).toBe(2_000)
    expect(nextReconnectDelay(3, () => 0.5)).toBe(4_000)
  })

  it('tavanı aşmaz', () => {
    expect(nextReconnectDelay(20, () => 0.5)).toBe(WS_RECONNECT_MAX_MS)
    expect(nextReconnectDelay(20, () => 1)).toBe(WS_RECONNECT_MAX_MS * 1.2)
  })

  it('rng gerçekten kullanılır — iki farklı değer iki farklı gecikme verir', () => {
    expect(nextReconnectDelay(2, () => 0)).not.toBe(nextReconnectDelay(2, () => 1))
  })

  it('tam sayı milisaniye döner', () => {
    expect(Number.isInteger(nextReconnectDelay(0, () => 0.333))).toBe(true)
  })
})

// ─── diğer sunucu mesajları ───────────────────────────────────────────────

describe('koltuk ve varlık olayları', () => {
  it('opponent:joined koltuğu doldurur', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'opponent:joined', userId: 'u2', seat: 'O', name: 'Veli' }),
    )

    expect(state.players.O).toEqual({ userId: 'u2', name: 'Veli' })
    expect(state.players.X).toBeNull()
  })

  it('O koltuğundaki oyuncu için X koltuğu dolar', () => {
    const { state } = roomClientReducer(
      bagliDurum({ you: 'O' }),
      sunucudan({ type: 'opponent:joined', userId: 'u1', seat: 'X', name: 'Ayse' }),
    )

    expect(state.players.X).toEqual({ userId: 'u1', name: 'Ayse' })
    expect(state.players.O).toBeNull()
  })

  it('opponent:left grace hedefini saklar', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'opponent:left', userId: 'u2', seat: 'O', graceEndsAt: 60_000 }),
    )

    expect(state.graceEndsAt).toBe(60_000)
  })

  it('opponent:returned grace hedefini siler', () => {
    const { state } = roomClientReducer(
      bagliDurum({ graceEndsAt: 60_000 }),
      sunucudan({ type: 'opponent:returned', seat: 'O' }),
    )

    expect(state.graceEndsAt).toBeNull()
  })

  it('game:over durumu sonlandırır ve geri sayımları düşürür', () => {
    const { state } = roomClientReducer(
      bagliDurum({ turnDeadline: 9_000, graceEndsAt: 8_000, pending: { index: 1, by: 'X' } }),
      sunucudan({
        type: 'game:over',
        status: { kind: 'won', winner: 'O', line: null, reason: 'timeout' },
        endedAt: 7_000,
      }),
    )

    expect(state.status).toEqual({ kind: 'won', winner: 'O', line: null, reason: 'timeout' })
    expect(state.turnDeadline).toBeNull()
    expect(state.graceEndsAt).toBeNull()
    expect(state.pending).toBeNull()
  })

  it('rematch:offered ve rematch:cancelled teklifi kurar ve düşürür', () => {
    const teklifli = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'rematch:offered', by: 'O', expiresAt: 60_000 }),
    ).state
    expect(teklifli.rematch).toEqual({ by: 'O', expiresAt: 60_000 })

    const iptal = roomClientReducer(
      teklifli,
      sunucudan({ type: 'rematch:cancelled', reason: 'expired' }),
    ).state
    expect(iptal.rematch).toBeNull()
  })

  it('chat:emoji son emojiyi saklar', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'chat:emoji', from: 'O', emoji: '👏', at: 4_000 }),
    )

    expect(state.lastEmoji).toEqual({ from: 'O', emoji: '👏', at: 4_000 })
  })

  it('error hata kodunu saklar', () => {
    const { state } = roomClientReducer(
      bagliDurum(),
      sunucudan({ type: 'error', code: 'RATE_LIMITED', message: 'yavaş' }),
    )

    expect(state.lastError).toBe('RATE_LIMITED')
  })

  it('pong durumu değiştirmez', () => {
    const durum = bagliDurum()
    const sonuc = roomClientReducer(durum, sunucudan({ type: 'pong' }))

    expect(sonuc.state).toBe(durum)
    expect(sonuc.effects).toEqual([])
  })
})

// ─── diğer kullanıcı eylemleri ────────────────────────────────────────────

describe('kullanıcı eylemleri — kapı hep aynı: bağlıyım ve koltuğum var', () => {
  it('pes etme yalnız sürerken gönderilir', () => {
    expect(roomClientReducer(bagliDurum(), { type: 'ui:resign' }).effects).toEqual([
      { type: 'send', message: { type: 'resign' } },
    ])

    const bitmis = bagliDurum({
      status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
    })
    expect(roomClientReducer(bitmis, { type: 'ui:resign' }).effects).toEqual([])
    expect(
      roomClientReducer(bagliDurum({ connection: 'kopuk' }), { type: 'ui:resign' }).effects,
    ).toEqual([])
  })

  it('rövanş teklifi yalnız oyun bittiğinde gönderilir', () => {
    const bitmis = bagliDurum({ status: { kind: 'draw' } })
    expect(roomClientReducer(bitmis, { type: 'ui:rematch-offer' }).effects).toEqual([
      { type: 'send', message: { type: 'rematch:offer' } },
    ])
    expect(roomClientReducer(bagliDurum(), { type: 'ui:rematch-offer' }).effects).toEqual([])
  })

  it('rövanş kabulü yalnız rakibin açık teklifi varken gönderilir', () => {
    const teklifli = bagliDurum({ status: { kind: 'draw' }, rematch: { by: 'O', expiresAt: 9 } })
    expect(roomClientReducer(teklifli, { type: 'ui:rematch-accept' }).effects).toEqual([
      { type: 'send', message: { type: 'rematch:accept' } },
    ])

    const kendiTeklifi = bagliDurum({ rematch: { by: 'X', expiresAt: 9 } })
    expect(roomClientReducer(kendiTeklifi, { type: 'ui:rematch-accept' }).effects).toEqual([])
    expect(roomClientReducer(bagliDurum(), { type: 'ui:rematch-accept' }).effects).toEqual([])
  })

  it('emoji yalnız bağlıyken gönderilir', () => {
    expect(roomClientReducer(bagliDurum(), { type: 'ui:emoji', emoji: '🔥' }).effects).toEqual([
      { type: 'send', message: { type: 'chat:emoji', emoji: '🔥' } },
    ])
    expect(
      roomClientReducer(bagliDurum({ you: null }), { type: 'ui:emoji', emoji: '🔥' }).effects,
    ).toEqual([])
  })
})

// ─── tek uçuş: çift tık ikinci çerçeveyi üretmez ──────────────────────────

describe('tek uçuş bayrağı (inFlight)', () => {
  const bitmis = (patch: Partial<RoomClientState> = {}): RoomClientState =>
    bagliDurum({ status: { kind: 'draw' }, ...patch })

  it.each([
    ['pes etme', bagliDurum(), { type: 'ui:resign' } as const, 'resign'],
    ['rövanş teklifi', bitmis(), { type: 'ui:rematch-offer' } as const, 'rematch'],
    [
      'rövanş kabulü',
      bitmis({ rematch: { by: 'O', expiresAt: 9 } }),
      { type: 'ui:rematch-accept' } as const,
      'rematch',
    ],
    ['emoji', bagliDurum(), { type: 'ui:emoji', emoji: '🔥' } as const, 'emoji'],
  ])('%s: ilk tık gönderir, ikinci tık HİÇBİR ŞEY göndermez', (_ad, baslangic, olay, isaret) => {
    const ilk = roomClientReducer(baslangic, olay)
    expect(ilk.effects).toHaveLength(1)
    expect(ilk.state.inFlight).toBe(isaret)

    const ikinci = roomClientReducer(ilk.state, olay)
    expect(ikinci.effects).toEqual([])
  })

  it('uçuşta olan eylem tam durumla temizlenir', () => {
    const { state } = roomClientReducer(
      bagliDurum({ inFlight: 'rematch' }),
      sunucudan(tamDurumMesaji()),
    )

    expect(state.inFlight).toBeNull()
  })

  it.each([
    [
      'game:over',
      {
        type: 'game:over',
        status: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
        endedAt: 1,
      } as const,
    ],
    ['rematch:offered', { type: 'rematch:offered', by: 'X', expiresAt: 9 } as const],
    ['rematch:cancelled', { type: 'rematch:cancelled', reason: 'expired' } as const],
    ['error', { type: 'error', code: 'SERVER_ERROR', message: 'hata' } as const],
  ])('%s uçuşu serbest bırakır', (_ad, message) => {
    const { state } = roomClientReducer(bagliDurum({ inFlight: 'resign' }), sunucudan(message))

    expect(state.inFlight).toBeNull()
  })

  it('kendi emoji yankım uçuşu serbest bırakır, rakibinki bırakmaz', () => {
    const durum = bagliDurum({ inFlight: 'emoji', you: 'X' })

    const kendi = roomClientReducer(
      durum,
      sunucudan({ type: 'chat:emoji', from: 'X', emoji: '🔥', at: 1 }),
    )
    expect(kendi.state.inFlight).toBeNull()

    const rakip = roomClientReducer(
      durum,
      sunucudan({ type: 'chat:emoji', from: 'O', emoji: '👏', at: 1 }),
    )
    expect(rakip.state.inFlight).toBe('emoji')
  })

  it('bağlantı kopunca uçuş bayrağı düşer', () => {
    const { state } = roomClientReducer(bagliDurum({ inFlight: 'resign' }), {
      type: 'socket:closed',
      code: 1006,
    })

    expect(state.inFlight).toBeNull()
  })

  it('uçuştaki emoji hamleyi engellemez — ayrı kapılar', () => {
    const { effects } = roomClientReducer(bagliDurum({ inFlight: 'emoji' }), {
      type: 'ui:cell',
      index: 4,
    })

    expect(effects).toEqual([{ type: 'send', message: { type: 'move', index: 4 } }])
  })
})

// ─── ADR-0007: rotasyon sahte "rakip koptu" göstermesin ───────────────────

describe('opponentLeftVisible — 2 saniyelik gösterim eşiği (ADR-0007)', () => {
  const graceMs = DISCONNECT_GRACE_SECONDS * 1_000
  const sapmasiz = (
    graceEndsAt: number | null,
  ): Pick<RoomClientState, 'graceEndsAt' | 'serverOffsetMs'> => ({ graceEndsAt, serverOffsetMs: 0 })

  it('eşik tam 2 saniyedir', () => {
    expect(OPPONENT_LEFT_DISPLAY_DELAY_MS).toBe(2_000)
  })

  it('kopmanın ilk anında gösterilmez — rotasyon saniyeler içinde geri döner', () => {
    expect(opponentLeftVisible(sapmasiz(10_000 + graceMs), 10_000)).toBe(false)
    expect(opponentLeftVisible(sapmasiz(10_000 + graceMs - 1_999), 10_000)).toBe(false)
  })

  it('2 saniye geçtikten sonra gösterilir', () => {
    expect(opponentLeftVisible(sapmasiz(10_000 + graceMs - 2_000), 10_000)).toBe(true)
    expect(opponentLeftVisible(sapmasiz(10_000 + graceMs - 9_000), 10_000)).toBe(true)
  })

  it('kopma yoksa gösterilmez', () => {
    expect(opponentLeftVisible(sapmasiz(null), 10_000)).toBe(false)
  })

  // `graceEndsAt` SUNUCU damgasıdır; istemci saatiyle doğrudan karşılaştırmak
  // KK-070'in 2 sn bütçesini saat sapması kadar kaydırır.
  it('istemci saati geride kalsa da eşik sunucu zamanına göre işler', () => {
    // İstemci 25 sn geride: sunucu 35_000 derken istemci 10_000 diyor.
    const sapma = { serverOffsetMs: 25_000 }
    const kopmaAni = 35_000 + graceMs

    expect(opponentLeftVisible({ graceEndsAt: kopmaAni, ...sapma }, 10_000)).toBe(false)
    expect(opponentLeftVisible({ graceEndsAt: kopmaAni, ...sapma }, 11_999)).toBe(false)
    expect(opponentLeftVisible({ graceEndsAt: kopmaAni, ...sapma }, 12_000)).toBe(true)
  })

  it('istemci saati ileri gitse de sahte "rakip koptu" yanmaz', () => {
    // İstemci 5 sn ileride: düzeltmesiz her rotasyonda banner yanardı.
    const sapma = { serverOffsetMs: -5_000 }
    const kopmaAni = 10_000 + graceMs

    expect(opponentLeftVisible({ graceEndsAt: kopmaAni, ...sapma }, 15_000)).toBe(false)
    expect(opponentLeftVisible({ graceEndsAt: kopmaAni, ...sapma }, 17_000)).toBe(true)
  })
})

// ─── saflık ───────────────────────────────────────────────────────────────

describe('saflık', () => {
  it('girdi durumunu değiştirmez', () => {
    const durum = bagliDurum()
    const kopya = structuredClone(durum)

    roomClientReducer(durum, { type: 'ui:cell', index: 4 })
    roomClientReducer(durum, sunucudan({ type: 'move:applied', index: 0, by: 'X', version: 4 }))
    roomClientReducer(durum, { type: 'socket:closed', code: 1006 })

    expect(durum).toEqual(kopya)
  })

  it('aynı girdi aynı çıktıyı verir — gizli zaman ya da rastgelelik yok', () => {
    const durum = bagliDurum()
    const bir = roomClientReducer(durum, sunucudan(tamDurumMesaji(), 1_234))
    const iki = roomClientReducer(durum, sunucudan(tamDurumMesaji(), 1_234))

    expect(bir).toEqual(iki)
  })
})
