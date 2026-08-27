import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { WsTicket } from './ws-ticket'

describe('WsTicket modeli', () => {
  const createdJtis: string[] = []

  beforeAll(async () => {
    await connectDb()
    await WsTicket.syncIndexes()
  })

  afterEach(async () => {
    if (createdJtis.length > 0) {
      await WsTicket.deleteMany({ jti: { $in: createdJtis } })
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

  it('jti/userId/room/expiresAt ile oluşur ve usedAt varsayılan olarak null gelir', async () => {
    const jti = track(randomUUID())
    const expiresAt = new Date(Date.now() + 1000 * 30)
    await WsTicket.create({ jti, userId: 'u1', room: 'ABC234', expiresAt })

    const found = await WsTicket.findOne({ jti }).lean()
    expect(found?.userId).toBe('u1')
    expect(found?.room).toBe('ABC234')
    expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime())
    expect(found?.usedAt).toBeNull()
  })

  it('jti benzersizdir — ikinci yazma E11000 ile reddedilir', async () => {
    const jti = track(randomUUID())
    const expiresAt = new Date(Date.now() + 1000 * 30)
    await WsTicket.create({ jti, userId: 'u1', room: 'ABC234', expiresAt })

    await expect(
      WsTicket.create({ jti, userId: 'u2', room: 'XYZ789', expiresAt }),
    ).rejects.toMatchObject({ code: 11000 })
  })
})
