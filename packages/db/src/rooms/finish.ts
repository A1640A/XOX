import type { TransportStatus } from '@xox/shared'
import type { RoomDoc } from '../models/room'

/**
 * `games` CAS'ı + stats + ELO (KK-052/053, tasarım §9). `Game.findOneAndUpdate
 * ({_id, finishedAt:null}, ...)` — `null` dönerse başkası zaten bitirmiştir,
 * hiçbir şey yapılmaz (idempotans, tek kazanan bu CAS'tır).
 *
 * **Tipli iskelet**: `W1-02`/`W3-01` doldurur (`packages/db/src/rooms/
 * finish.ts`, tasarım §12).
 */
export async function finishGame(room: RoomDoc, status: TransportStatus): Promise<void> {
  await Promise.resolve()
  throw new Error(
    `finishGame(${room.code}, ${status.kind}) henüz uygulanmadı — W1-02/W3-01 doldurur (tasarım §9)`,
  )
}
