import { Game } from '../models/game'
import { Friendship } from '../models/friendship'
import { User } from '../models/user'
import { buildPairKey } from '../pair'

export interface FriendEntry {
  userId: string
  name: string
  elo: number
}

export interface FriendsView {
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
}

/**
 * Sıralı çift — `Friendship` modelinin `userA < userB` değişmeziyle (§3.5,
 * `packages/db/src/models/friendship.ts`) AYNI karşılaştırmayı kullanır.
 * `buildPairKey` metnini üretmiyoruz (o `games.pairKey` içindir), yalnız aynı
 * `a < b` sıralama ilkesini paylaşıyoruz.
 */
function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/**
 * KK-126 uygunluk kapısı: yalnız birlikte BİTMİŞ bir oyunu olan çift istek
 * gönderebilir. TEK sorgu — var olmayan bir `userId` için de AYNI sorgu
 * (`games.pairKey` üzerinde) çalışır; kullanıcının var olup olmadığına dair
 * ayrı bir kontrol YOKTUR. Bu bilinçli: `POST /api/friends`'in var olmayan
 * bir `userId` ile var olan ama uygun olmayan bir `userId` arasında yanıt
 * ya da zamanlama farkı üretmemesi gerekiyor (güvenlik incelemesi dersi —
 * oda ucundaki `userId` sızıntısı bu ucun tam olarak kabul ettiği girdiydi).
 */
export async function hasFinishedGameTogether(userA: string, userB: string): Promise<boolean> {
  const pairKey = buildPairKey(userA, userB)
  const match = await Game.exists({ pairKey, finishedAt: { $ne: null } })
  return match !== null
}

/**
 * İstek idempotent: pending ya da accepted bir kayıt zaten varsa DOKUNULMAZ
 * (KK-125/126 — "sessizce yeni kayıt açmama"). `$setOnInsert` yalnız kayıt
 * YOKSA yazar. Filtredeki `userA`/`userB` zaten sıralı geçirilir — model
 * hook'u (`pre('findOneAndUpdate')`) bunu ayrıca doğrular, ama üretim burada
 * zaten doğru sırayla çağırıyor (tek üretim noktası `sortPair`).
 */
export async function requestFriendship(requesterId: string, targetId: string): Promise<void> {
  const [userA, userB] = sortPair(requesterId, targetId)
  await Friendship.findOneAndUpdate(
    { userA, userB },
    { $setOnInsert: { userA, userB, status: 'pending', requestedBy: requesterId } },
    { upsert: true },
  )
}

/**
 * Yalnız GERÇEK alıcı kabul/reddedebilir — filtre `requestedBy: requesterId`
 * şart koşar. Kendi isteğini kabul etmeye çalışmak (`requestedBy` filtreyle
 * eşleşmez) ya da var olmayan bir isteğe yanıt vermek sessizce hiçbir şeyi
 * DEĞİŞTİRMEZ — `updateOne`/`deleteOne` 0 eşleşmeyle döner, görünür bir hata
 * sinyali üretmez (idempotans + numaralandırma karşıtı).
 */
export async function respondToFriendRequest(
  recipientId: string,
  requesterId: string,
  action: 'accept' | 'reject',
): Promise<void> {
  const [userA, userB] = sortPair(recipientId, requesterId)
  const filter = { userA, userB, status: 'pending' as const, requestedBy: requesterId }
  if (action === 'accept') {
    await Friendship.updateOne(filter, { $set: { status: 'accepted' } })
  } else {
    await Friendship.deleteOne(filter)
  }
}

/**
 * KK-127 — listeden çıkarma. Tek paylaşılan kayıt sıralı çift üzerinde
 * tutulduğu için TEK `deleteOne` iki tarafın da listesinden kaldırır. Yalnız
 * `accepted` durumundaki ilişkiyi hedefler (bekleyen bir isteği iptal etmek
 * bu görevin kabul kriterlerinde YOK — kapsam dışına çıkılmadı).
 */
export async function removeFriend(userId: string, otherUserId: string): Promise<void> {
  const [userA, userB] = sortPair(userId, otherUserId)
  await Friendship.deleteOne({ userA, userB, status: 'accepted' })
}

function toEntries(ids: string[], byId: Map<string, FriendEntry>): FriendEntry[] {
  const entries: FriendEntry[] = []
  for (const id of ids) {
    const entry = byId.get(id)
    if (entry !== undefined) entries.push(entry)
  }
  return entries
}

/**
 * `/arkadaslar` ve `GET /api/friends`'in tek veri kaynağı. `status:'pending'`
 * satırları `requestedBy`'a göre `incoming`/`outgoing`'e ayrılır — istek
 * kime AİT olduğu her zaman `requestedBy` alanından okunur, koltuk/sıra gibi
 * başka bir alandan türetilmez.
 */
export async function getFriendsView(userId: string): Promise<FriendsView> {
  const rows = await Friendship.find({ $or: [{ userA: userId }, { userB: userId }] }).lean()

  const friendIds: string[] = []
  const incomingIds: string[] = []
  const outgoingIds: string[] = []

  for (const row of rows) {
    const otherId = row.userA === userId ? row.userB : row.userA
    if (row.status === 'accepted') {
      friendIds.push(otherId)
    } else if (row.requestedBy === userId) {
      outgoingIds.push(otherId)
    } else {
      incomingIds.push(otherId)
    }
  }

  const allIds = [...friendIds, ...incomingIds, ...outgoingIds]
  const users = await User.find({ _id: { $in: allIds } }, 'name elo').lean()
  const byId = new Map<string, FriendEntry>(
    users.map((user) => [user._id, { userId: user._id, name: user.name, elo: user.elo }]),
  )

  return {
    friends: toEntries(friendIds, byId),
    incoming: toEntries(incomingIds, byId),
    outgoing: toEntries(outgoingIds, byId),
  }
}
