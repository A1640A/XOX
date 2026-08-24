import type { Player } from '@xox/shared'
import type { RoomDoc } from '../models/room'

/**
 * Koltuk sahipliği **userId'ye** aittir — `presence.connId`'ye değil (tasarım
 * §5.5/AC3). Bir oda "dolu" olsa bile aynı userId geri dönerse kendi koltuğuna
 * oturur; bu fonksiyon o eşleşmeyi tek yerde yapar.
 */
export function seatOf(room: Pick<RoomDoc, 'seats'>, userId: string): Player | null {
  if (room.seats.X?.userId === userId) return 'X'
  if (room.seats.O?.userId === userId) return 'O'
  return null
}
