import { z } from 'zod'
import { MAX_EMOJI_LENGTH, ROOM_CODE_LENGTH } from './constants'

export const playerSchema = z.enum(['X', 'O'])
export const cellSchema = playerSchema.nullable()
export const boardSchema = z.array(cellSchema).length(9)

/** ROOM_CODE_ALPHABET ile aynı küme: I, O, 0, 1 hariç. */
export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-HJ-NP-Z2-9]+$/, 'Oda kodu yalnızca karışmayan büyük harf ve rakam içerir')

export const moveIndexSchema = z.number().int().min(0).max(8)

export const gameStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('playing'), turn: playerSchema }),
  z.object({
    kind: z.literal('won'),
    winner: playerSchema,
    line: z.tuple([z.number(), z.number(), z.number()]),
  }),
  z.object({ kind: z.literal('draw') }),
])

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), roomCode: roomCodeSchema }),
  z.object({ type: z.literal('move'), index: moveIndexSchema }),
  z.object({ type: z.literal('resign') }),
  z.object({ type: z.literal('rematch:offer') }),
  z.object({ type: z.literal('rematch:accept') }),
  z.object({ type: z.literal('chat:emoji'), emoji: z.string().min(1).max(MAX_EMOJI_LENGTH) }),
  z.object({ type: z.literal('ping') }),
])

const seatsSchema = z.object({ X: z.string().nullable(), O: z.string().nullable() })

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    roomCode: roomCodeSchema,
    board: boardSchema,
    status: gameStatusSchema,
    players: seatsSchema,
    /** Monotonik sürüm — istemci iyimser güncellemeyi bununla geri alır. */
    version: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('move:applied'),
    index: moveIndexSchema,
    by: playerSchema,
    version: z.number().int(),
  }),
  z.object({ type: z.literal('move:rejected'), index: moveIndexSchema, reason: z.string() }),
  z.object({ type: z.literal('opponent:joined'), userId: z.string(), seat: playerSchema }),
  z.object({ type: z.literal('opponent:left'), userId: z.string() }),
  z.object({ type: z.literal('game:over'), status: gameStatusSchema }),
  z.object({ type: z.literal('rematch:offered'), by: z.string() }),
  z.object({ type: z.literal('chat:emoji'), from: z.string(), emoji: z.string() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('pong') }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
export type Seats = z.infer<typeof seatsSchema>
