import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { connectDb, disconnectDb, getDbName } from './client'
import { Friendship } from './models/friendship'
import { Game } from './models/game'
import { MobileRefreshToken } from './models/mobile-refresh-token'
import { Room } from './models/room'
import { User } from './models/user'
import { WsTicket } from './models/ws-ticket'
import { createIndexSafely, ensureIndexes, EXPECTED_INDEXES, type ExpectedIndex } from './indexes'

/**
 * `MODELS` artık ALTI koleksiyona yazıyor (Room/Game/User/Friendship/
 * MobileRefreshToken/WsTicket) — bir testte yalnız BİRİNİ mock'layıp diğerlerini
 * gerçek (bağlantısız) mongoose koleksiyonuna bırakmak, o koleksiyonların
 * `bufferCommands` zaman aşımına (varsayılan 10 sn) düşüp testi yavaşlatır/
 * kırar. Bu yüzden HER testte altısı birden mock'lanır.
 */
function mockAllCollectionsResolved(): {
  room: ReturnType<typeof vi.fn>
  game: ReturnType<typeof vi.fn>
  user: ReturnType<typeof vi.fn>
  friendship: ReturnType<typeof vi.fn>
  mobileRefreshToken: ReturnType<typeof vi.fn>
  wsTicket: ReturnType<typeof vi.fn>
} {
  return {
    room: vi.spyOn(Room.collection, 'createIndex').mockResolvedValue('ok'),
    game: vi.spyOn(Game.collection, 'createIndex').mockResolvedValue('ok'),
    user: vi.spyOn(User.collection, 'createIndex').mockResolvedValue('ok'),
    friendship: vi.spyOn(Friendship.collection, 'createIndex').mockResolvedValue('ok'),
    mobileRefreshToken: vi
      .spyOn(MobileRefreshToken.collection, 'createIndex')
      .mockResolvedValue('ok'),
    wsTicket: vi.spyOn(WsTicket.collection, 'createIndex').mockResolvedValue('ok'),
  }
}

/**
 * `IndexOptionsConflict` (kod 85) — gerçek Atlas'ın `email_1` benzersiz-olmayan
 * hâldeyken `unique:true` eklemeye çalışıldığında verdiği şekli taklit eder.
 * `codeName` de eklendi: sürücü sürümüne göre birinden biri olabilir.
 */
function indexOptionsConflictError(): Error & { code: number; codeName: string } {
  return Object.assign(new Error('Index already exists with a different name'), {
    code: 85,
    codeName: 'IndexOptionsConflict',
  })
}

/**
 * OPS-003 canlı doğrulama: GERÇEK Atlas sürücüsü bu senaryoda kod **86**
 * (`IndexKeySpecsConflict`) döndürdü — dokümantasyondaki kod 85 değil.
 * Yalnız 85'i tanımak bu düzeltmeyi sessizce devre dışı bırakırdı.
 */
function indexKeySpecsConflictError(): Error & { code: number; codeName: string } {
  return Object.assign(
    new Error(
      'An existing index has the same name as the requested index. Requested index: { v: 2, unique: true, key: { email: 1 }, name: "email_1" }, existing index: { v: 2, key: { email: 1 }, name: "email_1" }',
    ),
    { code: 86, codeName: 'IndexKeySpecsConflict' },
  )
}

interface FakeCollection {
  createIndex: ReturnType<typeof vi.fn>
  dropIndex: ReturnType<typeof vi.fn>
  indexes: ReturnType<typeof vi.fn>
  aggregate: ReturnType<typeof vi.fn>
}

/** Varsayılan: mevcut indeks yok (`indexes()` boş), mükerrer değer yok (`aggregate` boş dizi). */
function fakeCollection(): FakeCollection {
  return {
    createIndex: vi.fn(),
    dropIndex: vi.fn(),
    indexes: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
  }
}

