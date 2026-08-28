import { z } from 'zod'
import { displayNameSchema } from './display-name'
import { emailSchema } from './email'
import { passwordSchema } from './password'

// ─── POST /api/auth/register ──────────────────────────────────────────────
export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
})
export type RegisterBody = z.infer<typeof registerBodySchema>
export const registerResponseSchema = z.object({ userId: z.string().min(1) })
