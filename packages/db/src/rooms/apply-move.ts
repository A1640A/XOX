import {
  BOARD_SIZE,
  applyMove as applyMoveCore,
  boardFromCells,
  evaluateStatus,
  isValidMove,
  nextPlayer,
} from '@xox/game-core'
import type { Board } from '@xox/game-core'
import { toTransportStatus } from '@xox/shared'
import type { MoveRejectionReason } from '@xox/shared'
import { Room } from '../models/room'
import { casUpdateRoom } from './cas'
import { seatOf } from './seat'
import type { RoomEvent, TransitionResult } from './types'

/**
 * `isValidMove` yalnız `boolean` döner (game-core kasıtlı olarak reddetme
 * sebebini dışa vermez — bkz. `packages/game-core/src/moves.ts`). Taşıma
 * katmanının istemciye bir sebep göstermesi gerektiği için (B8), aynı üç
 * kuralı `isValidMove`'un KENDİSİNİN kullandığı birebir aynı dışa açık
 * ilkellerle (`BOARD_SIZE`, `evaluateStatus`) sınıflandırıyoruz — kural
 * MANTIĞI burada yeniden YAZILMIYOR, yalnızca `isValidMove`'un zaten
 * `false` dediği bir durumun HANGİ üç sebepten olduğu okunuyor.
 */
function moveRejectionReason(board: Board, index: number): MoveRejectionReason {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_SIZE) return 'out-of-range'
  if (evaluateStatus(board).kind !== 'playing') return 'game-over'
  return 'occupied'
}

/**
 * `playing → playing | finished` (tasarım §5.5) — çevrimiçi oyunun kalbi.
 *
 * Sıra: `seatOf` → `state==='playing'` → `nextPlayer(board)===seat` →
 * `isValidMove` → **TEK koşullu** `findOneAndUpdate({code, version})`. Kural
 * mantığı (`applyMove`/`evaluateStatus`/`isValidMove`/`nextPlayer`) yalnız
 * `@xox/game-core`'dan çağrılır; sıra sahipliği ve koşullu yazma burada
 * yaşar (ADR-0003).
 */
export async function applyMove(
  code: string,
  userId: string,
  index: number,
): Promise<TransitionResult> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) return { ok: false, code: 'ROOM_NOT_FOUND' }

  const seat = seatOf(room, userId)
  if (seat === null) return { ok: false, code: 'ROOM_FULL' }
  if (room.state !== 'playing') return { ok: false, code: 'game-over' }

  const board = boardFromCells(room.board)
  if (nextPlayer(board) !== seat) return { ok: false, code: 'not-your-turn' } // KK-044

  if (!isValidMove(board, index)) {
    return { ok: false, code: moveRejectionReason(board, index) }
  }

  const nextBoard = applyMoveCore(board, index, seat)
  const status = evaluateStatus(nextBoard)

  const set: Record<string, unknown> = {
    board: [...nextBoard],
    // P0: MOVE_TIMEOUT_SECONDS uygulanmaz — deadline daima null (AS-08).
    turnDeadline: null,
  }
  if (status.kind !== 'playing') set['state'] = 'finished'

  const updated = await casUpdateRoom({
    code,
    expectedVersion: room.version,
    extraFilter: { state: 'playing' },
    set,
    push: { moves: { index, by: seat, at: new Date() } },
  })
  // Yarışı kaybettik (KK-045): version zaten değişmişti, 0 doküman güncellendi.
  // REDDEDİLEN hamlede version ARTMAZ — çağıran bu dalın hiçbir yazma
  // yapmadığını görür.
  if (updated === null) return { ok: false, code: 'not-your-turn' }

  const events: RoomEvent[] = [{ kind: 'moved', index, by: seat }]
  if (status.kind !== 'playing') {
    events.push({ kind: 'finished', status: toTransportStatus(status) })
  }
  return { ok: true, room: updated, events }
}
