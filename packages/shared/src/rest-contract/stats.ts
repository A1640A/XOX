import * as z from 'zod/mini'

// PERF-005: zod/mini — bkz. error-response.ts yorumu. profileResponseSchema
// (istemci runtime'ında gerçekten kullanılan tek profil şeması) bu dosyaya
// bağımlı; klasik zod'u istemciye sızdırmamak için bu da mini.
export const statsSchema = z.object({
  wins: z.number().check(z.int(), z.nonnegative()),
  losses: z.number().check(z.int(), z.nonnegative()),
  draws: z.number().check(z.int(), z.nonnegative()),
})
