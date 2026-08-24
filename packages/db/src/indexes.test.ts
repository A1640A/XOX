import { afterEach, describe, expect, it, vi } from 'vitest'
import { Game } from './models/game'
import { Room } from './models/room'
import { User } from './models/user'
import { createIndexSafely, ensureIndexes, EXPECTED_INDEXES, type ExpectedIndex } from './indexes'

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
}

function fakeCollection(): FakeCollection {
  return { createIndex: vi.fn(), dropIndex: vi.fn() }
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
})

describe('EXPECTED_INDEXES — elle yazılmış beklenti tablosu', () => {
  it('main üzerindeki üç modelin (Room/Game/User) tüm indekslerini kapsar', () => {
    const collections = new Set(EXPECTED_INDEXES.map((entry) => entry.collection))
    expect(collections).toEqual(new Set(['rooms', 'games', 'users']))
  })

  it('users.email benzersizdir — KK-002 buna dayanır', () => {
    const emailIndex = EXPECTED_INDEXES.find(
      (entry) =>
        entry.collection === 'users' && JSON.stringify(entry.key) === JSON.stringify({ email: 1 }),
    )
    expect(emailIndex?.unique).toBe(true)
  })

  it('tam 6 indeks tanımlar (silme sessizce fark edilmesin diye çıplak sayı)', () => {
    expect(EXPECTED_INDEXES).toHaveLength(6)
  })
})

describe('ensureIndexes — üretim çağrı yolu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('her modelin koleksiyonunda YALNIZ kendi beklenen indekslerini createIndex ile kurar', async () => {
    const roomCreate = vi.spyOn(Room.collection, 'createIndex').mockResolvedValue('ok')
    const gameCreate = vi.spyOn(Game.collection, 'createIndex').mockResolvedValue('ok')
    const userCreate = vi.spyOn(User.collection, 'createIndex').mockResolvedValue('ok')

    await ensureIndexes()

    expect(roomCreate).toHaveBeenCalledWith({ code: 1 }, { unique: true })
    expect(roomCreate).toHaveBeenCalledWith(
      { updatedAt: 1 },
      { expireAfterSeconds: expect.any(Number) },
    )
    expect(gameCreate).toHaveBeenCalledWith({ roomCode: 1 }, {})
    expect(gameCreate).toHaveBeenCalledWith({ finishedAt: -1 }, {})
    expect(userCreate).toHaveBeenCalledWith({ email: 1 }, { unique: true })
    expect(userCreate).toHaveBeenCalledWith({ elo: -1 }, {})
  })

  it('bir koleksiyonda IndexOptionsConflict çıksa bile diğer indeksler kurulmaya devam eder', async () => {
    const userCreate = vi
      .spyOn(User.collection, 'createIndex')
      .mockRejectedValueOnce(indexOptionsConflictError())
      .mockResolvedValue('ok')
    vi.spyOn(User.collection, 'dropIndex').mockResolvedValue({ ok: 1 })
    vi.spyOn(Room.collection, 'createIndex').mockResolvedValue('ok')
    vi.spyOn(Game.collection, 'createIndex').mockResolvedValue('ok')

    await expect(ensureIndexes()).resolves.toBeUndefined()

    expect(userCreate).toHaveBeenCalledWith({ elo: -1 }, {})
  })
})
