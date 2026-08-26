export { connectDb, disconnectDb, getDbName, getMongoClient, getMongoUri } from './client'
// `.env.local` yükleyicisi TEK modülde toplanır (gotcha 2026-08-24: "test
// setup'ı ile CLI aynı ortamı yüklemeli"). Üçüncü tüketici `apps/web`'in
// gerçek Atlas'a koşan presence entegrasyon testidir; kendi kopyasını yazsaydı
// aynı ayrışma bu kez web tarafında doğardı.
export { loadEnvLocal } from './load-env'
export { generateRoomCode } from './room-code'
export { buildPairKey, deriveParticipants } from './pair'
export { resetDatabase } from './reset'
export { TEST_USERS, TEST_USER_PASSWORD, seedTestUsers } from './seed'
export { EXPECTED_INDEXES, ensureIndexes, type ExpectedIndex } from './indexes'
export { User, type Theme, type UserDoc } from './models/user'
export {
  Room,
  type RoomDisconnected,
  type RoomDoc,
  type RoomEmoji,
  type RoomMove,
  type RoomPresence,
  type RoomRematch,
  type RoomState,
} from './models/room'
export { Game, type GameDoc, type MoveDoc } from './models/game'
export { Friendship, type FriendshipDoc, type FriendshipStatus } from './models/friendship'
export { MobileRefreshToken, type MobileRefreshTokenDoc } from './models/mobile-refresh-token'
export {
  createRoom,
  joinRoom,
  detachConnection,
  applyMove,
  resign,
  offerRematch,
  acceptRematch,
  settleDeadlines,
  pushEmoji,
  finishGame,
  type RoomEvent,
  type TransitionResult,
} from './rooms'
// `rooms/index.ts` DB-002'den beri DONUK (bkz. o dosyanın başlığı) — bu export
// bilinçli olarak üst barrelde ve dosyanın kendisinden geliyor, donmuş barrel'e
// dokunulmadı (DB-003).
export { getRoomSummary, type RoomSummary } from './rooms/summary'
// `resolveBoardConfig` DB-BOARD-001'in okuma kapısıdır (ADR-0014 §2) — `rooms/
// index.ts` DB-002'den beri DONUK olduğu için `getRoomSummary` ile aynı
// desende doğrudan kendi modülünden dışa verilir.
export { resolveBoardConfig } from './rooms/board-config'
export {
  getFriendsView,
  hasFinishedGameTogether,
  removeFriend,
  requestFriendship,
  respondToFriendRequest,
  type FriendEntry,
  type FriendsView,
} from './queries/friends'
