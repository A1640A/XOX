import { DEFAULT_BOARD_CONFIG, emptyBoard } from '@xox/game-core'
import type { BoardConfig } from '@xox/game-core'
import type { SeatOccupant } from '@xox/shared'
import { ROOM_CREATE_MAX_ATTEMPTS } from '@xox/shared'
import { Room } from '../models/room'
import { generateRoomCode } from '../room-code'
import type { RoomEvent, TransitionResult } from './types'

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { code?: unknown }).code === 11000
}

/**
 * `— → waiting` (tasarım §4, KK-030/031). Oda kodu `randomInt` tabanlıdır
 * (`generateRoomCode`); E11000 çakışmasında en fazla `ROOM_CREATE_MAX_ATTEMPTS`
 * kez yeniden dener (KK-035/036). Hepsi çakışırsa `CODE_GENERATION_FAILED`
 * döner — istisna dışarı sızmaz (AC1/AC2).
 *
 * `version: 1` bilerek açık yazılır (şema varsayılanı 0'dır): oda
 * oluşturulması kendisi bir durum yazımıdır, "henüz hiç yazılmadı" anlamına
 * gelen 0'la karışmasın diye (state machine §4: "seats.X dolu … version=1").
 *
 * `config` (ADR-0014 §4, KK-B19): `rooms` koleksiyonunda `size`/`winLength`'i
 * yazan TEK yoldur — `size`, `winLength` ve `cellCount(config)` uzunluğunda
 * boş tahta TEK bu `Room.create` çağrısında yazılır. Konfigürasyonu bilmeyen
 * çağıran (varsayılan parametre) davranışı bit düzeyinde korur (ADR-0011
 * deseniyle aynı: config son ve opsiyonel).
 */
export async function createRoom(
  owner: SeatOccupant,
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): Promise<TransitionResult> {
  for (let attempt = 0; attempt < ROOM_CREATE_MAX_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode()
    try {
      await Room.create({
        code,
        state: 'waiting',
        size: config.size,
        winLength: config.winLength,
        board: [...emptyBoard(config)],
        seats: { X: owner, O: null },
        version: 1,
      })
    } catch (error) {
      if (isDuplicateKeyError(error)) continue
      throw error
    }

    const room = await Room.findOne({ code }).lean()
    if (room === null) {
      // Kurulum sonrası okuma başarısız olamaz (tek yazan bu fonksiyon
      // içinde) — savunmacı dal, gerçek bir sunucu hatasıdır.
      return { ok: false, code: 'SERVER_ERROR' }
    }
    const events: RoomEvent[] = [{ kind: 'created' }]
    return { ok: true, room, events }
  }
  return { ok: false, code: 'CODE_GENERATION_FAILED' }
}
