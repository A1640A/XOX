import { z } from 'zod'

// ─── POST /api/auth/mobile/refresh ────────────────────────────────────────
export const mobileRefreshBodySchema = z.object({ refresh: z.string().min(1) })
export const mobileTokenPairSchema = z.object({
  token: z.string().min(1),
  refresh: z.string().min(1),
  /** Access token'ın saniye cinsinden kalan ömrü. */
  expiresIn: z.number().int().positive(),
})
export type MobileTokenPair = z.infer<typeof mobileTokenPairSchema>
