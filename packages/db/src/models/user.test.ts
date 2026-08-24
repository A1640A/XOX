import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { User } from './user'

describe('User modeli', () => {
  const createdIds: string[] = []

  beforeAll(async () => {
    await connectDb()
    await User.syncIndexes()
  })

  afterEach(async () => {
    if (createdIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdIds } })
      createdIds.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function track(id: string): string {
    createdIds.push(id)
    return id
  }

  it('elo=1200, stats sıfır, ratedGames=0, theme=acik varsayılanlarıyla oluşur', async () => {
    const id = track(randomUUID())
    await User.create({
      _id: id,
      name: 'Test Kullanıcı',
      email: `${id}@xox.test`,
      passwordHash: 'gizli-ozet',
    })

    const user = await User.findById(id).lean()
    expect(user?.elo).toBe(1200)
    expect(user?.stats).toStrictEqual({ wins: 0, losses: 0, draws: 0 })
    expect(user?.ratedGames).toBe(0)
    expect(user?.theme).toBe('acik')
  })

  it('KK-004: User.findById() çıktısında passwordHash GELMEZ', async () => {
    const id = track(randomUUID())
    await User.create({
      _id: id,
      name: 'Test Kullanıcı',
      email: `${id}@xox.test`,
      passwordHash: 'gizli-ozet',
    })

    const user = await User.findById(id).lean()
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('KK-004: .select("+passwordHash") ile açıkça istenirse VARDIR', async () => {
    const id = track(randomUUID())
    await User.create({
      _id: id,
      name: 'Test Kullanıcı',
      email: `${id}@xox.test`,
      passwordHash: 'gizli-ozet',
    })

    const user = await User.findById(id).select('+passwordHash').lean()
    expect(user?.passwordHash).toBe('gizli-ozet')
  })

  it('email alanı benzersizdir — ikinci yazma E11000 ile reddedilir', async () => {
    const id1 = track(randomUUID())
    const id2 = track(randomUUID())
    const email = `${randomUUID()}@xox.test`
    await User.create({ _id: id1, name: 'A', email, passwordHash: 'x' })

    await expect(
      User.create({ _id: id2, name: 'B', email, passwordHash: 'y' }),
    ).rejects.toMatchObject({ code: 11000 })
  })

  it('KK-004: aggregate() çıktısında passwordHash GELMEZ — select:false yalnız find yolunu kapsamaz', async () => {
    const id = track(randomUUID())
    await User.create({
      _id: id,
      name: 'Test Kullanıcı',
      email: `${id}@xox.test`,
      passwordHash: 'gizli-ozet',
    })

    const [user] = await User.aggregate([{ $match: { _id: id } }])
    expect(user).not.toHaveProperty('passwordHash')
  })

  it('theme yalnızca acik|koyu kabul eder', async () => {
    const id = track(randomUUID())
    await expect(
      User.create({
        _id: id,
        name: 'Test',
        email: `${id}@xox.test`,
        passwordHash: 'x',
        // Kasıtlı geçersiz değer — çalışma zamanı doğrulamasını test eder.
        theme: 'mavi' as never,
      }),
    ).rejects.toThrow()
  })
})
