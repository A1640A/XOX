import { randomUUID } from 'node:crypto'
import type { SeatOccupant } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import * as roomCodeModule from '../room-code'
import { createRoom } from './create'

/**
 * `generateRoomCode`'u gerçek üretecin ÜZERİNE gelen bir casus fonksiyonla
 * sarar — `game-core`/kural mantığı MOCK'LANMAZ, yalnız çakışma senaryosunu
 * (E11000) deterministik kurmak için hangi kodun üretileceği kontrol edilir.
 */
vi.mock('../room-code', async (importOriginal) => {
  const actual = await importOriginal<typeof roomCodeModule>()
  return { ...actual, generateRoomCode: vi.fn(actual.generateRoomCode) }
})

const COLLIDING_CODE = 'ABCDEF'

describe('createRoom', () => {
  const createdCodes: string[] = []
  let actualGenerateRoomCode: typeof roomCodeModule.generateRoomCode

  function owner(): SeatOccupant {
    return { userId: randomUUID(), name: 'Kurucu' }
  }

  beforeAll(async () => {
    await connectDb()
    actualGenerateRoomCode = (await vi.importActual<typeof roomCodeModule>('../room-code'))
      .generateRoomCode
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      await Room.deleteMany({ code: { $in: createdCodes } })
      createdCodes.length = 0
    }
    vi.mocked(roomCodeModule.generateRoomCode).mockReset()
    vi.mocked(roomCodeModule.generateRoomCode).mockImplementation(actualGenerateRoomCode)
  })

  afterAll(async () => {
    await disconnectDb()
    vi.restoreAllMocks()
  })

  it('waiting durumunda X koltuklu, version=1, board boş, moves boş bir oda oluşturur', async () => {
    const seatOwner = owner()
    const result = await createRoom(seatOwner)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    createdCodes.push(result.room.code)

    expect(result.room.state).toBe('waiting')
    expect(result.room.seats.X).toMatchObject({ userId: seatOwner.userId, name: seatOwner.name })
    expect(result.room.seats.O).toBeNull()
    expect(result.room.version).toBe(1)
    expect(result.room.board).toStrictEqual(Array.from({ length: 9 }, () => null))
    expect(result.room.moves).toStrictEqual([])
    expect(result.events).toEqual([{ kind: 'created' }])
  })

  it('kod çakışmasında (E11000) yeniden dener ve nihayetinde başarılı olur (KK-035/036)', async () => {
    await Room.create({ code: COLLIDING_CODE, version: 1 })
    createdCodes.push(COLLIDING_CODE)

    vi.mocked(roomCodeModule.generateRoomCode).mockReturnValueOnce(COLLIDING_CODE)

    const result = await createRoom(owner())
    expect(result.ok).toBe(true)
    if (result.ok) createdCodes.push(result.room.code)
    expect(roomCodeModule.generateRoomCode).toHaveBeenCalledTimes(2)
  })

  it('ROOM_CREATE_MAX_ATTEMPTS (5) kez çakışırsa CODE_GENERATION_FAILED döner ve istisna FIRLATMAZ', async () => {
    await Room.create({ code: COLLIDING_CODE, version: 1 })
    createdCodes.push(COLLIDING_CODE)

    vi.mocked(roomCodeModule.generateRoomCode).mockReturnValue(COLLIDING_CODE)

    const result = await createRoom(owner())
    expect(result).toEqual({ ok: false, code: 'CODE_GENERATION_FAILED' })
    expect(roomCodeModule.generateRoomCode).toHaveBeenCalledTimes(5)
  })
})
