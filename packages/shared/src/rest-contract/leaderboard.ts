import { z } from 'zod'
import { LEADERBOARD_SIZE } from '../constants'

// ─── GET /api/leaderboard ─────────────────────────────────────────────────
export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string().min(1),
  name: z.string().min(1),
  elo: z.number().int(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  ratedGames: z.number().int().nonnegative(),
})
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>
export const leaderboardResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema).max(LEADERBOARD_SIZE),
  /** Kullanıcı ilk 50'de değilse kendi satırı ayrıca gelir (KK-115). */
  you: leaderboardEntrySchema.nullable(),
})
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>
