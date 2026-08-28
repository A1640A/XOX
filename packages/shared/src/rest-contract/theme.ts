import * as z from 'zod/mini'

// PERF-005: zod/mini — bkz. error-response.ts yorumu.
export const themeSchema = z.enum(['acik', 'koyu'])
export type Theme = z.infer<typeof themeSchema>