describe('createIndexSafely — üretim yolu (createIndex), syncIndexes DEĞİL', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('çakışma yoksa yalnızca createIndex çağrılır, dropIndex hiç çağrılmaz', async () => {
    const collection = fakeCollection()
    collection.createIndex.mockResolvedValue('code_1')
    const spec: ExpectedIndex = { collection: 'rooms', key: { code: 1 }, unique: true }

    await createIndexSafely(collection as never, spec)

    expect(collection.createIndex).toHaveBeenCalledExactlyOnceWith({ code: 1 }, { unique: true })
    expect(collection.dropIndex).not.toHaveBeenCalled()
  })

  it('IndexOptionsConflict alındığında eski indeksi düşürüp YENİ seçeneklerle yeniden kurar', async () => {
    const collection = fakeCollection()
    collection.createIndex
      .mockRejectedValueOnce(indexOptionsConflictError())
      .mockResolvedValueOnce('email_1')
    collection.dropIndex.mockResolvedValue(true)
    const spec: ExpectedIndex = { collection: 'users', key: { email: 1 }, unique: true }

    await createIndexSafely(collection as never, spec)

    expect(collection.createIndex).toHaveBeenCalledTimes(2)
    expect(collection.dropIndex).toHaveBeenCalledExactlyOnceWith('email_1')
    // Düşürme, yeniden kurmadan ÖNCE gerçekleşmeli — sıra testle kilitlenir.
    const dropOrder = collection.dropIndex.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    const secondCreateOrder = collection.createIndex.mock.invocationCallOrder[1] ?? -1
    expect(dropOrder).toBeLessThan(secondCreateOrder)
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, { email: 1 }, { unique: true })
  })

  it("IndexKeySpecsConflict (kod 86 — Atlas'ın CANLI döndürdüğü kod) da aynı şekilde ele alınır", async () => {
    const collection = fakeCollection()
    collection.createIndex
      .mockRejectedValueOnce(indexKeySpecsConflictError())
      .mockResolvedValueOnce('email_1')
    collection.dropIndex.mockResolvedValue(true)
    const spec: ExpectedIndex = { collection: 'users', key: { email: 1 }, unique: true }

    await createIndexSafely(collection as never, spec)

    expect(collection.dropIndex).toHaveBeenCalledExactlyOnceWith('email_1')
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, { email: 1 }, { unique: true })
  })

  it('IndexOptionsConflict DIŞINDAKİ hatalar yutulmaz — olduğu gibi fırlatılır', async () => {
    const collection = fakeCollection()
    collection.createIndex.mockRejectedValue(new Error('bağlantı koptu'))
    const spec: ExpectedIndex = { collection: 'games', key: { roomCode: 1 } }

    await expect(createIndexSafely(collection as never, spec)).rejects.toThrow('bağlantı koptu')
    expect(collection.dropIndex).not.toHaveBeenCalled()
  })

  it('bileşik anahtarlar için Mongo varsayılan indeks adıyla düşürür (alan_yön birleşimi)', async () => {
    const collection = fakeCollection()
    collection.createIndex
      .mockRejectedValueOnce(indexOptionsConflictError())
      .mockResolvedValueOnce('a_1_b_-1')
    collection.dropIndex.mockResolvedValue(true)
    const spec: ExpectedIndex = { collection: 'x', key: { a: 1, b: -1 } }

    await createIndexSafely(collection as never, spec)

    expect(collection.dropIndex).toHaveBeenCalledExactlyOnceWith('a_1_b_-1')
  })

  describe('SEC-003 — düşür-sonra-kur penceresi geri alınamaz olmasın', () => {
    it('canlıda DOĞRULANDI: aynı anahtara farklı adla ikinci indeks kurmak da çakışma verir — bu yüzden boşluksuz "yeni adla kur" YOK, önce mükerrer tarama var', async () => {
      const collection = fakeCollection()
      collection.createIndex.mockRejectedValueOnce(indexOptionsConflictError())
      // Aggregate mükerrer email BULDU — unique kurulamaz, veri temiz değil.
      collection.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([{ _id: { email: 'a@x.test' }, count: 2 }]),
      })
      const spec: ExpectedIndex = { collection: 'users', key: { email: 1 }, unique: true }

      await expect(createIndexSafely(collection as never, spec)).rejects.toThrow(/mükerrer/)

      // Veri temiz değilken ESKİ indekse DOKUNULMAZ — düşürme hiç çağrılmaz.
      expect(collection.dropIndex).not.toHaveBeenCalled()
      expect(collection.createIndex).toHaveBeenCalledTimes(1)
    })

    it('dropIndex reddederse (ör. eşzamanlı başka bir işlem) hata olduğu gibi fırlatılır, ikinci createIndex denenmez', async () => {
      const collection = fakeCollection()
      collection.createIndex.mockRejectedValueOnce(indexOptionsConflictError())
      collection.dropIndex.mockRejectedValue(new Error('ns not found ya da eşzamanlı çakışma'))
      const spec: ExpectedIndex = { collection: 'users', key: { email: 1 }, unique: true }

      await expect(createIndexSafely(collection as never, spec)).rejects.toThrow(
        /ns not found|eşzamanlı çakışma/,
      )
      expect(collection.createIndex).toHaveBeenCalledTimes(1)
    })

    it('düşürme sonrası İKİNCİ createIndex de patlarsa (yarış/geçici hata) eski indeks AYNI seçenekleriyle GERİ kurulur — koleksiyon hiçbir an indekssiz kalmaz', async () => {
      const collection = fakeCollection()
      // Mevcut (eski) indeks: benzersiz OLMAYAN email_1 — kayıt altına alınır ki geri kurulabilsin.
      collection.indexes.mockResolvedValue([{ name: 'email_1' }])
      collection.createIndex
        .mockRejectedValueOnce(indexOptionsConflictError()) // 1) ilk deneme çakışır
        .mockRejectedValueOnce(new Error('geçici ağ hatası')) // 2) düşür-sonra-kur da patlar
        .mockResolvedValueOnce('email_1') // 3) telafi: eskiyi geri kur
      collection.dropIndex.mockResolvedValue(true)
      const spec: ExpectedIndex = { collection: 'users', key: { email: 1 }, unique: true }

      await expect(createIndexSafely(collection as never, spec)).rejects.toThrow('geçici ağ hatası')

      expect(collection.dropIndex).toHaveBeenCalledExactlyOnceWith('email_1')
      expect(collection.createIndex).toHaveBeenCalledTimes(3)
      // Telafi çağrısı ESKİ (benzersiz olmayan) seçeneklerle — {unique:true} DEĞİL.
      expect(collection.createIndex).toHaveBeenNthCalledWith(3, { email: 1 }, {})
    })
  })
})

