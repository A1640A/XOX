import { boardFromCells, evaluateStatus } from '@xox/game-core'
import { DISCONNECT_GRACE_SECONDS, WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS } from './constants'
import type { ErrorCode } from './errors'
import { type MoveRejectionReason, type TransportStatus, toTransportStatus } from './game-status'
import type { Cell, Player, Players } from './primitives'
import { WS_CLOSE, isPermanentCloseCode, requiresReauth } from './ws-close'
import type { ClientMessage, Emoji, RematchOffer, ServerMessage, StateMessage } from './ws-protocol'

/**
 * Oda ekranının **saf** istemci indirgeyicisi (tasarım §5.6). Web ve mobil aynı
 * dosyayı tüketir; arayüz yalnız görüntüler ve olay üretir.
 *
 * Bu dosyada `Date.now()`, `Math.random()`, `setTimeout` ve soket **yoktur**:
 * zaman girdi olarak gelir (`server` olayındaki `now`), rastgelelik enjekte
 * edilir (`nextReconnectDelay(attempt, rng)`), yan etki üretmek yerine
 * `effects` listesi döndürülür. Taşıma katmanı (`ws-client.ts`) bu listeyi
 * yürütür.
 */
export type ConnectionStatus = 'baglaniyor' | 'bagli' | 'kopuk' | 'devredildi'

/** Sunucu yankısı gelene kadar yalnız **gösterilen** hamle — R1. */
export interface PendingMove {
  readonly index: number
  readonly by: Player
}

export interface ReceivedEmoji {
  readonly from: Player
  readonly emoji: Emoji
  readonly at: number
}

export interface RoomClientState {
  readonly connection: ConnectionStatus
  readonly board: readonly Cell[]
  readonly status: TransportStatus
  readonly players: Players
  readonly you: Player | null
  readonly version: number
  /** `data-bekliyor="true"` — iyimser gösterim; tahtaya İŞLENMEZ (R1). */
  readonly pending: PendingMove | null
  readonly turnDeadline: number | null
  /** `serverTime - now` — geri sayımlar istemci saat sapmasına rağmen doğru olsun. */
  readonly serverOffsetMs: number
  readonly graceEndsAt: number | null
  readonly rematch: RematchOffer | null
  readonly lastEmoji: ReceivedEmoji | null
  readonly lastError: ErrorCode | null
  /** Üstel geri çekilmenin sayacı; başarılı bağlantı ve 4499 bunu sıfırlar. */
  readonly reconnectAttempt: number
}

/** Arayüzün üretebileceği olaylar — hepsi zamansızdır. */
export type RoomClientUiEvent =
  | { readonly type: 'ui:cell'; readonly index: number }
  | { readonly type: 'ui:resign' }
  | { readonly type: 'ui:rematch-offer' }
  | { readonly type: 'ui:rematch-accept' }
  | { readonly type: 'ui:emoji'; readonly emoji: Emoji }

export type RoomClientEvent =
  | RoomClientUiEvent
  | { readonly type: 'socket:connecting' }
  | { readonly type: 'socket:open' }
  | { readonly type: 'socket:closed'; readonly code: number }
  /** `now` yalnız burada gerekir: `serverOffsetMs` hesabı için. */
  | { readonly type: 'server'; readonly message: ServerMessage; readonly now: number }

export type RoomClientEffect =
  | { readonly type: 'send'; readonly message: ClientMessage }
  /** Sürüm boşluğu — taşıma `join` göndererek tam durumu ister (KK-047). */
  | { readonly type: 'resync' }
  | { readonly type: 'reconnect'; readonly attempt: number; readonly immediate: boolean }
  /** 4401 — önce yeni bilet, sonra bağlantı (ADR-0006). Kör backoff yok. */
  | { readonly type: 'reauth' }

export interface RoomClientResult {
  readonly state: RoomClientState
  readonly effects: readonly RoomClientEffect[]
}

/**
 * ADR-0007: planlı rotasyon rakipte kısa bir `opponent:left` →
 * `opponent:returned` çifti üretir. Bu eşik olmadan her rotasyonda sahte bir
 * "rakip koptu" uyarısı yanıp söner. KK-070'in 2 sn bütçesinin içindedir.
 */
export const OPPONENT_LEFT_DISPLAY_DELAY_MS = 2_000

const EMPTY_EFFECTS: readonly RoomClientEffect[] = []

export function initialRoomClientState(): RoomClientState {
  return {
    connection: 'baglaniyor',
    board: [null, null, null, null, null, null, null, null, null],
    status: { kind: 'playing', turn: 'X' },
    players: { X: null, O: null },
    you: null,
    // -1 = "henüz tam durum alınmadı". Bu sayede ilk `state` gelmeden düşen bir
    // `move:applied` (version >= 1) sürüm boşluğu sayılır ve tahtayı kör
    // uygulamak yerine resync ister.
    version: -1,
    pending: null,
    turnDeadline: null,
    serverOffsetMs: 0,
    graceEndsAt: null,
    rematch: null,
    lastEmoji: null,
    lastError: null,
    reconnectAttempt: 0,
  }
}

