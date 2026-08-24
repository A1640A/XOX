import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { MobileRefreshToken } from './mobile-refresh-token'

describe('MobileRefreshToken modeli', () => {
  const createdJtis: string[] = []

  beforeAll(async () => {
    await connectDb()
    await MobileRefreshToken.syncIndexes()
  })

  afterEach(async () => {
    if (createdJtis.length > 0) {
      await MobileRefreshToken.deleteMany({ jti: { $in: createdJtis } })
      createdJtis.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function track(jti: string): string {
    createdJtis.push(jti)
    return jti
  }

  it('jti/userId/expiresAt ile oluşur', async () => {
    const jti = track(randomUUID())
    const expiresAt = new Date(Date.now() + 1000 * 60)
    await MobileRefreshToken.create({ jti, userId: 'u1', expiresAt })

    const found = await MobileRefreshToken.findOne({ jti }).lean()
    expect(found?.userId).toBe('u1')
    expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime())
  })

  it('jti benzersizdir — ikinci yazma E11000 ile reddedilir', async () => {
    const jti = track(randomUUID())
    const expiresAt = new Date(Date.now() + 1000 * 60)
    await MobileRefreshToken.create({ jti, userId: 'u1', expiresAt })

    await expect(MobileRefreshToken.create({ jti, userId: 'u2', expiresAt })).rejects.toMatchObject(
      { code: 11000 },
    )
  })
})
