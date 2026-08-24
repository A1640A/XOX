import type { RoomDoc, RoomState } from '@xox/db'
import { WS_CLOSE, emojiSchema } from '@xox/shared'
import type { ErrorCode, Player, SeatOccupant, ServerMessage } from '@xox/shared'
import { roomTransportStatus, toStateMessage } from '@/lib/game/room-view'
import type { RoomSubscriber } from './room-hub'

/** WS soketinin bu katmanın kullandığı kadarı — testte sahte soket verilir. */
export interface ServerSocket {
  send(data: string): void
  close(code: number, reason?: string): void
}

export interface RoomConnectionDeps {
  readonly roomCode: string
  readonly connId: string
  readonly userId: string
  readonly socket: ServerSocket
  readonly now: () => number
}

export interface RoomConnection extends RoomSubscriber {
  readonly connId: string
  readonly userId: string
  /** Kullanıcının bu odadaki koltuğu; henüz oturmadıysa `null`. */
  seat(): Player | null
  send(message: ServerMessage): void
  sendError(code: ErrorCode, message: string): void
  /**
   * Bağlantı kurulurken (ve `join` resync'inde) tam durumu gönderir ve delta
   * anlık görüntüsünü kurar. Kullanıcının koltuğu yoksa `false` döner ve
   * HİÇBİR mesaj gitmez (KK-008 ruhu: koltuksuza oda içeriği yayınlanmaz).
   */
  primeState(room: RoomDoc): boolean
  /** zod ihlali; `MAX_PROTOCOL_VIOLATIONS`e ulaşıldıysa `true` (kapat). */
  noteProtocolViolation(): boolean
  /** Geçerli mesaj — ARDIŞIK ihlal sayacını sıfırlar. */
  noteValidMessage(): void
  close(code: number, reason: string): void
  isClosed(): boolean
}

/** KK-048: **ardışık** üç ihlal. Çıplak sayı bilerek (sabitten türetilmiş test kör olur). */
const MAX_CONSECUTIVE_VIOLATIONS = 3

interface Snapshot {
  version: number
  moveCount: number
  state: RoomState
  seats: { X: SeatOccupant | null; O: SeatOccupant | null }
  disconnectedSeat: Player | null
  rematchBy: Player | null
}

function snapshotOf(room: RoomDoc): Snapshot {
  return {
    version: room.version,
    moveCount: room.moves.length,
    state: room.state,
    seats: { X: room.seats.X, O: room.seats.O },
    disconnectedSeat: room.disconnected?.seat ?? null,
    rematchBy: room.rematch?.by ?? null,
  }
}

function seatOf(room: RoomDoc, userId: string): Player | null {
  if (room.seats.X?.userId === userId) return 'X'
  if (room.seats.O?.userId === userId) return 'O'
  return null
}

/**
 * Tek bir WS bağlantısı: giden mesajlar, **delta hesabı** (tasarım §5.3) ve
 * kötüye kullanım sayaçları.
 *
 * **R1 (fan-out saflığı):** bu nesne bir bağlantıya ancak iki sebeple mesaj
 * yazar — (a) change stream'den gelen bir oda değişikliği, (b) o bağlantının
 * KENDİ isteğine verilen doğrudan yanıt (`pong`, `move:rejected`, `error`,
 * `join` resync'i). Bir bağlantının yazması, BAŞKA bir bağlantıya süreç içi
 * kısayolla asla ulaşmaz; aynı instance'taki iki oyuncu bile birbirini yalnız
 * change stream üzerinden görür. Dalga 0 E2E'sinin fan-out'u gerçekten
 * kanıtlaması bu değişmeze bağlıdır (ADR-0002).
 */
