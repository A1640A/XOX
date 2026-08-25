import type { Player } from '@xox/shared'
import { forfeitStatus } from '@xox/shared'
import { Room } from '../models/room'
import { casUpdateRoom } from './cas'
import { finishGame, toRoomResult } from './finish'
import { seatOf } from './seat'
import type { RoomEvent, TransitionResult } from './types'

/**
 * `playing → finished` (pes) — KK-054, tasarım §3.7.
 *
 * Taşıma durumu `forfeitStatus` ile üretilir; **`line` daima `null`** olur
 * (ADR-0001: `reason === 'line' ⟺ line !== null`). Kural motoru pes etmeyi
 * bilmez ve bilmemelidir — bu sonuç tahtadan OKUNAMAZ, bu yüzden odaya
 * `result` alanı olarak damgalanır (aksi hâlde canlı katman kazananı hiç
 * öğrenemez; bkz. `models/room.ts` `RoomResult`).
 *
 * Yazma `casUpdateRoom` üzerinden ve `state:'playing'` koşuluyla yapılır: iki
 * oyuncu aynı anda pes ederse yalnız biri yazar, ikincisi `GAME_OVER` alır ve
 * sayaçlar bir kez artar. `finishGame` de kendi CAS'ına sahip olduğu için
 * ikinci savunma hattı oradadır (KK-053).
 */
export async function resign(code: string, userId: string): Promise<TransitionResult> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) return { ok: false, code: 'ROOM_NOT_FOUND' }

  const seat = seatOf(room, userId)
  if (seat === null) return { ok: false, code: 'ROOM_FULL' }
  if (room.state !== 'playing') return { ok: false, code: 'GAME_OVER' }

  const winner: Player = seat === 'X' ? 'O' : 'X'
  const status = forfeitStatus(winner, 'resign')

  const updated = await casUpdateRoom({
    code,
    expectedVersion: room.version,
    extraFilter: { state: 'playing' },
    set: {
      state: 'finished',
      result: toRoomResult(status),
      turnDeadline: null,
      disconnected: null,
    },
  })
  // Yarışı kaybettik: oyunu başkası bitirmiş. Hiçbir yazma yapılmadı.
  if (updated === null) return { ok: false, code: 'GAME_OVER' }

  await finishGame(updated, status)

  const events: RoomEvent[] = [
    { kind: 'resigned', by: seat },
    { kind: 'finished', status },
  ]
  return { ok: true, room: updated, events }
}