export function roomClientReducer(
  state: RoomClientState,
  event: RoomClientEvent,
): RoomClientResult {
  switch (event.type) {
    case 'ui:cell':
      return pressCell(state, event.index)
    case 'ui:resign':
      return canAct(state) && state.status.kind === 'playing'
        ? sends(state, { type: 'resign' })
        : idle(state)
    case 'ui:rematch-offer':
      return canAct(state) && state.status.kind !== 'playing'
        ? sends(state, { type: 'rematch:offer' })
        : idle(state)
    case 'ui:rematch-accept':
      return canAct(state) && state.rematch !== null && state.rematch.by !== state.you
        ? sends(state, { type: 'rematch:accept' })
        : idle(state)
    case 'ui:emoji':
      return canAct(state) ? sends(state, { type: 'chat:emoji', emoji: event.emoji }) : idle(state)
    case 'socket:connecting':
      return idle({ ...state, connection: 'baglaniyor' })
    // Sayaç BİLEREK sıfırlanmıyor: 4000-4999 kapanışlarının tamamı başarılı el
    // sıkışmadan sonra gelir, dolayısıyla açılışı başarı saymak o sınıfın
    // tamamında geri çekilmeyi öldürür. Tek gerçek kanıt kullanılabilir bir
    // oturumdur; sayacı `fromStateMessage` sıfırlar.
    case 'socket:open':
      return idle({ ...state, connection: 'bagli' })
    case 'socket:closed':
      return closed(state, event.code)
    case 'server':
      return fromServer(state, event.message, event.now)
  }
}

/**
 * Üstel geri çekilme, ±%20 jitter (KK-061). `rng` **zorunlu** parametredir:
 * varsayılan `Math.random` koysaydık bu dosya saf olmaktan çıkardı ve testte
 * unutulan bir enjeksiyon sessizce rastgele davranırdı.
 *
 * Sonuç tam sayıya yuvarlanır: zamanlayıcı milisaniyeyi zaten kesirsiz ele
 * alır ve `0.4 * 1` gibi ikili kayan nokta artıkları (`600.0000000000001`)
 * beklentileri kırılgan yapar.
 */
export function nextReconnectDelay(attempt: number, rng: () => number): number {
  const base = Math.min(WS_RECONNECT_BASE_MS * 2 ** attempt, WS_RECONNECT_MAX_MS)
  return Math.round(base * (0.8 + 0.4 * rng()))
}

/** Rakibin kopması `now` anında kullanıcıya gösterilmeli mi? (ADR-0007) */
export function opponentLeftVisible(
  state: Pick<RoomClientState, 'graceEndsAt'>,
  now: number,
): boolean {
  if (state.graceEndsAt === null) return false
  const elapsed = DISCONNECT_GRACE_SECONDS * 1_000 - (state.graceEndsAt - now)
  return elapsed >= OPPONENT_LEFT_DISPLAY_DELAY_MS
}

// ─── iç yardımcılar ───────────────────────────────────────────────────────

function idle(state: RoomClientState): RoomClientResult {
  return { state, effects: EMPTY_EFFECTS }
}

function sends(state: RoomClientState, message: ClientMessage): RoomClientResult {
  return { state, effects: [{ type: 'send', message }] }
}

/** Bağlıyım ve bir koltuğum var — her kullanıcı eyleminin ortak kapısı. */
function canAct(state: RoomClientState): boolean {
  return state.connection === 'bagli' && state.you !== null
}

/**
 * KK-041/062: kapı kapalıysa **sunucuya mesaj bile gitmez**. Aralık dışı indeks
 * ayrı bir dal gerektirmez — `board[9]` `undefined` döner, `=== null` kapanır.
 */
function pressCell(state: RoomClientState, index: number): RoomClientResult {
  const you = state.you
  if (!canAct(state) || you === null) return idle(state)
  if (state.status.kind !== 'playing' || state.status.turn !== you) return idle(state)
  if (state.pending !== null) return idle(state)
  if (state.board[index] !== null) return idle(state)
  return {
    state: { ...state, pending: { index, by: you } },
    effects: [{ type: 'send', message: { type: 'move', index } }],
  }
}

function closed(state: RoomClientState, code: number): RoomClientResult {
  // Kapanan bağlantının bekleyen hamlesi artık yankılanamaz; tam durum gelince
  // gerçek zaten öğrenilecek.
  const base = { ...state, pending: null }

  // §3.2 — sonsuz takeover savaşı olmasın: 4409'da yeniden bağlanılmaz.
  if (code === WS_CLOSE.SESSION_TAKEOVER) {
    return idle({ ...base, connection: 'devredildi', lastError: 'SESSION_TAKEOVER' })
  }
  if (isPermanentCloseCode(code)) {
    return idle({ ...base, connection: 'kopuk', lastError: permanentError(code) })
  }
  if (requiresReauth(code)) {
    return {
      state: {
        ...base,
        connection: 'baglaniyor',
        lastError: 'UNAUTHENTICATED',
        reconnectAttempt: state.reconnectAttempt + 1,
      },
      effects: [{ type: 'reauth' }],
    }
  }
  // Z2 — planlı rotasyon: sayaç sıfırlanır, gecikmesiz bağlanılır.
  if (code === WS_CLOSE.ROTATE) {
    return {
      state: { ...base, connection: 'baglaniyor', reconnectAttempt: 0 },
      effects: [{ type: 'reconnect', attempt: 0, immediate: true }],
    }
  }
  return {
    state: { ...base, connection: 'kopuk', reconnectAttempt: state.reconnectAttempt + 1 },
    effects: [{ type: 'reconnect', attempt: state.reconnectAttempt, immediate: false }],
  }
}

