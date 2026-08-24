import { LEADERBOARD_MIN_RATED_GAMES, ROOM_TTL_SECONDS } from '@xox/shared'
import { Friendship } from './models/friendship'
import { Game } from './models/game'
import { MobileRefreshToken } from './models/mobile-refresh-token'
import { Room } from './models/room'
import { User } from './models/user'

export interface ExpectedIndex {
  collection: string
  /** Bileşik indekslerde alan sırası önemlidir — sorgu planlayıcısı buna göre eşleşir. */
  key: Record<string, 1 | -1>
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
}

/**
 * Tasarım §3.6'nın **elle** kopyalanmış beklenti tablosu — şemadan TÜRETİLMEZ.
 * Bir indeks bir model dosyasından silinirse bu liste hâlâ onu bekler ve
 * `indexes.test.ts` kırmızı olur (bkz. gotcha: kendine-referanslı test
 * silmeyi göremez).
 */
export const EXPECTED_INDEXES: readonly ExpectedIndex[] = [
  { collection: 'rooms', key: { code: 1 }, unique: true },
  { collection: 'rooms', key: { updatedAt: 1 }, expireAfterSeconds: ROOM_TTL_SECONDS },
  { collection: 'games', key: { roomCode: 1 } },
  { collection: 'games', key: { participants: 1, finishedAt: -1 } },
  { collection: 'games', key: { pairKey: 1, finishedAt: -1 } },
  { collection: 'games', key: { finishedAt: -1 } },
  { collection: 'users', key: { email: 1 }, unique: true },
  {
    collection: 'users',
    key: { elo: -1 },
    partialFilterExpression: { ratedGames: { $gte: LEADERBOARD_MIN_RATED_GAMES } },
  },
  { collection: 'friendships', key: { userA: 1, userB: 1 }, unique: true },
  { collection: 'friendships', key: { userB: 1, status: 1 } },
  { collection: 'mobileRefreshTokens', key: { jti: 1 }, unique: true },
  { collection: 'mobileRefreshTokens', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
] as const

/**
 * Şemada tanımlı indeksleri gerçek koleksiyonlarla uzlaştırır: eksik olanı
 * kurar, şemada artık olmayanı düşürür. `autoIndex` zamanlamasına güvenmek
 * yerine açıkça çağrılır (ör. `reset.ts` sonrası, indeks doğrulama testinden önce).
 */
export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    Room.syncIndexes(),
    Game.syncIndexes(),
    User.syncIndexes(),
    Friendship.syncIndexes(),
    MobileRefreshToken.syncIndexes(),
  ])
}
