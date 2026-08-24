import { z } from 'zod'
import { ROOM_CODE_LENGTH } from './constants'

/**
 * Protokolün en küçük yapı taşları. `game-status.ts` ve `ws-protocol.ts`'in
 * ikisi de bunlara ihtiyaç duyar; ortak bir modülde durmasalardı
 * `ws-protocol -> game-status -> ws-protocol` döngüsü oluşurdu
 * (`import-x/no-cycle` bunu zaten reddeder).
 */
export const playerSchema = z.enum(['X', 'O'])
export const cellSchema = playerSchema.nullable()
export const boardSchema = z.array(cellSchema).length(9)

/** Tahta indeksi: 0..8 tam sayı. Hem hamle hem kazanan çizgi bunu kullanır. */
export const cellIndexSchema = z.number().int().min(0).max(8)

/** ROOM_CODE_ALPHABET ile aynı küme: I, O, 0, 1 hariç. */
export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-HJ-NP-Z2-9]+$/, 'Oda kodu yalnızca karışmayan büyük harf ve rakam içerir')

/** Epoch milisaniye — istemci saat sapması `state.serverTime` ile düzeltilir. */
export const epochMsSchema = z.number().int()

export type Player = z.infer<typeof playerSchema>
export type Cell = z.infer<typeof cellSchema>
export type BoardCells = z.infer<typeof boardSchema>
export type RoomCode = z.infer<typeof roomCodeSchema>
