import { z } from 'zod'
import { HISTORY_PAGE_SIZE } from '../constants'
import { endReasonSchema } from '../game-status'
import { epochMsSchema } from '../primitives'
import { userRefSchema } from './user-ref'

// ─── GET /api/matches ─────────────────────────────────────────────────────
export const matchResultSchema = z.enum(['win', 'loss', 'draw'])
export type MatchResult = z.infer<typeof matchResultSchema>
/**
 * Değişmez: **puanlıysa delta vardır, puansızsa yoktur** —
 * `rated === (eloDelta !== null)`. `transportStatusSchema`'daki kalıbın aynısı.
 * Dayatılmazsa `{rated:true, eloDelta:null}` satırı geçmişte puanlı görünür ama
 * ELO sütununda "—" çizilir; kullanıcı puanının nereye gittiğini göremez ve
 * E2E bunu yakalayamaz, çünkü sözleşme izin veriyordur.
 */
export const matchSchema = z
  .object({
    gameId: z.string().min(1),
    finishedAt: epochMsSchema,
    opponent: userRefSchema,
    result: matchResultSchema,
    endReason: endReasonSchema.nullable(),
    rated: z.boolean(),
    /** Puansız oyunda null — listede "—" gösterilir (KK-116). */
    eloDelta: z.number().int().nullable(),
  })
  .superRefine((match, ctx) => {
    if (match.rated !== (match.eloDelta !== null)) {
      ctx.addIssue({ code: 'custom', message: 'rated ile eloDelta tutarsız' })
    }
  })
export type Match = z.infer<typeof matchSchema>
export const matchesResponseSchema = z.object({
  matches: z.array(matchSchema).max(HISTORY_PAGE_SIZE),
})
