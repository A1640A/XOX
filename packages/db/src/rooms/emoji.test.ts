import { EMOJI_PALETTE } from '@xox/shared'
import type { Emoji } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'
import { generateRoomCode } from '../room-code'
import { pushEmoji } from './emoji'

const createdCodes: string[] = []

/**
 * `version` beklentisi ÇIPLAK yazılır (30) ve okunan değerle de ayrıca
 * karşılaştırılır: `room.version` üzerinden türetilmiş bir beklenti,
 * `pushEmoji` bir gün `$inc` eklerse testi de birlikte götürürdü
 * (conventions.md "iki katmanlı test").
 */
const START_VERSION = 30

async function makeRoom(overrides: Partial<RoomDoc> = {}): Promise<string> {
  const code = generateRoomCode()
  createdCodes.push(code)
  await Room.create({
    code,
    state: 'playing',
    seats: { X: { userId: 'u-ada', name: 'Ada' }, O: { userId: 'u-kaan', name: 'Kaan' } },
    presence: {
      X: { connId: 'conn-ada', since: new Date() },
      O: { connId: 'conn-kaan', since: new Date() },
    },
    board: [null, null, null, null, null, null, null, null, null],
    moves: [],
    version: START_VERSION,
    startedAt: new Date(),
    ...overrides,
  })
  return code
}

async function readRoom(code: string): Promise<RoomDoc> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) throw new Error(`oda bulunamadı: ${code}`)
  return room
}

describe('pushEmoji — KK-122…124 (tasarım §5.5 kural 1`in tek istisnası)', () => {
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

  it('olmayan oda ROOM_NOT_FOUND döner (fırlatmaz)', async () => {
    await expect(pushEmoji('ZZZZZZ', 'X', '👋')).resolves.toStrictEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    })
  })

  it('lastEmoji yazılır ama version ARTMAZ', async () => {
    const code = await makeRoom()
    const before = await readRoom(code)

    const result = await pushEmoji(code, 'O', '🔥')

    expect(result.ok).toBe(true)
    const after = await readRoom(code)
    expect(after.lastEmoji).toMatchObject({ from: 'O', emoji: '🔥' })
    expect(after.lastEmoji?.at).toBeInstanceOf(Date)
    // İki katmanlı: hem çıplak sayı hem "hiç değişmedi" iddiası.
    expect(after.version).toBe(START_VERSION)
    expect(after.version).toBe(before.version)
  })

  it('dönen oda dokümanı yazılan emojiyi TAŞIR (çağıran ikinci okuma yapmaz)', async () => {
    const code = await makeRoom()

    const result = await pushEmoji(code, 'X', '👏')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.room.lastEmoji).toMatchObject({ from: 'X', emoji: '👏' })
    expect(result.events).toStrictEqual([{ kind: 'emoji', from: 'X' }])
  })

  it('updatedAt tazelenir — yayın change stream olayına BAĞLI (R1)', async () => {
    const code = await makeRoom()
    const before = await readRoom(code)
    // Mongo `updatedAt`i ms çözünürlükte tutuyor; aynı ms içinde yazarsak
    // "değişti" iddiası yanlışlıkla kırılır.
    await new Promise((resolve) => setTimeout(resolve, 5))

    await pushEmoji(code, 'X', '😂')

    const after = await readRoom(code)
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })

  it('ikinci emoji öncekinin yerine geçer, version yine sabit kalır', async () => {
    const code = await makeRoom()

    await pushEmoji(code, 'X', '👋')
    await pushEmoji(code, 'O', '😮')

    const after = await readRoom(code)
    expect(after.lastEmoji).toMatchObject({ from: 'O', emoji: '😮' })
    expect(after.version).toBe(START_VERSION)
  })

  it('paletin sekiz üyesinin HEPSİ kabul edilir', async () => {
    const code = await makeRoom()

    for (const emoji of EMOJI_PALETTE) {
      const result = await pushEmoji(code, 'X', emoji)
      expect(result.ok).toBe(true)
    }

    const after = await readRoom(code)
    expect(after.lastEmoji?.emoji).toBe('🤝')
  })

  it('palet DIŞI bir değer yazma katmanında da reddedilir (INVALID_MESSAGE)', async () => {
    const code = await makeRoom()
    // POZİTİF kontrol önce: yazma yolu gerçekten çalışıyor.
    await pushEmoji(code, 'X', '👋')
    expect((await readRoom(code)).lastEmoji?.emoji).toBe('👋')

    // `Emoji` tipi yalnız DERLEME zamanı; mongoose şeması `emoji: String`.
    // Çalışma zamanında paleti zorlayan tek şey BU kapı — ve kapıyı sınamanın
    // tek yolu tipi bilerek yalanlamak. Tek `as` TESTTEDİR, üretim kodunda yok.
    const kotu = '<img src=x onerror=alert(1)>' as Emoji
    const result = await pushEmoji(code, 'O', kotu)

    expect(result).toStrictEqual({ ok: false, code: 'INVALID_MESSAGE' })
    // "Yokluk" iddiasının yanında DOLU bir değer: eski emoji hâlâ orada.
    expect((await readRoom(code)).lastEmoji?.emoji).toBe('👋')
  })
})