export function createRoomConnection(deps: RoomConnectionDeps): RoomConnection {
  let snapshot: Snapshot | null = null
  let currentSeat: Player | null = null
  let lastEmojiAt = 0
  let violations = 0
  let closed = false

  function send(message: ServerMessage): void {
    if (closed) return
    deps.socket.send(JSON.stringify(message))
  }

  function close(code: number, reason: string): void {
    if (closed) return
    closed = true
    deps.socket.close(code, reason)
  }

  function sendError(code: ErrorCode, message: string): void {
    send({ type: 'error', code, message })
  }

  /** Emoji `version` ARTIRMAZ; bu yüzden sürüm kapısından ÖNCE bakılır (§5.3). */
  function emitEmoji(room: RoomDoc): void {
    const last = room.lastEmoji
    if (last === null) return
    const at = last.at.getTime()
    if (at <= lastEmojiAt) return
    lastEmojiAt = at
    // Odaya nasıl girdiğinden bağımsız olarak palet dışı bir değer protokole
    // sokulmaz (KK-123 ikinci savunma hattı).
    const emoji = emojiSchema.safeParse(last.emoji)
    if (!emoji.success) return
    send({ type: 'chat:emoji', from: last.from, emoji: emoji.data, at })
  }

  /**
   * §5.4 — koltuğun tek geçerli bağlantısı `presence[seat].connId`. Kendi
   * kimliğimizin artık yazılı olmadığını **change stream'den** öğreniriz;
   * süreç içi bir kayıt defteri iki oyuncu iki instance'tayken bunu göremez.
   */
  function detectTakeover(room: RoomDoc, seat: Player): boolean {
    const presence = room.presence[seat]
    if (presence === null || presence.connId === deps.connId) return false
    sendError('SESSION_TAKEOVER', 'Bu koltuk başka bir bağlantı tarafından devralındı.')
    close(WS_CLOSE.SESSION_TAKEOVER, 'takeover')
    return true
  }

  function emitDerived(previous: Snapshot, room: RoomDoc, seat: Player): void {
    const opponentSeat: Player = seat === 'X' ? 'O' : 'X'

    const opponentBefore = previous.seats[opponentSeat]
    const opponentNow = room.seats[opponentSeat]
    if (opponentBefore === null && opponentNow !== null) {
      send({
        type: 'opponent:joined',
        userId: opponentNow.userId,
        seat: opponentSeat,
        name: opponentNow.name,
      })
    }

    const wasDisconnected = previous.disconnectedSeat
    const isDisconnected = room.disconnected?.seat ?? null
    if (wasDisconnected !== opponentSeat && isDisconnected === opponentSeat) {
      send({
        type: 'opponent:left',
        userId: opponentNow?.userId ?? '?',
        seat: opponentSeat,
        graceEndsAt: room.disconnected?.graceEndsAt.getTime() ?? null,
      })
    }
    if (wasDisconnected === opponentSeat && isDisconnected !== opponentSeat) {
      send({ type: 'opponent:returned', seat: opponentSeat })
    }

    if (previous.rematchBy === null && room.rematch !== null) {
      send({
        type: 'rematch:offered',
        by: room.rematch.by,
        expiresAt: room.rematch.expiresAt.getTime(),
      })
    }
    if (previous.rematchBy !== null && room.rematch === null && room.state === 'finished') {
      // Teklifin neden düştüğünü oda taşımıyor; süresi dolması tek P0 yolu.
      send({ type: 'rematch:cancelled', reason: 'expired' })
    }

    if (previous.state === 'playing' && room.state === 'finished') {
      send({
        type: 'game:over',
        status: roomTransportStatus(room),
        endedAt: room.updatedAt.getTime(),
      })
    }
  }

  function emitBoardDelta(previous: Snapshot, room: RoomDoc, seat: Player): void {
    const thin =
      room.version === previous.version + 1 && room.moves.length === previous.moveCount + 1
    const lastMove = room.moves[room.moves.length - 1]
    if (thin && lastMove !== undefined) {
      send({ type: 'move:applied', index: lastMove.index, by: lastMove.by, version: room.version })
      return
    }
    // Boşluk, rövanş, presence yazımı, resync: tam durum tek doğru cevaptır
    // (KK-047 — istemci tahtayı TÜMÜYLE değiştirir, merge etmez).
    send(toStateMessage(room, seat, deps.now()))
  }

  return {
    roomCode: deps.roomCode,
    connId: deps.connId,
    userId: deps.userId,

    seat: () => currentSeat,
    send,
    sendError,
    close,
    isClosed: () => closed,

    primeState(room: RoomDoc): boolean {
      const seat = seatOf(room, deps.userId)
      if (seat === null) return false
      currentSeat = seat
      lastEmojiAt = room.lastEmoji?.at.getTime() ?? 0
      snapshot = snapshotOf(room)
      send(toStateMessage(room, seat, deps.now()))
      return true
    },

    onRoomChange(room: RoomDoc): void {
      if (closed) return

      emitEmoji(room)

      const previous = snapshot
      if (previous === null) return
      if (room.version === previous.version) return

      const seat = seatOf(room, deps.userId)
      if (seat === null) {
        // Koltuk elimizden alındı (rövanş dışı bir yeniden yapılandırma):
        // oda içeriğini görmeye devam etmemeliyiz.
        close(WS_CLOSE.FORBIDDEN, 'seat-lost')
        return
      }
      currentSeat = seat

      if (detectTakeover(room, seat)) return

      emitDerived(previous, room, seat)
      emitBoardDelta(previous, room, seat)
      snapshot = snapshotOf(room)
    },

    onForcedState(room: RoomDoc | null): void {
      if (closed) return
      if (room === null) {
        close(WS_CLOSE.NOT_FOUND, 'room-gone')
        return
      }
      const seat = seatOf(room, deps.userId)
      if (seat === null) {
        close(WS_CLOSE.FORBIDDEN, 'seat-lost')
        return
      }
      if (detectTakeover(room, seat)) return
      currentSeat = seat
      lastEmojiAt = Math.max(lastEmojiAt, room.lastEmoji?.at.getTime() ?? 0)
      snapshot = snapshotOf(room)
      send(toStateMessage(room, seat, deps.now()))
    },

    onRoomDeleted(): void {
      close(WS_CLOSE.NOT_FOUND, 'room-deleted')
    },

    noteProtocolViolation(): boolean {
      violations += 1
      return violations >= MAX_CONSECUTIVE_VIOLATIONS
    },

    noteValidMessage(): void {
      violations = 0
    },
  }
}
