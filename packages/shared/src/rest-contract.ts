import { z } from 'zod'
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  HISTORY_PAGE_SIZE,
  LEADERBOARD_SIZE,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from './constants'
import { errorCodeSchema } from './errors'
import { endReasonSchema } from './game-status'
import { epochMsSchema, roomCodeSchema } from './primitives'
import { playersSchema } from './ws-protocol'

/**
 * REST yüzeyinin gövde ve yanıt şemaları (tasarım §7).
 *
 * Sunucu doğrulaması istemciden **bağımsızdır** (KK-003): tarayıcıdaki form
 * kısıtları yardımcıdır, kapı burasıdır. Her route handler gövdeyi bu
 * şemalardan geçirir ve hatayı `errorResponseSchema` biçiminde döner.
 */

// ─── Ortak parçalar ───────────────────────────────────────────────────────
export const errorResponseSchema = z.object({ code: errorCodeSchema, message: z.string() })

export const displayNameSchema = z.string().trim().min(DISPLAY_NAME_MIN).max(DISPLAY_NAME_MAX)
export const emailSchema = z.email().toLowerCase()
export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)
export const themeSchema = z.enum(['acik', 'koyu'])
export const statsSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
})
const userRefSchema = z.object({ userId: z.string().min(1), name: z.string().min(1) })

// ─── POST /api/auth/register ──────────────────────────────────────────────
export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
})
export const registerResponseSchema = z.object({ userId: z.string().min(1) })

// ─── POST /api/rooms · GET /api/rooms/[code] ──────────────────────────────
export const roomStateSchema = z.enum(['waiting', 'playing', 'finished'])
export const roomCreateResponseSchema = z.object({ code: roomCodeSchema })
/**
 * `canJoin` türetilmiş bir alandır, bağımsız bir bayrak değil: **yalnız**
 * `waiting` odada ve boş koltuk varsa doğrudur (§4 yaşam döngüsü). Değişmez
 * dayatılmazsa "bitmiş + iki koltuk dolu + canJoin:true" gibi bir yanıt
 * sözleşmeye uyar, istemci katıl düğmesini açar ve WS 4403 ile kapanır.
 */
export const roomStateResponseSchema = z
  .object({
    code: roomCodeSchema,
    state: roomStateSchema,
    seats: playersSchema,
    canJoin: z.boolean(),
  })
  .superRefine((room, ctx) => {
    const bosKoltukVar = room.seats.X === null || room.seats.O === null
    if (room.canJoin !== (room.state === 'waiting' && bosKoltukVar)) {
      ctx.addIssue({
        code: 'custom',
        message: 'canJoin yalnız bekleyen ve boş koltuğu olan odada true olabilir',
      })
    }
  })

// ─── POST /api/ws/ticket ──────────────────────────────────────────────────
export const wsTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  /** Saniye — ADR-0006, WS_TICKET_TTL_SECONDS. */
  expiresIn: z.number().int().positive(),
})

// ─── GET/PATCH /api/profile ───────────────────────────────────────────────
export const profileResponseSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  stats: statsSchema,
  elo: z.number().int(),
  ratedGames: z.number().int().nonnegative(),
  theme: themeSchema,
})
/** Kısmi güncelleme: yalnız ad ve tema değiştirilebilir (KK-082/083). */
export const profileUpdateBodySchema = z.strictObject({
  name: displayNameSchema.optional(),
  theme: themeSchema.optional(),
})

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
export const leaderboardResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema).max(LEADERBOARD_SIZE),
  /** Kullanıcı ilk 50'de değilse kendi satırı ayrıca gelir (KK-115). */
  you: leaderboardEntrySchema.nullable(),
})

// ─── GET /api/matches ─────────────────────────────────────────────────────
export const matchResultSchema = z.enum(['win', 'loss', 'draw'])
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
export const matchesResponseSchema = z.object({
  matches: z.array(matchSchema).max(HISTORY_PAGE_SIZE),
})

// ─── /api/friends ─────────────────────────────────────────────────────────
export const friendSchema = userRefSchema.extend({ elo: z.number().int() })
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

// ─── POST /api/auth/mobile/refresh ────────────────────────────────────────
export const mobileRefreshBodySchema = z.object({ refresh: z.string().min(1) })
export const mobileTokenPairSchema = z.object({
  token: z.string().min(1),
  refresh: z.string().min(1),
  /** Access token'ın saniye cinsinden kalan ömrü. */
  expiresIn: z.number().int().positive(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
export type RegisterBody = z.infer<typeof registerBodySchema>
export type RoomState = z.infer<typeof roomStateSchema>
export type RoomStateResponse = z.infer<typeof roomStateResponseSchema>
export type WsTicketResponse = z.infer<typeof wsTicketResponseSchema>
export type Theme = z.infer<typeof themeSchema>
export type ProfileResponse = z.infer<typeof profileResponseSchema>
export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>
export type MatchResult = z.infer<typeof matchResultSchema>
export type Match = z.infer<typeof matchSchema>
export type Friend = z.infer<typeof friendSchema>
export type MobileTokenPair = z.infer<typeof mobileTokenPairSchema>
