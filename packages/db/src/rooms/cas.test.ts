import { emptyBoard } from '@xox/game-core'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import { generateRoomCode } from '../room-code'
import { casUpdateRoom } from './cas'

/**
 * ADR-0014 §3 — `casUpdateRoom`'un tipli `board` kanalı GERÇEK Atlas'a karşı
 * doğrulanır (`game-core`/mongoose MOCK'LANMAZ, bu repodaki disiplinle aynı).
 */
describe('casUpdateRoom · board kanalı (ADR-0014 §3)', () => {
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

  function freshCode(): string {
    const code = generateRoomCode()
    createdCodes.push(code)
    return code
  }

  it("`set` içinde 'board' anahtarı YASAK — çalışma zamanı guard FIRLATIR", async () => {
    const code = freshCode()
    await expect(
      casUpdateRoom({
        code,
        expectedVersion: 1,
        set: { board: [null, null, null] },
      }),
    ).rejects.toThrow(/set\.board/)
  })

  it(
    "KK-B35 SONDASI: size:11 odaya 9 hücreli (3×3'lük) bir tahta yazmayı DENEYEN " +
      'bir çağrı YAZMA YAPILMADAN reddedilir (`null` döner, version/board DEĞİŞMEZ)',
    async () => {
      const code = freshCode()
      const board11 = [...emptyBoard({ size: 11, winLength: 5 })]
      await Room.create({
        code,
        state: 'playing',
        size: 11,
        winLength: 5,
        board: board11,
        version: 3,
      })

      const mismatched = [...emptyBoard({ size: 3, winLength: 3 })] // 9 hücre
      const result = await casUpdateRoom({
        code,
        expectedVersion: 3,
        board: { cells: mismatched, config: { size: 11, winLength: 5 } },
      })

      expect(result).toBeNull()

      const after = await Room.findOne({ code }).lean()
      expect(after?.version).toBe(3) // ARTMADI — yazma hiç yapılmadı.
      expect(after?.board).toHaveLength(121) // ESKİ tahta bit düzeyinde korundu.
    },
  )

  it('doğru uzunluktaki tahta kabul edilir, yazılır ve version+1 olur', async () => {
    const code = freshCode()
    await Room.create({
      code,
      state: 'playing',
      size: 3,
      winLength: 3,
      board: [...emptyBoard({ size: 3, winLength: 3 })],
      version: 5,
    })

    const nextBoard = ['X', null, null, null, null, null, null, null, null] as const
    const result = await casUpdateRoom({
      code,
      expectedVersion: 5,
      board: { cells: [...nextBoard], config: { size: 3, winLength: 3 } },
    })

    expect(result).not.toBeNull()
    expect(result?.version).toBe(6)
    expect(result?.board).toStrictEqual([...nextBoard])
  })
})
