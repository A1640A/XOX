import { ROOM_TTL_SECONDS } from '@xox/shared'
import { Game } from './models/game'
import { Room } from './models/room'
import { User } from './models/user'

export interface ExpectedIndex {
  collection: string
  /** Bileşik indekslerde alan sırası önemlidir — sorgu planlayıcısı buna göre eşleşir. */
  key: Record<string, 1 | -1>
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
}

/**
 * Elle kopyalanmış beklenti tablosu — şemadan TÜRETİLMEZ (bkz. gotcha:
 * kendine-referanslı test silmeyi göremez). Bu, main'de bugün var olan
 * modellerin (Room/Game/User) indekslerini kapsar. `friendships` ve
 * `mobileRefreshTokens` DB-001 ile gelecek; integrator DB-001 merge olurken
 * bu listeyi ve `MODELS` dizisini genişletir.
 */
export const EXPECTED_INDEXES: readonly ExpectedIndex[] = [
  { collection: 'rooms', key: { code: 1 }, unique: true },
  { collection: 'rooms', key: { updatedAt: 1 }, expireAfterSeconds: ROOM_TTL_SECONDS },
  { collection: 'games', key: { roomCode: 1 } },
  { collection: 'games', key: { finishedAt: -1 } },
  { collection: 'users', key: { email: 1 }, unique: true },
  { collection: 'users', key: { elo: -1 } },
] as const

/**
 * `ensureIndexes`'in ihtiyaç duyduğu tek yüzey — mongoose'un tam `Collection`
 * tipini içe aktarmak yerine daraltılmış bir arayüz kullanılır, böylece
 * modeller genel tip parametresi zorlamadan (bkz. `@typescript-eslint/no-unnecessary-type-arguments`)
 * doğrudan listelenebilir.
 */
interface IndexCollection {
  collectionName: string
  createIndex: (key: Record<string, 1 | -1>, options: Record<string, unknown>) => Promise<string>
  dropIndex: (name: string) => Promise<unknown>
}

interface IndexableModel {
  collection: IndexCollection
}

const MODELS: readonly IndexableModel[] = [Room, Game, User]

/** Mongo'nun `createIndex` çağrısında varsayılan olarak ürettiği isimle aynı biçim. */
function defaultIndexName(key: Record<string, 1 | -1>): string {
  return Object.entries(key)
    .map(([field, direction]) => `${field}_${String(direction)}`)
    .join('_')
}

/**
 * Aynı anahtarda farklı seçeneklerle indeks kurma çakışmasını daraltır.
 *
 * ⚠️ OPS-003 canlı doğrulama: MongoDB dokümantasyonu bu durumu kod 85
 * (`IndexOptionsConflict`) diye anar, ama GERÇEK Atlas sürücüsü (bu yazıda)
 * kod **86** (`IndexKeySpecsConflict`) döndürüyor — aynı ada/anahtara sahip
 * ama farklı seçenekli (ör. `unique` eksik) bir indeks bulununca. Yalnız 85'i
 * kontrol etmek bu düzeltmeyi SESSİZCE devre dışı bırakırdı: hata yakalanmaz,
 * `throw error` ile dışarı çıkar, indeks eski hâliyle kalırdı — DB-001
 * incelemesinin bulduğu tam kusur, düzeltme koduna gizlice geri sızmış olurdu.
 * Bu yüzden ikisi de kontrol edilir.
 */
function isIndexOptionsConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const withCode = error as { code?: unknown; codeName?: unknown }
  return (
    withCode.code === 85 ||
    withCode.code === 86 ||
    withCode.codeName === 'IndexOptionsConflict' ||
    withCode.codeName === 'IndexKeySpecsConflict'
  )
}

function toCreateIndexOptions(spec: ExpectedIndex): {
  unique?: true
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
} {
  const options: {
    unique?: true
    expireAfterSeconds?: number
    partialFilterExpression?: Record<string, unknown>
  } = {}
  if (spec.unique === true) options.unique = true
  if (spec.expireAfterSeconds !== undefined) options.expireAfterSeconds = spec.expireAfterSeconds
  if (spec.partialFilterExpression !== undefined) {
    options.partialFilterExpression = spec.partialFilterExpression
  }
  return options
}

/**
 * Tek bir indeksi ÜRETİM YOLUYLA (`createIndex`) kurar — `syncIndexes()` değil.
 *
 * `syncIndexes()` önce koleksiyondaki HER indeksi düşürüp yeniden kurar; bu
 * yüzden seçenek çakışmasını hiçbir zaman göremez ve testte hep temiz sonuç
 * verir. Gerçek üretim çağrısı `createIndex`'tir: aynı isimde (aynı alan/yön
 * kombinasyonunda) farklı seçeneklerle bir indeks zaten varsa Mongo bir çakışma
 * hatası fırlatır (bkz. `isIndexOptionsConflict` — kod 85 VEYA 86, sürücü
 * sürümüne göre değişiyor) VE eski indeksi olduğu gibi bırakır. Canlı
 * doğrulandı (Atlas, bu yazıda kod 86 `IndexKeySpecsConflict` döndü):
 * `email_1` benzersiz-olmayan hâldeyken `unique:true` eklemek sessizce
 * başarısız oluyordu (bkz. docs/memory/gotchas.md).
 *
 * Bu yüzden burada çakışma AÇIKÇA yakalanır: eski indeks adıyla düşürülür,
 * yeni seçeneklerle yeniden kurulur.
 */
export async function createIndexSafely(
  collection: IndexCollection,
  spec: ExpectedIndex,
): Promise<void> {
  const options = toCreateIndexOptions(spec)
  try {
    await collection.createIndex(spec.key, options)
  } catch (error) {
    if (!isIndexOptionsConflict(error)) throw error
    await collection.dropIndex(defaultIndexName(spec.key))
    await collection.createIndex(spec.key, options)
  }
}

/**
 * Şemada tanımlı indeksleri gerçek koleksiyonlarla uzlaştırır. `reset.ts` /
 * seed akışından BAĞIMSIZ olarak, deploy sonrası migration adımından
 * (`POST /api/admin/migrate`, bkz. o route'un dosya başı yorumu) çağrılır —
 * `autoIndex`'in arka planda ne zaman biteceğine güvenmek yerine açıkça
 * beklenir ve sonucu raporlanır.
 */
export async function ensureIndexes(): Promise<void> {
  for (const model of MODELS) {
    const collectionName = model.collection.collectionName
    const expected = EXPECTED_INDEXES.filter((entry) => entry.collection === collectionName)
    for (const spec of expected) {
      await createIndexSafely(model.collection, spec)
    }
  }
}
