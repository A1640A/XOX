import { z } from 'zod'

// ─── POST /api/ws/ticket ──────────────────────────────────────────────────
export const wsTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  /** Saniye — ADR-0006, WS_TICKET_TTL_SECONDS. */
  expiresIn: z.number().int().positive(),
})
export type WsTicketResponse = z.infer<typeof wsTicketResponseSchema>
