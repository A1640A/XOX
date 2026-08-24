import { randomUUID } from 'node:crypto'
import type { SeatOccupant } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import { generateRoomCode } from '../room-code'
import { detachConnection } from './detach'

describe('detachConnection', () => {
  const createdCodes: string[] = []

  function seat(): SeatOccupant {
    return { userId: randomUUID(), name: 'Oyuncu' }
  }

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

  it('olmayan oda için hiçbir şey yapmadan döner (istisna fırlatmaz)', async () => {
    await expect(detachConnection('ZZZZZZ', 'X', 'conn-1')).resolves.toBeUndefined()
  })

  it(
    'İKİ YÖNLÜ #1 — hâlâ AKTİF bağlantı: presence temizlenir, playing durumunda ' +
      'disconnected damgalanır, version+1',
    async () => {
      const code = freshCode()
      const x = seat()
      const o = seat()
      await Room.create({
        code,
        state: 'playing',
        seats: { X: x, O: o },
        presence: {
          X: { connId: 'x-conn', since: new Date() },
          O: { connId: 'o-conn', since: new Date() },
        },
        version: 8,
      })

      await detachConnection(code, 'O', 'o-conn')

      const after = await Room.findOne({ code }).lean()
      expect(after?.presence.O).toBeNull()
      expect(after?.disconnected).toMatchObject({ seat: 'O' })
      expect(after?.disconnected?.graceEndsAt.getTime()).toBeGreaterThan(Date.now())
      expect(after?.version).toBe(9)
      // Rakibin koltuğuna dokunulmadı.
      expect(after?.presence.X).toMatchObject({ connId: 'x-conn' })
    },
  )

  it(
    'İKİ YÖNLÜ #2 — DEVREDİLMİŞ (takeover edilmiş) eski bağlantı: HİÇBİR ŞEY ' +
      'yazılmaz — presence, disconnected, version aynı kalır (AC6)',
    async () => {
      const code = freshCode()
      const x = seat()
      const o = seat()
      await Room.create({
        code,
        state: 'playing',
        seats: { X: x, O: o },
        // O koltuğu ZATEN yeni bir bağlantıya devredilmiş (takeover olmuş).
        presence: {
          X: { connId: 'x-conn', since: new Date() },
          O: { connId: 'o-conn-YENI', since: new Date() },
        },
        version: 10,
      })

      // Eski (devredilmiş) bağlantı kapanıyor — connId artık yazılı DEĞİL.
      await detachConnection(code, 'O', 'o-conn-ESKI')

      const after = await Room.findOne({ code }).lean()
      expect(after?.presence.O).toMatchObject({ connId: 'o-conn-YENI' })
      expect(after?.disconnected).toBeNull()
      expect(after?.version).toBe(10)
    },
  )

  it('waiting durumunda kurucu ayrılırsa presence temizlenir ama disconnected YAZILMAZ (§3.10)', async () => {
    const code = freshCode()
    const x = seat()
    await Room.create({
      code,
      state: 'waiting',
      seats: { X: x, O: null },
      presence: { X: { connId: 'x-conn', since: new Date() }, O: null },
      version: 1,
    })

    await detachConnection(code, 'X', 'x-conn')

    const after = await Room.findOne({ code }).lean()
    expect(after?.presence.X).toBeNull()
    expect(after?.disconnected).toBeNull()
    expect(after?.state).toBe('waiting')
    expect(after?.version).toBe(2)
  })

  it('presence zaten null ise (önceden ayrılmış) hiçbir şey yazmaz', async () => {
    const code = freshCode()
    const x = seat()
    await Room.create({
      code,
      state: 'waiting',
      seats: { X: x, O: null },
      presence: { X: null, O: null },
      version: 3,
    })

    await detachConnection(code, 'X', 'herhangi-bir-conn')

    const after = await Room.findOne({ code }).lean()
    expect(after?.version).toBe(3)
  })
})
