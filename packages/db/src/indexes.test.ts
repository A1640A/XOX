import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb, getDbName } from './client'
import { EXPECTED_INDEXES, ensureIndexes } from './indexes'

interface LiveIndexInfo {
  name: string
  key: Record<string, 1 | -1>
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
}

/**
 * Tasarım §3.6'nın tam listesine karşı **gerçek `xox_test`** koleksiyonlarının
 * indekslerini doğrular. `EXPECTED_INDEXES` şemadan türetilmez (bkz. gotcha:
 * kendine-referanslı test silmeyi göremez) — burada yalnız canlı sürücü
 * çıktısıyla karşılaştırılır.
 */
describe('İndeksler — tasarım §3.6 tam liste', () => {
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

  it('tasarım §3.6 tam 12 indeks tanımlar (11 yeni + games.finishedAt önceden mevcuttu)', () => {
    expect(EXPECTED_INDEXES).toHaveLength(12)
  })
})
