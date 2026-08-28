import { z } from 'zod'
import { userRefSchema } from './user-ref'

// ─── /api/friends ─────────────────────────────────────────────────────────
export const friendSchema = userRefSchema.extend({ elo: z.number().int() })
export type Friend = z.infer<typeof friendSchema>
export const friendsResponseSchema = z.object({
  friends: z.array(friendSchema),
  incoming: z.array(friendSchema),
  outgoing: z.array(friendSchema),
})
export const friendRequestBodySchema = z.object({ userId: z.string().min(1) })
export const friendActionBodySchema = z.object({
  userId: z.string().min(1),
  action: z.enum(['accept', 'reject']),
})
