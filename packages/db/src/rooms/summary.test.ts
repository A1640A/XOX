import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import { getRoomSummary } from './summary'

/**
 * `create.test.ts`/`join.test.ts` ile AYNI disiplin: gerçek `connectDb()` ile
 * `xox_test`'e bağlanır (`vitest.setup.ts` `MONGODB_DB`'yi zorlar), mock YOK —
 * bu bir DB katmanı testi, mongoose'un GERÇEK davranışını (özellikle
 * `.select()` projeksiyonunu) kanıtlamalı.
 */
describe('getRoomSummary', () => {
  const createdCodes: string[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      await Room.deleteMany({ code: { $in: createdCodes } })
      createdCodes.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  it('var olan oda için { code, state, seats } döner — koltuk şekli DOLU alanla doğrulanır', async () => {
    const code = `S${randomUUID().slice(0, 5).toUpperCase()}`
    await Room.create({
      code,
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    })
    createdCodes.push(code)

    const summary = await getRoomSummary(code)

    expect(summary).not.toBeNull()
    if (summary === null) throw new Error('beklenmeyen null')
    expect(summary.code).toBe(code)
    expect(summary.state).toBe('waiting')
    expect(summary.seats.O).toBeNull()
  })

  it(
    'PROJEKSİYON SONDASI (DB-003 kabul kriteri 4): koltuk sahibi userId/name kadar derine ' +
      'iner — `.select` yalnızca `code` bırakacak şekilde daraltılırsa `seats` `undefined` ' +
      'olur ve `summary.seats.X.userId` erişimi TypeError fırlatarak bu testi KIRMIZI yapar',
    async () => {
      const code = `S${randomUUID().slice(0, 5).toUpperCase()}`
      await Room.create({
        code,
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Mehmet' } },
      })
      createdCodes.push(code)

      const summary = await getRoomSummary(code)
      if (summary === null) throw new Error('beklenmeyen null')

      expect(summary.seats.X).toStrictEqual({ userId: 'u1', name: 'Ayşe' })
      expect(summary.seats.O).toStrictEqual({ userId: 'u2', name: 'Mehmet' })
    },
  )

  it('projeksiyon DAR — `board`/`moves`/`presence`/`version` gibi seçilmemiş alanlar belgede YOK', async () => {
    const code = `S${randomUUID().slice(0, 5).toUpperCase()}`
    await Room.create({
      code,
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    })
    createdCodes.push(code)

    const summary = await getRoomSummary(code)
    if (summary === null) throw new Error('beklenmeyen null')

    expect(Object.hasOwn(summary, 'board')).toBe(false)
    expect(Object.hasOwn(summary, 'moves')).toBe(false)
    expect(Object.hasOwn(summary, 'presence')).toBe(false)
    expect(Object.hasOwn(summary, 'version')).toBe(false)
  })

  it('var olmayan (ya da TTL ile silinmiş) kod için TransitionResult DEĞİL, çıplak null döner', async () => {
    const summary = await getRoomSummary('YOKYOK')
    expect(summary).toBeNull()
  })
})
