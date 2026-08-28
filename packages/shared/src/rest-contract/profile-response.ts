import * as z from 'zod/mini'
import { statsSchema } from './stats'
import { themeSchema } from './theme'

// ─── GET /api/profile ─────────────────────────────────────────────────────
// PERF-005: zod/mini — bkz. error-response.ts yorumu. `ProfileContent.tsx`
// yalnız BU şemayı çalışma zamanında kullanıyor; `profileUpdateBodySchema`
// (PATCH gövdesi, yalnız sunucu route'u tüketir) BİLEREK `./profile-update`
// dosyasına AYRI konuldu — aynı dosyada kalsaydı, hiç kullanılmasa bile
// modül-granülerliğinde tree-shaking onu da istemciye taşırdı.
export const profileResponseSchema = z.object({
  name: z.string().check(z.minLength(1)),
  email: z.email(),
  stats: statsSchema,
  elo: z.number().check(z.int()),
  ratedGames: z.number().check(z.int(), z.nonnegative()),
  theme: themeSchema,
})
export type ProfileResponse = z.infer<typeof profileResponseSchema>
