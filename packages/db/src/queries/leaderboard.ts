import { LEADERBOARD_MIN_RATED_GAMES, LEADERBOARD_SIZE } from '@xox/shared'
import { User } from '../models/user'

export interface LeaderboardEntry {
  rank: number
  userId: string
  name: string
  elo: number
  stats: { wins: number; losses: number; draws: number }
}

export interface LeaderboardView {
  top: LeaderboardEntry[]
  /**
   * Giriş yapan kullanıcının KENDİ satırı — yalnız `top`'un DIŞINDAYSA
   * dolu (KK-115: "ilk 50'de değilse listenin ALTINDA ayrıca gösterilir").
   * Zaten `top` içindeyse `null` — aynı satırı iki kez göstermemek için.
   */
  self: LeaderboardEntry | null
}

/**
 * KK-115/117 — en yüksek ELO'lu `limit` (varsayılan `LEADERBOARD_SIZE`=50)
 * oyuncu. Sorgu BİREBİR `users.elo` kısmi indeksinin (`{elo:-1}`,
 * `partialFilterExpression:{ratedGames:{$gte:LEADERBOARD_MIN_RATED_GAMES}}`,
 * bkz. `models/user.ts`) filtresiyle eşleşir — planlayıcı bu yüzden hem
 * filtreyi hem sıralamayı TEK IXSCAN'de karşılar, ayrı bir bloklayıcı SORT
 * aşaması OLUŞMAZ (KK-117, `leaderboard.test.ts`'te `explain` ile kanıtlı).
 * Sorgu ŞEKLİNİ (`find` + `sort` + `limit`) burada ELLE tekrar YAZMA — index
 * ile aynı satırda kal, aksi hâlde plan sessizce COLLSCAN'e döner.
 */
export async function getLeaderboardTop(
  limit: number = LEADERBOARD_SIZE,
): Promise<LeaderboardEntry[]> {
  const docs = await User.find(
    { ratedGames: { $gte: LEADERBOARD_MIN_RATED_GAMES } },
    'name elo stats',
  )
    .sort({ elo: -1 })
    .limit(limit)
    .lean()
  return docs.map((doc, index) => ({
    rank: index + 1,
    userId: doc._id,
    name: doc.name,
    elo: doc.elo,
    stats: doc.stats,
  }))
}

/**
 * Bir kullanıcının KENDİ sırası — eşiği (`LEADERBOARD_MIN_RATED_GAMES`) hiç
 * karşılamıyorsa `null` (listeye hiç giremeyen bir kullanıcının "sırası"
 * anlamsızdır). Sıra, KENDİSİNDEN yüksek ELO'lu UYGUN oyuncu sayısı + 1 —
 * `getLeaderboardTop`'un ürettiği sırayla AYNI ilke (yüksekten alçağa, eşit
 * puanda aynı sırayı paylaşma — standart yarışma sıralaması).
 */
export async function getLeaderboardSelf(userId: string): Promise<LeaderboardEntry | null> {
  const user = await User.findById(userId, 'name elo stats ratedGames').lean()
  if (user === null || user.ratedGames < LEADERBOARD_MIN_RATED_GAMES) return null

  const higherRatedCount = await User.countDocuments({
    ratedGames: { $gte: LEADERBOARD_MIN_RATED_GAMES },
    elo: { $gt: user.elo },
  })

  return {
    rank: higherRatedCount + 1,
    userId: user._id,
    name: user.name,
    elo: user.elo,
    stats: user.stats,
  }
}

/**
 * `/siralama` ve `GET /api/leaderboard`'ın TEK veri kaynağı (`getFriendsView`
 * ile aynı desen). `viewerUserId` `null` ise (oturumsuz/anonim görünüm
 * — şu an tüm rotalar kimlik ister ama sözleşme ileride gevşerse diye)
 * `self` her zaman `null`dur.
 */
export async function getLeaderboardView(
  viewerUserId: string | null,
  limit: number = LEADERBOARD_SIZE,
): Promise<LeaderboardView> {
  const top = await getLeaderboardTop(limit)
  if (viewerUserId === null) return { top, self: null }
  if (top.some((entry) => entry.userId === viewerUserId)) return { top, self: null }
  const self = await getLeaderboardSelf(viewerUserId)
  return { top, self }
}
