/** Karışan karakterler (I, O, 0, 1) alfabede yok — kod telefonda okunacak. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const ROOM_TTL_SECONDS = 2 * 60 * 60
/** Oda kodu çakışırsa (E11000) bu kadar kez yeniden denenir — KK-035. */
export const ROOM_CREATE_MAX_ATTEMPTS = 5

// ─── Oyun akışı ───────────────────────────────────────────────────────────
export const MOVE_TIMEOUT_SECONDS = 60
/** Rakip kopunca oyunu kaybetmeden önceki süre — §3.1 / AS-05. */
export const DISCONNECT_GRACE_SECONDS = 30
/** Rövanş teklifinin ömrü — KK-057. */
export const REMATCH_OFFER_TTL_SECONDS = 60

// ─── WebSocket taşıması ───────────────────────────────────────────────────
export const WS_HEARTBEAT_MS = 25_000
export const WS_RECONNECT_BASE_MS = 500
export const WS_RECONNECT_MAX_MS = 10_000
/** 2 kayıp heartbeat + pay: bu süre sessiz kalan bağlantı 4408 ile kapanır. */
export const WS_IDLE_TIMEOUT_MS = WS_HEARTBEAT_MS * 3
/** Fonksiyon süresi dolmadan bu kadar önce 4499 ile planlı rotasyon (Z2). */
export const WS_ROTATE_MARGIN_MS = 10_000
/** Tek kullanımlık WS bileti ömrü — ADR-0006. */
export const WS_TICKET_TTL_SECONDS = 30
/** Bu kadar ardışık INVALID_MESSAGE bağlantıyı 4400 ile kapatır — KK-048. */
export const MAX_PROTOCOL_VIOLATIONS = 3

// ─── Kimlik ───────────────────────────────────────────────────────────────
/** Mobil access token ömrü: 15 dk — KK-009. */
export const MOBILE_ACCESS_TTL_SECONDS = 900
/** Mobil refresh token ömrü: 30 gün — KK-009. */
export const MOBILE_REFRESH_TTL_SECONDS = 2_592_000
export const MIN_PASSWORD_LENGTH = 8
export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 40

// ─── Emoji (P2) ───────────────────────────────────────────────────────────
export const MAX_EMOJI_LENGTH = 8
/** Sabit ve beyaz listeli palet — KK-122/123. Sıra `emoji-<n>` kancasıdır. */
export const EMOJI_PALETTE = ['👋', '😀', '😂', '😮', '😢', '👏', '🔥', '🤝'] as const
/** KK-124 — 10 saniyede en fazla 5 emoji. */
export const EMOJI_RATE_LIMIT = { count: 5, windowMs: 10_000 } as const

// ─── ELO ve sosyal katman (P2) ────────────────────────────────────────────
export const ELO_K = 24
/** Puan bu değerin altına inmez — KK-110. */
export const ELO_FLOOR = 100
/** Yeni kullanıcının başlangıç puanı — KK-081. */
export const ELO_START = 1200
/** Bu sayıdan az hamleli oyun puansızdır — KK-110/112. */
export const ELO_MIN_MOVES = 3
export const ELO_PAIR_WINDOW_HOURS = 24
/** Aynı çiftin pencere içindeki puanlı oyun tavanı — KK-113. */
export const ELO_PAIR_MAX_RATED = 3
export const LEADERBOARD_MIN_RATED_GAMES = 5
export const LEADERBOARD_SIZE = 50
export const HISTORY_PAGE_SIZE = 20
