import type { Player } from '@xox/shared'
import { DISCONNECT_GRACE_SECONDS } from '@xox/shared'
import { Room } from '../models/room'
import { casUpdateRoom } from './cas'

/**
 * WS bağlantısı kapanınca çağrılır (tasarım §5.2 adım 10 / §5.4).
 *
 * **Koşulludur:** yalnız `presence[seat].connId === connId` ise yazar — bu
 * koşul hem ilk okumada hem de `casUpdateRoom`'un `extraFilter`'ında ayrıca
 * uygulanır, böylece okuma ile yazma arasında bir takeover araya girse bile
 * (yarış) yazma 0 doküman günceller ve sessizce hiçbir şey değişmez.
 *
 * Devredilmiş (takeover edilmiş) eski bağlantının kapanışı **hiçbir şey
 * yazmaz** — aksi hâlde takeover anında sahte bir "rakip koptu" olayı
 * yayınlanırdı (klasik yarış hatası, AC6).
 */
export async function detachConnection(code: string, seat: Player, connId: string): Promise<void> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) return

  const presence = room.presence[seat]
  if (presence?.connId !== connId) return

  const set: Record<string, unknown> = { [`presence.${seat}`]: null }
  if (room.state === 'playing') {
    const now = new Date()
    set['disconnected'] = {
      seat,
      at: now,
      graceEndsAt: new Date(now.getTime() + DISCONNECT_GRACE_SECONDS * 1000),
    }
  }

  await casUpdateRoom({
    code,
    expectedVersion: room.version,
    extraFilter: { [`presence.${seat}.connId`]: connId },
    set,
  })
}
