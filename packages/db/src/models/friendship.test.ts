import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Friendship } from './friendship'

describe('Friendship modeli', () => {
  const createdPairs: { userA: string; userB: string }[] = []

  beforeAll(async () => {
    await connectDb()
    await Friendship.syncIndexes()
  })

  afterEach(async () => {
    for (const pair of createdPairs) {
      await Friendship.deleteMany(pair)
    }
    createdPairs.length = 0
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function sortedPair(): [string, string] {
    const a = randomUUID()
    const b = randomUUID()
    return a < b ? [a, b] : [b, a]
  }

  it('userA < userB ise status=pending varsayılanıyla oluşur', async () => {
    const [userA, userB] = sortedPair()
    createdPairs.push({ userA, userB })
    await Friendship.create({ userA, userB, requestedBy: userA })

    const found = await Friendship.findOne({ userA, userB }).lean()
    expect(found?.status).toBe('pending')
    expect(found?.requestedBy).toBe(userA)
  })

  it('userA >= userB ise reddedilir (sıralı çift değişmezi)', async () => {
    const [small, big] = sortedPair()
    // Bilerek ters sırada: userA büyük, userB küçük.
    await expect(Friendship.create({ userA: big, userB: small, requestedBy: big })).rejects.toThrow(
      /küçük olmalıdır/,
    )
  })

  it('aynı (userA,userB) çifti benzersizdir — ikinci yazma E11000 ile reddedilir', async () => {
    const [userA, userB] = sortedPair()
    createdPairs.push({ userA, userB })
    await Friendship.create({ userA, userB, requestedBy: userA })

    await expect(Friendship.create({ userA, userB, requestedBy: userB })).rejects.toMatchObject({
      code: 11000,
    })
  })

  it('status=accepted olarak da oluşturulabilir', async () => {
    const [userA, userB] = sortedPair()
    createdPairs.push({ userA, userB })
    await Friendship.create({ userA, userB, requestedBy: userA, status: 'accepted' })

    const found = await Friendship.findOne({ userA, userB }).lean()
    expect(found?.status).toBe('accepted')
  })
})
