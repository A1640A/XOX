import { randomUUID } from 'node:crypto'
import { MOVE_TIMEOUT_SECONDS } from '@xox/shared'
import type { Cell, SeatOccupant } from '@xox/shared'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import { generateRoomCode } from '../room-code'
import { applyMove } from './apply-move'

/**
 * `game-core` GERÇEK kural motorudur — bu dosyada MOCK'LANMAZ (gotcha:
 * "bağımlılığını tamamen mock'larsan testin rotayı değil kendi mock'unu
 * doğrular"). Yalnız `Room.findOne` bir kez, tek bir eşzamanlılık sondası
 * için (KK-045) casus'lanır — o test dışında hiçbir mock yoktur.
 */
describe('applyMove', () => {
  const createdCodes: string[] = []
  const xUser: SeatOccupant = { userId: randomUUID(), name: 'X Oyuncu' }
  const oUser: SeatOccupant = { userId: randomUUID(), name: 'O Oyuncu' }

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

  async function makePlayingRoom(
    options: { board?: Cell[]; version?: number; size?: number; winLength?: number } = {},
  ): Promise<string> {
    const code = freshCode()
    const cellCount = options.size !== undefined ? options.size * options.size : 9
    await Room.create({
      code,
      state: 'playing',
      size: options.size,
      winLength: options.winLength,
      seats: { X: xUser, O: oUser },
      presence: {
        X: { connId: 'x-conn', since: new Date() },
        O: { connId: 'o-conn', since: new Date() },
      },
      board: options.board ?? Array.from({ length: cellCount }, () => null),
      version: options.version ?? 2,
      startedAt: new Date(),
    })
    return code
  }

  it('boş tahtada X ilk hamleyi oynar: board güncellenir, version+1, moved olayı', async () => {
    const code = await makePlayingRoom({ version: 2 })

    const result = await applyMove(code, xUser.userId, 4)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.board[4]).toBe('X')
    expect(result.room.version).toBe(3)
    expect(result.room.moves).toHaveLength(1)
    expect(result.room.moves[0]).toMatchObject({ index: 4, by: 'X' })
    expect(result.events).toEqual([{ kind: 'moved', index: 4, by: 'X' }])
  })

  it('ROOM_NOT_FOUND: olmayan oda kodu', async () => {
    const result = await applyMove('ZZZZZZ', xUser.userId, 0)
    expect(result).toEqual({ ok: false, code: 'ROOM_NOT_FOUND' })
  })

  it('ROOM_FULL: odada koltuğu olmayan bir userId hamle gönderirse', async () => {
    const code = await makePlayingRoom()
    const result = await applyMove(code, randomUUID(), 0)
    expect(result).toEqual({ ok: false, code: 'ROOM_FULL' })
  })

  it("game-over: oda 'finished' durumundaysa hamle reddedilir", async () => {
    const code = freshCode()
    await Room.create({
      code,
      state: 'finished',
      seats: { X: xUser, O: oUser },
      board: Array.from({ length: 9 }, () => null),
      version: 5,
    })
    const result = await applyMove(code, xUser.userId, 0)
    expect(result).toEqual({ ok: false, code: 'game-over' })
  })

  it('not-your-turn (KK-042/044): sıra X-teyken O hamle gönderirse reddedilir ve version ARTMAZ', async () => {
    const code = await makePlayingRoom({ version: 7 })
    const result = await applyMove(code, oUser.userId, 0)
    expect(result).toEqual({ ok: false, code: 'not-your-turn' })

    const after = await Room.findOne({ code }).lean()
    expect(after?.version).toBe(7)
    expect(after?.moves).toHaveLength(0)
  })

  it('occupied: dolu bir hücreye oynanırsa reddedilir ve version ARTMAZ', async () => {
    // 2 taş yerleşmiş (X:0, O:1) -> sıra X'te (çift taş sayısı).
    const board: Cell[] = ['X', 'O', null, null, null, null, null, null, null]
    const code = await makePlayingRoom({ board, version: 9 })

    const result = await applyMove(code, xUser.userId, 0)
    expect(result).toEqual({ ok: false, code: 'occupied' })

    const after = await Room.findOne({ code }).lean()
    expect(after?.version).toBe(9)
  })

  it('out-of-range: 0..8 dışındaki bir indeks reddedilir ve version ARTMAZ', async () => {
    const code = await makePlayingRoom({ version: 11 })
    const result = await applyMove(code, xUser.userId, 42)
    expect(result).toEqual({ ok: false, code: 'out-of-range' })

    const after = await Room.findOne({ code }).lean()
    expect(after?.version).toBe(11)
  })

  it("kazanan çizgi tamamlanınca state 'finished' olur ve game:over benzeri olay üretilir (KK-050/051)", async () => {
    // X: 0,1 dolu; O: 3,4 dolu. Sıra X'te (4 taş, çift). X 2'ye oynarsa 0-1-2 çizgisi.
    const board: Cell[] = ['X', 'X', null, 'O', 'O', null, null, null, null]
    const code = await makePlayingRoom({ board, version: 13 })

    const result = await applyMove(code, xUser.userId, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.state).toBe('finished')
    expect(result.events).toEqual([
      { kind: 'moved', index: 2, by: 'X' },
      { kind: 'finished', status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' } },
    ])
  })

  it('berabere biten hamlede status draw olur', async () => {
    // Son hücre (8) boş, kimse kazanmadan dolduruluyor. 8 taş yerleşmiş (çift) -> sıra X'te.
    const board: Cell[] = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null]
    const code = await makePlayingRoom({ board, version: 17 })

    const result = await applyMove(code, xUser.userId, 8)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
    expect(result.room.state).toBe('finished')
    expect(result.events).toEqual([
      { kind: 'moved', index: 8, by: 'X' },
      { kind: 'finished', status: { kind: 'draw' } },
    ])
  })

  it(
    'eşzamanlılık sondası (KK-045): applyMove çağrısı arasına elle version+1 enjekte ' +
      'edilince ikinci yazma 0 doküman günceller ve reddedilir',
    async () => {
      const code = await makePlayingRoom({ version: 21 })
      const before = await Room.findOne({ code }).lean()

      const originalFindOne = Room.findOne.bind(Room)
      function injectingFindOne(filter?: Record<string, unknown>): ReturnType<typeof Room.findOne> {
        const query = originalFindOne(filter)
        const originalLean = query.lean.bind(query)
        // @ts-expect-error — test-only enjeksiyon: applyMove'un OKUMASI ile
        // YAZMASI arasına gerçek bir version artışı sokulur (mongoose Query
        // tipi bu ara katmanı ifade etmiyor, kasıtlı daraltma).
        query.lean = async () => {
          const doc = await originalLean()
          // "elle enjekte edilen" version artışı — başka bir yazma olmuş gibi.
          await Room.updateOne({ code }, { $inc: { version: 1 } })
          return doc
        }
        return query
      }
      const spy = vi
        .spyOn(Room, 'findOne')
        .mockImplementationOnce(injectingFindOne as unknown as typeof Room.findOne)

      const result = await applyMove(code, xUser.userId, 0)
      spy.mockRestore()

      expect(result).toEqual({ ok: false, code: 'not-your-turn' })

      const after = await Room.findOne({ code }).lean()
      // Yalnız enjekte edilen +1 uygulandı; applyMove'un REDDEDİLEN yazması
      // version'ı AYRICA artırmadı (AC8/AC9).
      expect(after?.version).toBe((before?.version ?? 0) + 1)
    },
  )

  describe('AS-08 / W2-01: hamle süresi saati', () => {
    /**
     * Sahte saat — `Date.now()` BEKLENMEZ. Çıplak sayı bilerek: beklentiyi
     * `Date.now()`tan türetmek testi duvar saatine bağlar ve CI'da kararsız
     * yapar; `MOVE_TIMEOUT_SECONDS`i beklentinin İÇİNDE kullanmak ise sabit
     * yanlış değişirse testi de birlikte götürür. Bu yüzden beklenen an
     * ELLE yazılmış (60 sn = 60_000 ms sonrası).
     */
    const NOW = 1_767_225_600_000

    it('süren oyunda turnDeadline now + 60 sn olarak yazılır (saat ENJEKTE edilir)', async () => {
      const code = await makePlayingRoom({ version: 2 })

      const result = await applyMove(code, xUser.userId, 4, NOW)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      expect(result.room.turnDeadline?.getTime()).toBe(NOW + 60_000)
    })

    it('sabitten türetilmiş kontrol: yazılan an MOVE_TIMEOUT_SECONDS ile birebir örtüşür', async () => {
      const code = await makePlayingRoom({ version: 2 })

      const result = await applyMove(code, xUser.userId, 4, NOW)

      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      expect(result.room.turnDeadline?.getTime()).toBe(NOW + MOVE_TIMEOUT_SECONDS * 1000)
    })

    it('NÖTR OLMAYAN ikinci an: farklı bir `now` farklı bir deadline yazar', async () => {
      const code = await makePlayingRoom({ version: 2 })

      const result = await applyMove(code, xUser.userId, 4, NOW + 123_456)

      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      expect(result.room.turnDeadline?.getTime()).toBe(NOW + 123_456 + 60_000)
    })

    it('oyun BİTİNCE turnDeadline null`a döner (kazanılan hamle)', async () => {
      const code = await makePlayingRoom({
        board: ['X', 'X', null, 'O', 'O', null, null, null, null],
        version: 5,
      })

      const result = await applyMove(code, xUser.userId, 2, NOW)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      expect(result.room.state).toBe('finished')
      expect(result.room.turnDeadline).toBeNull()
    })

    it('`now` verilmezse duvar saatine düşer — üretim yolu da saati yazar', async () => {
      const code = await makePlayingRoom({ version: 2 })
      const before = Date.now()

      const result = await applyMove(code, xUser.userId, 4)

      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      const written = result.room.turnDeadline?.getTime() ?? 0
      expect(written).toBeGreaterThanOrEqual(before + 60_000)
      expect(written).toBeLessThanOrEqual(Date.now() + 60_000)
    })
  })

  describe('DB-BOARD-001: odanın KENDİ konfigürasyonu — 3×3 sabit değil', () => {
    it('11×11 odada 120 geçerli bir indekstir (3×3 sınırıyla out-of-range SAYILMAZ)', async () => {
      const code = await makePlayingRoom({ size: 11, winLength: 5, version: 4 })

      const result = await applyMove(code, xUser.userId, 120)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      expect(result.room.board[120]).toBe('X')
      expect(result.room.board).toHaveLength(121)
      expect(result.room.version).toBe(5)
    })

    it('11×11 odada 121 (cellCount dışı) out-of-range reddedilir', async () => {
      const code = await makePlayingRoom({ size: 11, winLength: 5, version: 4 })

      const result = await applyMove(code, xUser.userId, 121)

      expect(result).toEqual({ ok: false, code: 'out-of-range' })
    })

    it('resolveBoardConfig üzerinden okunan config ile hamle sonrası tahta hâlâ 121 hücre', async () => {
      const code = await makePlayingRoom({ size: 11, winLength: 5, version: 4 })

      const result = await applyMove(code, xUser.userId, 0)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('beklenmeyen red: ' + result.code)
      expect(result.room.board).toHaveLength(121)
      expect(result.room.size).toBe(11)
      expect(result.room.winLength).toBe(5)
    })
  })
})