describe('EXPECTED_INDEXES — elle yazılmış beklenti tablosu', () => {
  it('tüm modellerin (Room/Game/User/Friendship/MobileRefreshToken/WsTicket) koleksiyonlarını kapsar', () => {
    const collections = new Set(EXPECTED_INDEXES.map((entry) => entry.collection))
    expect(collections).toEqual(
      new Set(['rooms', 'games', 'users', 'friendships', 'mobileRefreshTokens', 'wsTickets']),
    )
  })

  it('users.email benzersizdir — KK-002 buna dayanır', () => {
    const emailIndex = EXPECTED_INDEXES.find(
      (entry) =>
        entry.collection === 'users' && JSON.stringify(entry.key) === JSON.stringify({ email: 1 }),
    )
    expect(emailIndex?.unique).toBe(true)
  })

  it('wsTickets.jti benzersizdir — SEC-003 tek kullanımlık tüketim buna dayanır', () => {
    const jtiIndex = EXPECTED_INDEXES.find(
      (entry) =>
        entry.collection === 'wsTickets' &&
        JSON.stringify(entry.key) === JSON.stringify({ jti: 1 }),
    )
    expect(jtiIndex?.unique).toBe(true)
  })

  it('wsTickets.expiresAt TTL indeksidir (expireAfterSeconds: 0) — mobileRefreshTokens ile aynı kalıp', () => {
    const ttlIndex = EXPECTED_INDEXES.find(
      (entry) =>
        entry.collection === 'wsTickets' &&
        JSON.stringify(entry.key) === JSON.stringify({ expiresAt: 1 }),
    )
    expect(ttlIndex?.expireAfterSeconds).toBe(0)
  })

  it('tasarım §3.6 tam 15 indeks tanımlar (silme sessizce fark edilmesin diye çıplak sayı)', () => {
    expect(EXPECTED_INDEXES).toHaveLength(15)
  })
})

describe('ensureIndexes — üretim çağrı yolu (mock)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('her modelin koleksiyonunda YALNIZ kendi beklenen indekslerini createIndex ile kurar', async () => {
    const {
      room: roomCreate,
      game: gameCreate,
      user: userCreate,
      wsTicket: wsTicketCreate,
    } = mockAllCollectionsResolved()

    await ensureIndexes()

    expect(roomCreate).toHaveBeenCalledWith({ code: 1 }, { unique: true })
    expect(roomCreate).toHaveBeenCalledWith(
      { updatedAt: 1 },
      { expireAfterSeconds: expect.any(Number) },
    )
    expect(gameCreate).toHaveBeenCalledWith({ roomCode: 1 }, {})
    expect(gameCreate).toHaveBeenCalledWith({ finishedAt: -1 }, {})
    expect(userCreate).toHaveBeenCalledWith({ email: 1 }, { unique: true })
    expect(userCreate).toHaveBeenCalledWith({ elo: -1 }, expect.any(Object))
    expect(wsTicketCreate).toHaveBeenCalledWith({ jti: 1 }, { unique: true })
    expect(wsTicketCreate).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: expect.any(Number) },
    )
    expect(wsTicketCreate).toHaveBeenCalledWith({ userId: 1, usedAt: 1 }, {})
  })

  it('bir koleksiyonda IndexOptionsConflict çıksa bile diğer indeksler kurulmaya devam eder', async () => {
    mockAllCollectionsResolved()
    const userCreate = vi
      .spyOn(User.collection, 'createIndex')
      .mockRejectedValueOnce(indexOptionsConflictError())
      .mockResolvedValue('ok')
    vi.spyOn(User.collection, 'indexes').mockResolvedValue([])
    vi.spyOn(User.collection, 'aggregate').mockReturnValue({
      toArray: (): Promise<unknown[]> => Promise.resolve([]),
    } as never)
    vi.spyOn(User.collection, 'dropIndex').mockResolvedValue({ ok: 1 })

    await expect(ensureIndexes()).resolves.toBeUndefined()

    expect(userCreate).toHaveBeenCalledWith({ elo: -1 }, expect.any(Object))
  })

  it('SEC-007: eşzamanlı ikinci çağrı reddedilir — drop→create yarışı süreç içinde açılmaz', async () => {
    mockAllCollectionsResolved()
    // `ensuring` kilidi ilk `await`'ten ÖNCE, senkron olarak set edilir (bkz.
    // indexes.ts) — ikinci çağrının reddi mikro-görev kuyruğu hiç işlemeden,
    // senkron sırada garanti; ek bir gecikmeye gerek yok, hiçbir mock asılı
    // kalmaz.
    const first = ensureIndexes()
    await expect(ensureIndexes()).rejects.toThrow(/zaten çalışıyor/)

    await expect(first).resolves.toBeUndefined()

    // Kilit serbest kaldı — üçüncü çağrı normal şekilde tamamlanabilir.
    await expect(ensureIndexes()).resolves.toBeUndefined()
  })
})

