import { randomUUID } from 'node:crypto'
import type { SeatOccupant } from '@xox/shared'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectDb, disconnectDb } from '../client'
import { Room } from '../models/room'
import { generateRoomCode } from '../room-code'
import { detachConnection } from './detach'

/**
 * Okuma ile CAS yazması ARASINA gerçek bir yazma sokmanın deterministik yolu.
 *
 * Mock YOK: `Room.findOneAndUpdate` GERÇEK sorguyu kurar, gerçek Atlas'a
 * gider, gerçek `version` çatışmasını üretir — yalnız **çalıştırma anı**
 * geciktirilip araya bir yazma sokuluyor. `casUpdateRoom` sonucu `await`
 * ettiği için `.lean()`in Query yerine Promise döndürmesi çalışma zamanında
 * farksızdır.
 *
 * (Denenip ELENEN yol: `Room.schema.pre('findOneAndUpdate', …)` — mongoose
 * middleware'i modelin DERLENMESİNDEN önce kayıtlı olmak zorunda; `beforeAll`
 * içinde eklenen hook hiç ateşlenmiyor ve test sessizce "yarış olmadı"yı
 * doğruluyordu.)
 */
let raceBeforeCas: (() => Promise<void>) | null = null

function armRaceInterceptor(): void {
  const real = Room.findOneAndUpdate.bind(Room)
  vi.spyOn(Room, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
    const query = (real as (...a: unknown[]) => { lean: () => unknown })(...args)
    const realLean = query.lean.bind(query)
    query.lean = (): unknown => {
      const race = raceBeforeCas
      return (async (): Promise<unknown> => {
        if (race !== null) await race()
        return await realLean()
      })()
    }
    return query
  }) as unknown as typeof Room.findOneAndUpdate)
}

describe('detachConnection', () => {
  const createdCodes: string[] = []

  function seat(): SeatOccupant {
    return { userId: randomUUID(), name: 'Oyuncu' }
  }

  beforeAll(async () => {
    await connectDb()
  })

  // `restoreMocks: true` her testten sonra casusu geri alır — kurulum
  // `beforeAll`da olsaydı yalnız İLK test yarışı görürdü (sessizce yeşil
  // kalan bir test: "yarış olmadı"yı doğrular).
  beforeEach(() => {
    armRaceInterceptor()
  })

  afterEach(async () => {
    raceBeforeCas = null
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

  it('finished odada presence temizlenir ama disconnected YAZILMAZ (grace anlamsız)', async () => {
    const code = freshCode()
    await Room.create({
      code,
      state: 'finished',
      seats: { X: seat(), O: seat() },
      presence: {
        X: { connId: 'x-conn', since: new Date() },
        O: { connId: 'o-conn', since: new Date() },
      },
      version: 20,
    })

    await detachConnection(code, 'X', 'x-conn')

    const after = await Room.findOne({ code }).lean()
    expect(after?.presence.X).toBeNull()
    expect(after?.disconnected).toBeNull()
    expect(after?.version).toBe(21)
  })

  it(
    'YARIŞ — okuma ile CAS arasına başka bir yazma girse bile disconnected YİNE damgalanır ' +
      '(tek denemeli sürümde sessizce kaybolurdu: rakip ne opponent:left ne terk galibiyeti alırdı)',
    async () => {
      const code = freshCode()
      await Room.create({
        code,
        state: 'playing',
        seats: { X: seat(), O: seat() },
        presence: {
          X: { connId: 'x-conn', since: new Date() },
          O: { connId: 'o-conn', since: new Date() },
        },
        version: 30,
      })

      // Tam olarak bir kez araya gir: rakip hamle yaptı, `version` 31 oldu.
      let raced = 0
      raceBeforeCas = async (): Promise<void> => {
        raced += 1
        raceBeforeCas = null
        await Room.collection.updateOne({ code }, { $inc: { version: 1 } })
      }

      await detachConnection(code, 'O', 'o-conn')

      const after = await Room.findOne({ code }).lean()
      expect(raced).toBe(1)
      expect(after?.presence.O).toBeNull()
      expect(after?.disconnected).toMatchObject({ seat: 'O' })
      // 30 → 31 (araya giren yazma) → 32 (detach). Detach TAM 1 artırır.
      expect(after?.version).toBe(32)
    },
  )

  it('YARIŞ — araya giren yazma BİR TAKEOVER ise yeniden deneme yapılır ama HİÇBİR ŞEY yazılmaz', async () => {
    const code = freshCode()
    await Room.create({
      code,
      state: 'playing',
      seats: { X: seat(), O: seat() },
      presence: {
        X: { connId: 'x-conn', since: new Date() },
        O: { connId: 'o-conn-ESKI', since: new Date() },
      },
      version: 40,
    })

    // Okuma "hâlâ benim" dedi, ama CAS'tan hemen önce koltuk devredildi.
    raceBeforeCas = async (): Promise<void> => {
      raceBeforeCas = null
      await Room.collection.updateOne(
        { code },
        {
          $inc: { version: 1 },
          $set: { 'presence.O': { connId: 'o-conn-YENI', since: new Date() } },
        },
      )
    }

    await detachConnection(code, 'O', 'o-conn-ESKI')

    const after = await Room.findOne({ code }).lean()
    expect(after?.presence.O).toMatchObject({ connId: 'o-conn-YENI' })
    expect(after?.disconnected).toBeNull()
    expect(after?.version).toBe(41)
  })

  it('YARIŞ — her denemede araya girilirse SESSİZCE pes eder (istisna fırlatmaz, sonsuz döngü yok)', async () => {
    const code = freshCode()
    await Room.create({
      code,
      state: 'playing',
      seats: { X: seat(), O: seat() },
      presence: {
        X: { connId: 'x-conn', since: new Date() },
        O: { connId: 'o-conn', since: new Date() },
      },
      version: 50,
    })

    let raced = 0
    raceBeforeCas = async (): Promise<void> => {
      raced += 1
      await Room.collection.updateOne({ code }, { $inc: { version: 1 } })
    }

    await expect(detachConnection(code, 'O', 'o-conn')).resolves.toBeUndefined()

    const after = await Room.findOne({ code }).lean()
    expect(raced).toBe(3)
    expect(after?.presence.O).toMatchObject({ connId: 'o-conn' })
    expect(after?.disconnected).toBeNull()
    // Yalnız araya giren üç yazma; detach hiç yazmadı.
    expect(after?.version).toBe(53)
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
