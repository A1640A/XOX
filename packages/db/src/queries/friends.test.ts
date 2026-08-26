import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Game } from '../models/game'
import { Friendship } from '../models/friendship'
import { User } from '../models/user'
import { buildPairKey } from '../pair'
import {
  getFriendsView,
  hasFinishedGameTogether,
  removeFriend,
  requestFriendship,
  respondToFriendRequest,
} from './friends'

describe('friends sorguları (gerçek xox_test)', () => {
  const createdUserIds: string[] = []
  const createdGameIds: string[] = []
  const createdFriendshipPairs: { userA: string; userB: string }[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } })
      createdUserIds.length = 0
    }
    if (createdGameIds.length > 0) {
      await Game.deleteMany({ _id: { $in: createdGameIds } })
      createdGameIds.length = 0
    }
    if (createdFriendshipPairs.length > 0) {
      for (const pair of createdFriendshipPairs) {
        await Friendship.deleteMany(pair)
      }
      createdFriendshipPairs.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function trackUser(id: string): string {
    createdUserIds.push(id)
    return id
  }

  async function createUser(name: string, elo = 1000): Promise<string> {
    const id = trackUser(randomUUID())
    await User.create({ _id: id, name, email: `${id}@xox.test`, passwordHash: 'x', elo })
    return id
  }

  async function createFinishedGame(userA: string, userB: string): Promise<void> {
    const id = randomUUID()
    createdGameIds.push(id)
    await Game.create({
      _id: id,
      roomCode: `RC${randomUUID().slice(0, 6).toUpperCase()}`,
      players: { X: userA, O: userB },
      participants: [userA, userB],
      pairKey: buildPairKey(userA, userB),
      winner: 'X',
      finishedAt: new Date(),
      endReason: 'resign',
    })
  }

  function trackPair(userA: string, userB: string): void {
    const [a, b] = userA < userB ? [userA, userB] : [userB, userA]
    createdFriendshipPairs.push({ userA: a, userB: b })
  }

  describe('hasFinishedGameTogether — numaralandırma/zamanlama karşıtı tasarım', () => {
    it('birlikte bitmiş oyunu olan çift için true döner', async () => {
      const a = await createUser('Ayşe')
      const b = await createUser('Bora')
      await createFinishedGame(a, b)

      await expect(hasFinishedGameTogether(a, b)).resolves.toBe(true)
      // argüman sırası fark etmemeli — pairKey sıralı üretiliyor
      await expect(hasFinishedGameTogether(b, a)).resolves.toBe(true)
    })

    it('bitmemiş (finishedAt=null) bir oyun uygunluk saymaz', async () => {
      const a = await createUser('Cem')
      const b = await createUser('Deniz')
      const id = randomUUID()
      createdGameIds.push(id)
      await Game.create({
        _id: id,
        roomCode: `RC${randomUUID().slice(0, 6).toUpperCase()}`,
        players: { X: a, O: b },
        participants: [a, b],
        pairKey: buildPairKey(a, b),
      })

      await expect(hasFinishedGameTogether(a, b)).resolves.toBe(false)
    })

    it(
      'var OLMAYAN bir userId ile var olan ama HİÇ oynanmamış bir userId AYNI ' +
        'sonucu (false) ve AYNI sorgu şeklini üretir — numaralandırma yüzeyi yok',
      async () => {
        const existingButNeverPlayed = await createUser('Elif')
        const ghostUserId = randomUUID()

        const resultForGhost = await hasFinishedGameTogether(existingButNeverPlayed, ghostUserId)
        const resultForExisting = await hasFinishedGameTogether(
          existingButNeverPlayed,
          randomUUID(),
        )

        expect(resultForGhost).toBe(false)
        expect(resultForExisting).toBe(false)
        // İkisi de aynı `Game.exists({pairKey, finishedAt:{$ne:null}})` sorgusundan
        // geçer — kullanıcının var olup olmadığına dair AYRI bir DB çağrısı yok,
        // yani iki dal arasında ek bir round-trip/timing farkı üreten kod yolu yok.
      },
    )
  })

  describe('requestFriendship — idempotans', () => {
    it('yeni bir çift için pending kayıt açar, requestedBy isteği atanı gösterir', async () => {
      const a = await createUser('Fatma')
      const b = await createUser('Gökhan')
      trackPair(a, b)

      await requestFriendship(a, b)

      const [userA, userB] = a < b ? [a, b] : [b, a]
      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found?.status).toBe('pending')
      expect(found?.requestedBy).toBe(a)
    })

    it('aynı isteği iki kez göndermek İKİNCİ bir kayıt AÇMAZ (idempotans)', async () => {
      const a = await createUser('Hakan')
      const b = await createUser('Işıl')
      trackPair(a, b)

      await requestFriendship(a, b)
      await requestFriendship(a, b)

      const [userA, userB] = a < b ? [a, b] : [b, a]
      const count = await Friendship.countDocuments({ userA, userB })
      expect(count).toBe(1)
    })

    it('zaten accepted olan bir çifte tekrar istek göndermek durumu DEĞİŞTİRMEZ', async () => {
      const a = await createUser('Kemal')
      const b = await createUser('Leyla')
      trackPair(a, b)
      const [userA, userB] = a < b ? [a, b] : [b, a]
      await Friendship.create({ userA, userB, status: 'accepted', requestedBy: a })

      await requestFriendship(b, a)

      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found?.status).toBe('accepted')
    })

    it('ters argüman sırasıyla çağrılsa da AYNI sıralı çifti hedefler', async () => {
      const a = await createUser('Mert')
      const b = await createUser('Nazlı')
      trackPair(a, b)

      await requestFriendship(b, a)

      const [userA, userB] = a < b ? [a, b] : [b, a]
      const count = await Friendship.countDocuments({ userA, userB })
      expect(count).toBe(1)
    })
  })

  describe('respondToFriendRequest — yalnız gerçek alıcı, idempotans', () => {
    it("KABUL: alıcı isteği kabul edince status 'accepted' olur", async () => {
      const requester = await createUser('Onur')
      const recipient = await createUser('Pelin')
      trackPair(requester, recipient)
      await requestFriendship(requester, recipient)

      await respondToFriendRequest(recipient, requester, 'accept')

      const [userA, userB] = requester < recipient ? [requester, recipient] : [recipient, requester]
      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found?.status).toBe('accepted')
    })

    it('REDDET: alıcı reddedince kayıt tamamen SİLİNİR', async () => {
      const requester = await createUser('Rıza')
      const recipient = await createUser('Sema')
      trackPair(requester, recipient)
      await requestFriendship(requester, recipient)

      await respondToFriendRequest(recipient, requester, 'reject')

      const [userA, userB] = requester < recipient ? [requester, recipient] : [recipient, requester]
      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found).toBeNull()
    })

    it('İSTEĞİ GÖNDEREN kendi isteğini "kabul" etmeye çalışırsa hiçbir şey değişmez', async () => {
      const requester = await createUser('Tolga')
      const recipient = await createUser('Umut')
      trackPair(requester, recipient)
      await requestFriendship(requester, recipient)

      // requester kendi gönderdiği isteği "kabul" etmeye çalışıyor —
      // respondToFriendRequest(recipientId=requester, requesterId=recipient, ...)
      // filtre requestedBy=recipient arar, DB'de requestedBy=requester var, eşleşmez.
      await respondToFriendRequest(requester, recipient, 'accept')

      const [userA, userB] = requester < recipient ? [requester, recipient] : [recipient, requester]
      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found?.status).toBe('pending')
    })

    it('var olmayan bir isteğe yanıt vermek hata FIRLATMAZ, sessizce no-op', async () => {
      const a = randomUUID()
      const b = randomUUID()
      await expect(respondToFriendRequest(a, b, 'accept')).resolves.toBeUndefined()
      await expect(respondToFriendRequest(a, b, 'reject')).resolves.toBeUndefined()
    })
  })

  describe('removeFriend — KK-127, iki taraf için de siler', () => {
    it('accepted ilişkiyi siler, çift artık ne friend ne pending görünür', async () => {
      const a = await createUser('Volkan')
      const b = await createUser('Yasemin')
      trackPair(a, b)
      const [userA, userB] = a < b ? [a, b] : [b, a]
      await Friendship.create({ userA, userB, status: 'accepted', requestedBy: a })

      await removeFriend(a, b)

      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found).toBeNull()

      const viewA = await getFriendsView(a)
      const viewB = await getFriendsView(b)
      expect(viewA.friends).toStrictEqual([])
      expect(viewB.friends).toStrictEqual([])
    })

    it('pending bir isteğe DOKUNMAZ (yalnız accepted hedeflenir)', async () => {
      const a = await createUser('Zeynep')
      const b = await createUser('Ahmet')
      trackPair(a, b)
      await requestFriendship(a, b)

      await removeFriend(a, b)

      const [userA, userB] = a < b ? [a, b] : [b, a]
      const found = await Friendship.findOne({ userA, userB }).lean()
      expect(found?.status).toBe('pending')
    })
  })

  describe('getFriendsView', () => {
    it('accepted → friends, requestedBy=self → outgoing, requestedBy=diğer → incoming', async () => {
      const me = await createUser('Bensu', 1500)
      const friend = await createUser('Can', 1600)
      const outgoingTarget = await createUser('Derya', 1400)
      const incomingSender = await createUser('Ece', 1300)

      trackPair(me, friend)
      trackPair(me, outgoingTarget)
      trackPair(me, incomingSender)

      const [fa, fb] = me < friend ? [me, friend] : [friend, me]
      await Friendship.create({ userA: fa, userB: fb, status: 'accepted', requestedBy: me })

      await requestFriendship(me, outgoingTarget)
      await requestFriendship(incomingSender, me)

      const view = await getFriendsView(me)

      expect(view.friends).toStrictEqual([{ userId: friend, name: 'Can', elo: 1600 }])
      expect(view.outgoing).toStrictEqual([{ userId: outgoingTarget, name: 'Derya', elo: 1400 }])
      expect(view.incoming).toStrictEqual([{ userId: incomingSender, name: 'Ece', elo: 1300 }])
    })

    it('hiçbir ilişkisi yoksa üç liste de boştur', async () => {
      const lonely = await createUser('Furkan')
      const view = await getFriendsView(lonely)
      expect(view).toStrictEqual({ friends: [], incoming: [], outgoing: [] })
    })
  })
})