/**
 * Tasarım §3.6'nın tam listesine karşı **gerçek `xox_test`** koleksiyonlarının
 * indekslerini doğrular. `EXPECTED_INDEXES` şemadan türetilmez (bkz. gotcha:
 * kendine-referanslı test silmeyi göremez) — burada yalnız canlı sürücü
 * çıktısıyla karşılaştırılır.
 */
describe('İndeksler — tasarım §3.6 tam liste (canlı xox_test)', () => {
  interface LiveIndexInfo {
    name: string
    key: Record<string, 1 | -1>
    unique?: boolean
    expireAfterSeconds?: number
    partialFilterExpression?: Record<string, unknown>
  }

  beforeAll(async () => {
    if (getDbName() !== 'xox_test') {
      throw new Error(`Beklenmedik veritabanı: ${getDbName()} — yalnız xox_test'e karşı koşulur`)
    }
    await connectDb()
    await ensureIndexes()
  })

  afterAll(async () => {
    await disconnectDb()
  })

  async function liveIndexes(collectionName: string): Promise<LiveIndexInfo[]> {
    const conn = await connectDb()
    const db = conn.connection.db
    if (db === undefined) throw new Error('bağlantının db örneği yok')
    const raw = await db.collection(collectionName).indexes()
    return raw
      .filter((index) => index.name !== '_id_')
      .map((index) => ({
        name: index.name ?? '',
        key: index.key as Record<string, 1 | -1>,
        ...(index.unique === true ? { unique: true } : {}),
        ...(typeof index.expireAfterSeconds === 'number'
          ? { expireAfterSeconds: index.expireAfterSeconds }
          : {}),
        ...(index.partialFilterExpression !== undefined
          ? { partialFilterExpression: index.partialFilterExpression }
          : {}),
      }))
  }

  const collections = [...new Set(EXPECTED_INDEXES.map((entry) => entry.collection))]

  it.each(collections)(
    '%s koleksiyonu tasarımdaki indekslerin TAMAMINI ve YALNIZ onları taşır',
    async (collectionName) => {
      const expected = EXPECTED_INDEXES.filter((entry) => entry.collection === collectionName)
      const actual = await liveIndexes(collectionName)

      expect(actual).toHaveLength(expected.length)

      for (const expectedIndex of expected) {
        const match = actual.find(
          (index) => JSON.stringify(index.key) === JSON.stringify(expectedIndex.key),
        )
        expect(
          match,
          `${collectionName}: ${JSON.stringify(expectedIndex.key)} indeksi eksik`,
        ).toBeDefined()
        if (expectedIndex.unique === true) {
          expect(match?.unique).toBe(true)
        }
        if (expectedIndex.expireAfterSeconds !== undefined) {
          expect(match?.expireAfterSeconds).toBe(expectedIndex.expireAfterSeconds)
        }
        if (expectedIndex.partialFilterExpression !== undefined) {
          expect(match?.partialFilterExpression).toStrictEqual(
            expectedIndex.partialFilterExpression,
          )
        }
      }
    },
  )

  it('tasarım §3.6 tam 15 indeks tanımlar (11 yeni + games.finishedAt önceden mevcuttu + wsTickets üçü DB-006)', () => {
    expect(EXPECTED_INDEXES).toHaveLength(15)
  })
})
