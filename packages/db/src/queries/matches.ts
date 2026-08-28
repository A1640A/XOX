import { HISTORY_PAGE_SIZE } from '@xox/shared'
import type { EndReason, Player } from '@xox/shared'
import { Game } from '../models/game'
import { User } from '../models/user'

export interface MatchOpponent {
  userId: string
  name: string
}

export type MatchResult = 'win' | 'loss' | 'draw'

export interface MatchEntry {
  gameId: string
  finishedAt: number
  opponent: MatchOpponent
  result: MatchResult
  endReason: EndReason | null
  rated: boolean
  /** Puansız oyunda `null` — `/gecmis` bu değeri "—" olarak gösterir (KK-116). */
  eloDelta: number | null
}

/**
 * KK-116/117 — `/gecmis` ve `GET /api/matches`'ın TEK veri kaynağı. Sorgu
 * ŞEKLİ (`find({participants, finishedAt:{$ne:null}})` + `sort({finishedAt:-1})`
 * + `limit`) `games`'in `{participants:1, finishedAt:-1}` bileşik indeksinin
 * (`models/game.ts`) filtresiyle BİREBİR eşleşir — planlayıcı bu yüzden TEK
 * IXSCAN'de hem eşitliği hem sıralamayı karşılar, ayrı bir bloklayıcı SORT
 * aşaması OLUŞMAZ (KK-117, `matches.test.ts`'te `explain` ile kanıtlı). Sorgu
 * ŞEKLİNİ burada ELLE tekrar YAZMA — index ile aynı satırda kal, aksi hâlde
 * plan sessizce COLLSCAN'e döner.
 *
 * KK-077: `finishedAt: { $ne: null }` — sürmekte olan ya da hiç bitmemiş
 * (terk edilmiş, otoritesiz kalmış) oyunlar listede HİÇ görünmez.
 *
 * Opponent adı ikinci bir toplu sorguyla (`User.find({_id:{$in:...}})`)
 * çözülür — `getFriendsView`ın aynı deseni (N+1 yerine tek toplu okuma).
 */
export async function getMatchHistory(
  userId: string,
  limit: number = HISTORY_PAGE_SIZE,
): Promise<MatchEntry[]> {
  const docs = await Game.find(
    { participants: userId, finishedAt: { $ne: null } },
    'players winner isDraw endReason rated eloDelta finishedAt',
  )
    .sort({ finishedAt: -1 })
    .limit(limit)
    .lean()

  if (docs.length === 0) return []

  const seatByGame = new Map<string, Player>()
  const opponentIdByGame = new Map<string, string>()
  const opponentIds = new Set<string>()
  for (const doc of docs) {
    const seat: Player = doc.players.X === userId ? 'X' : 'O'
    const opponentId = seat === 'X' ? doc.players.O : doc.players.X
    seatByGame.set(doc._id, seat)
    opponentIdByGame.set(doc._id, opponentId)
    opponentIds.add(opponentId)
  }

  const opponentUsers = await User.find({ _id: { $in: [...opponentIds] } }, 'name').lean()
  const nameById = new Map(opponentUsers.map((user) => [user._id, user.name]))

  const entries: MatchEntry[] = []
  for (const doc of docs) {
    // Sorgu `finishedAt: { $ne: null }` ile filtreledi — burası yalnız TS
    // daraltması, çalışma zamanında hiçbir doküman bu dala düşmez.
    if (doc.finishedAt === null) continue

    const opponentId = opponentIdByGame.get(doc._id)
    const opponentName = opponentId === undefined ? undefined : nameById.get(opponentId)
    // Kullanıcı silinmesi bu uygulamada bir özellik değil — yine de
    // çözülemeyen bir rakip adı satırı sessizce ATLAR, hatalı veriyle
    // çökmez (`getFriendsView`'in `toEntries` deseninin aynısı).
    if (opponentId === undefined || opponentName === undefined) continue

    const mySeat = seatByGame.get(doc._id)
    if (mySeat === undefined) continue

    const result: MatchResult = doc.isDraw ? 'draw' : doc.winner === mySeat ? 'win' : 'loss'

    entries.push({
      gameId: doc._id,
      finishedAt: doc.finishedAt.getTime(),
      opponent: { userId: opponentId, name: opponentName },
      result,
      endReason: doc.endReason,
      rated: doc.rated,
      eloDelta: doc.rated ? doc.eloDelta[mySeat] : null,
    })
  }

  return entries
}
