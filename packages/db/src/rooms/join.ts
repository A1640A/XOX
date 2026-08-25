import type { Player, SeatOccupant } from '@xox/shared'
import { Game } from '../models/game'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'
import { buildPairKey, deriveParticipants } from '../pair'
import { casUpdateRoom } from './cas'
import { seatOf } from './seat'
import type { RoomEvent, TransitionResult } from './types'

/**
 * Aynı userId'nin ikinci bağlantısı (§3.2/§5.4 "takeover"): `presence[seat]`
 * KOŞULLU olarak üzerine yazılır (`version+1`), `disconnected` YAZILMAZ —
 * rakip hiçbir kopma görmez. Grace sürüyorsa (`disconnected.seat === seat`)
 * dönüş bunu temizler (§5.4: "kalan oyuncu opponent:returned alır").
 */
async function reconnect(room: RoomDoc, seat: Player, connId: string): Promise<TransitionResult> {
  const clearsDisconnect = room.disconnected !== null && room.disconnected.seat === seat

  // ⚠️ YAZMA AMPLİFİKASYONU KAPISI (güvenlik + performans denetimi bulgusu).
  // Değişecek bir şey yoksa YAZMA. Kısa devre olmadan, koltuğu olan bir oyuncu
  // ~35 baytlık `join` çerçevesini tekrarlayarak her seferinde bir CAS yazması
  // + `version+1` + bir change stream olayı + odadaki HER bağlantıya tam
  // `state` (~350 bayt) ürettirebiliyordu. Asıl zarar kendi odasında değil:
  // change stream instance başına TEKTİR (ADR-0002), yani tek soketin ürettiği
  // yazma seli o instance'taki BÜTÜN odaların olay dağıtımını geciktirir.
  if (room.presence[seat]?.connId === connId && !clearsDisconnect) {
    return { ok: true, room, events: [{ kind: 'reconnected', seat }] }
  }

  const set: Record<string, unknown> = {
    [`presence.${seat}`]: { connId, since: new Date() },
  }
  if (clearsDisconnect) {
    set['disconnected'] = null
  }

  const updated = await casUpdateRoom({ code: room.code, expectedVersion: room.version, set })
  if (updated === null) return { ok: false, code: 'SERVER_ERROR' }
  const events: RoomEvent[] = [{ kind: 'reconnected', seat }]
  return { ok: true, room: updated, events }
}

/**
 * `waiting → playing` (2. koltuk dolunca) **veya** yeniden bağlanma/takeover
 * (tasarım §4/§5.5/AC3-4-5).
 *
 * Koltuk sahipliği userId'ye aittir: `seats.X.userId === userId` ya da
 * `seats.O.userId === userId` ise oda DOLU OLSA BİLE yeniden bağlanma kabul
 * edilir — `ROOM_FULL` dönmez (AC3). İkinci koltuk YENİ bir kullanıcıyla
 * dolarsa tek yazmada `seats.O`, `state:'playing'`, `startedAt`, `gameId`
 * (yeni `Game`, `finishedAt:null`), `version+1` uygulanır (AC4).
 */
export async function joinRoom(
  code: string,
  user: SeatOccupant,
  connId: string,
): Promise<TransitionResult> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) return { ok: false, code: 'ROOM_NOT_FOUND' }

  const existingSeat = seatOf(room, user.userId)
  if (existingSeat !== null) return reconnect(room, existingSeat, connId)

  if (room.seats.X !== null && room.seats.O !== null) {
    return { ok: false, code: 'ROOM_FULL' }
  }

  const seat: Player = room.seats.X === null ? 'X' : 'O'
  const otherSeat: Player = seat === 'X' ? 'O' : 'X'
  const otherOccupant = room.seats[otherSeat]
  const now = new Date()

  if (otherOccupant === null) {
    // İkisi de boş olamayacak durumdayken (kurucu her zaman X'i doldurur)
    // savunmacı dal: yalnız X'i doldurur, oyun BAŞLAMAZ.
    const updated = await casUpdateRoom({
      code,
      expectedVersion: room.version,
      extraFilter: { [`seats.${seat}`]: null },
      set: { [`seats.${seat}`]: user, [`presence.${seat}`]: { connId, since: now } },
    })
    if (updated === null) return { ok: false, code: 'ROOM_FULL' }
    return { ok: true, room: updated, events: [{ kind: 'joined', seat }] }
  }

  const players =
    seat === 'X'
      ? { X: user.userId, O: otherOccupant.userId }
      : { X: otherOccupant.userId, O: user.userId }

  const game = await Game.create({
    roomCode: code,
    players,
    participants: deriveParticipants(players),
    pairKey: buildPairKey(players.X, players.O),
  })

  const updated = await casUpdateRoom({
    code,
    expectedVersion: room.version,
    extraFilter: { [`seats.${seat}`]: null },
    set: {
      [`seats.${seat}`]: user,
      [`presence.${seat}`]: { connId, since: now },
      state: 'playing',
      startedAt: now,
      gameId: game._id,
    },
  })
  if (updated === null) return { ok: false, code: 'ROOM_FULL' }
  return { ok: true, room: updated, events: [{ kind: 'joined', seat }] }
}
