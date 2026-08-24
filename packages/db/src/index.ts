export { connectDb, disconnectDb, getDbName, getMongoClient, getMongoUri } from './client'
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