/** `isPermanentCloseCode` dörtlüsünden 4409 zaten ayrılmıştır; üçü kalır. */
function permanentError(code: number): ErrorCode {
  if (code === WS_CLOSE.PROTOCOL_VIOLATION) return 'INVALID_MESSAGE'
  if (code === WS_CLOSE.FORBIDDEN) return 'ROOM_FULL'
  return 'ROOM_NOT_FOUND'
}

function fromServer(state: RoomClientState, message: ServerMessage, now: number): RoomClientResult {
  switch (message.type) {
    case 'state':
      return idle(fromStateMessage(state, message, now))
    case 'move:applied':
      return applyEcho(state, message.index, message.by, message.version)
    case 'move:rejected':
      return idle({ ...state, pending: null, lastError: rejectionError(message.reason) })
    case 'opponent:joined':
      return idle({
        ...state,
        players: withSeat(state.players, message.seat, {
          userId: message.userId,
          name: message.name,
        }),
      })
    case 'opponent:left':
      return idle({ ...state, graceEndsAt: message.graceEndsAt })
    case 'opponent:returned':
      return idle({ ...state, graceEndsAt: null })
    case 'game:over':
      return idle({
        ...state,
        status: message.status,
        pending: null,
        turnDeadline: null,
        graceEndsAt: null,
      })
    case 'rematch:offered':
      return idle({ ...state, rematch: { by: message.by, expiresAt: message.expiresAt } })
    case 'rematch:cancelled':
      return idle({ ...state, rematch: null })
    case 'chat:emoji':
      return idle({
        ...state,
        lastEmoji: { from: message.from, emoji: message.emoji, at: message.at },
      })
    case 'error':
      return idle({ ...state, lastError: message.code })
    // Nabız muhasebesi taşıma katmanındadır; durum değişmez (KK-060).
    case 'pong':
      return idle(state)
  }
}

/**
 * §3.4/4-5 · KK-065: tahta **tümüyle** değişir, birleştirme yapılmaz. `pending`
 * her hâlükârda düşer — gelen tahtada varsa onaylanmış, yoksa sessizce
 * kaybolmuştur; ikisi de kullanıcıya hata göstermez.
 */
function fromStateMessage(
  state: RoomClientState,
  message: StateMessage,
  now: number,
): RoomClientState {
  return {
    ...state,
    connection: 'bagli',
    board: [...message.board],
    status: message.status,
    players: message.players,
    you: message.you,
    version: message.version,
    pending: null,
    turnDeadline: message.turnDeadline,
    graceEndsAt: message.graceEndsAt,
    rematch: message.rematch,
    serverOffsetMs: message.serverTime - now,
    reconnectAttempt: 0,
  }
}

function applyEcho(
  state: RoomClientState,
  index: number,
  by: Player,
  version: number,
): RoomClientResult {
  if (version <= state.version) return idle(state)
  if (version > state.version + 1) return { state, effects: [{ type: 'resync' }] }

  // `applyMove` bilerek kullanılmıyor: o kural ihlalinde fırlatır, oysa
  // indirgeyici **total** olmak zorundadır. Taş koymak kural kararı değildir;
  // kural kararı olan "durum ne oldu?" sorusu motora bırakılıyor.
  const board = [...state.board]
  board[index] = by

  return idle({
    ...state,
    board,
    version,
    status: nextStatus(state.status, board),
    pending: state.pending !== null && state.pending.index === index ? null : state.pending,
  })
}

/**
 * Motorun tahtadan göremeyeceği bitişler (pes/süre/terk) sunucudan gelir; geç
 * düşen bir yankı onları `playing`e geri çeviremez.
 */
function nextStatus(current: TransportStatus, board: readonly Cell[]): TransportStatus {
  if (current.kind !== 'playing') return current
  return toTransportStatus(evaluateStatus(boardFromCells(board)))
}

function rejectionError(reason: MoveRejectionReason): ErrorCode {
  switch (reason) {
    case 'not-your-turn':
      return 'NOT_YOUR_TURN'
    case 'occupied':
      return 'CELL_OCCUPIED'
    case 'game-over':
      return 'GAME_OVER'
    case 'out-of-range':
      return 'INVALID_MESSAGE'
  }
}

function withSeat(players: Players, seat: Player, occupant: Players['X']): Players {
  return seat === 'X' ? { ...players, X: occupant } : { ...players, O: occupant }
}
