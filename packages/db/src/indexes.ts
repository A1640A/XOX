import { LEADERBOARD_MIN_RATED_GAMES, ROOM_TTL_SECONDS } from '@xox/shared'
import { Friendship } from './models/friendship'
import { Game } from './models/game'
import { MobileRefreshToken } from './models/mobile-refresh-token'
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
 * Tasarım §3.6'nın **elle** kopyalanmış beklenti tablosu — şemadan TÜRETİLMEZ.
 * Bir indeks bir model dosyasından silinirse bu liste hâlâ onu bekler ve
 * `indexes.test.ts` kırmızı olur (bkz. gotcha: kendine-referanslı test
 * silmeyi göremez).
 */
export const EXPECTED_INDEXES: readonly ExpectedIndex[] = [
  { collection: 'rooms', key: { code: 1 }, unique: true },
  { collection: 'rooms', key: { updatedAt: 1 }, expireAfterSeconds: ROOM_TTL_SECONDS },
  { collection: 'games', key: { roomCode: 1 } },
  { collection: 'games', key: { participants: 1, finishedAt: -1 } },
  { collection: 'games', key: { pairKey: 1, finishedAt: -1 } },
  { collection: 'games', key: { finishedAt: -1 } },
  { collection: 'users', key: { email: 1 }, unique: true },
  {
    collection: 'users',
    key: { elo: -1 },
    partialFilterExpression: { ratedGames: { $gte: LEADERBOARD_MIN_RATED_GAMES } },
  },
  { collection: 'friendships', key: { userA: 1, userB: 1 }, unique: true },
  { collection: 'friendships', key: { userB: 1, status: 1 } },
  { collection: 'mobileRefreshTokens', key: { jti: 1 }, unique: true },
  { collection: 'mobileRefreshTokens', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
] as const

/**
 * `ensureIndexes`'in ihtiyaç duyduğu tek yüzey — mongoose'un tam `Collection`
 * tipini içe aktarmak yerine daraltılmış bir arayüz kullanılır, böylece
 * modeller genel tip parametresi zorlamadan (bkz. `@typescript-eslint/no-unnecessary-type-arguments`)
 * doğrudan listelenebilir.
 */
interface LiveIndexInfo {
  name: string
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
}

export interface IndexCollection {
  collectionName: string
  createIndex: (key: Record<string, 1 | -1>, options: Record<string, unknown>) => Promise<string>
  dropIndex: (name: string) => Promise<unknown>
  indexes: (options?: Record<string, unknown>) => Promise<LiveIndexInfo[]>
  aggregate: (pipeline: Record<string, unknown>[]) => { toArray: () => Promise<unknown[]> }
}

interface IndexableModel {
  collection: IndexCollection
}

/**
 * Mongoose'un gerçek `Collection` tipi (aşırı yüklenmiş `indexes()` imzası)
 * `IndexCollection` ile yapısal olarak DOĞRUDAN eşleşmiyor — bu yüzden yalnız
 * burada, tek noktada, açık bir dönüşüm yapılır (`no-unnecessary-type-assertion`
 * burada GERÇEKTEN gerekli, aşırı yükleme uyumsuzluğu yüzünden).
 */
function asIndexCollection(collection: unknown): IndexCollection {
  return collection as IndexCollection
}

const MODELS: readonly IndexableModel[] = [
  { collection: asIndexCollection(Room.collection) },
  { collection: asIndexCollection(Game.collection) },
  { collection: asIndexCollection(User.collection) },
  { collection: asIndexCollection(Friendship.collection) },
  { collection: asIndexCollection(MobileRefreshToken.collection) },
]

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

function toRecreateOptions(existing: LiveIndexInfo): Record<string, unknown> {
  const options: Record<string, unknown> = {}
  if (existing.unique === true) options['unique'] = true
  if (existing.expireAfterSeconds !== undefined) {
    options['expireAfterSeconds'] = existing.expireAfterSeconds
  }
  if (existing.partialFilterExpression !== undefined) {
    options['partialFilterExpression'] = existing.partialFilterExpression
  }
  return options
}

/**
 * `spec.key`'in (ve varsa `partialFilterExpression`'ın) kapsadığı belgeler
 * arasında mükerrer değer olup olmadığını sayar — `unique:true` kurmadan
 * ÖNCE. SEC-003: canlı Atlas'ta doğrulandı, "aynı anahtara farklı adla ikinci
 * indeks kur, başarılıysa eskisini düşür" (boşluksuz takas) YÜRÜMÜYOR — Mongo
 * aynı anahtar üzerinde İKİNCİ bir indeksi isim farkı GÖZETMEKSİZİN reddediyor
 * (kanıt: kod 85 "Index already exists with a different name", bkz.
 * docs/board/reports/OPS-003.md). Bu yüzden risk düşür-SONRA-kur sırasının
 * KENDİSİNDEN kaçınarak değil, kurmanın BAŞARISIZ OLMA SEBEBİNİ (mükerrer
 * değer) düşürmeden ÖNCE tespit ederek kapatılıyor.
 */
async function hasDuplicateValues(
  collection: IndexCollection,
  spec: ExpectedIndex,
): Promise<boolean> {
  const groupId: Record<string, string> = {}
  for (const field of Object.keys(spec.key)) groupId[field] = `$${field}`
  const pipeline: Record<string, unknown>[] = []
  if (spec.partialFilterExpression !== undefined) {
    pipeline.push({ $match: spec.partialFilterExpression })
  }
  pipeline.push(
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  )
  const duplicates = await collection.aggregate(pipeline).toArray()
  return duplicates.length > 0
}

async function findExistingIndex(
  collection: IndexCollection,
  key: Record<string, 1 | -1>,
): Promise<LiveIndexInfo | undefined> {
  const name = defaultIndexName(key)
  const all = await collection.indexes()
  return all.find((index) => index.name === name)
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
 * SEC-003 — düşür-sonra-kur penceresi geri alınamaz OLMASIN diye üç katman:
 * 1. `unique:true` isteniyorsa düşürmeden ÖNCE mükerrer değer taranır; varsa
 *    ESKİ indekse DOKUNULMAZ, açık bir hata fırlatılır (veri temizliği insan
 *    işi — bu fonksiyon veriyi SESSİZCE değiştirmez).
 * 2. Tarama temizse eski indeks düşürülür, yenisi kurulur.
 * 3. Yeni kurma yine de patlarsa (yarış/geçici ağ hatası) ESKİ indeks AYNI
 *    seçenekleriyle GERİ kurulur — koleksiyon hiçbir anda o anahtar için
 *    indekssiz KALMAZ — sonra orijinal hata yeniden fırlatılır.
 */
export async function createIndexSafely(
  collection: IndexCollection,
  spec: ExpectedIndex,
): Promise<void> {
  const options = toCreateIndexOptions(spec)
  try {
    await collection.createIndex(spec.key, options)
    return
  } catch (error) {
    if (!isIndexOptionsConflict(error)) throw error
  }

  if (spec.unique === true && (await hasDuplicateValues(collection, spec))) {
    throw new Error(
      `${collection.collectionName}.${defaultIndexName(spec.key)}: mükerrer değer(ler) bulundu — ` +
        'unique indeks kurulamaz. ESKİ indeks dokunulmadan bırakıldı. Veri temizliği gerekiyor.',
    )
  }

  const existing = await findExistingIndex(collection, spec.key)
  const existingName = existing?.name ?? defaultIndexName(spec.key)
  await collection.dropIndex(existingName)
  try {
    await collection.createIndex(spec.key, options)
  } catch (recreateError) {
    // Telafi: eskiyi AYNI seçenekleriyle geri kur — indekssiz pencere kapansın.
    await collection.createIndex(
      spec.key,
      existing !== undefined ? toRecreateOptions(existing) : {},
    )
    throw recreateError
  }
}

let ensuring = false

/**
 * Şemada tanımlı indeksleri gerçek koleksiyonlarla uzlaştırır. `reset.ts` /
 * seed akışından BAĞIMSIZ olarak, `packages/db/src/migrate.ts` CLI'sinden
 * (CI'nin runner'ı — bkz. o dosyanın başı) ve elle çalıştırılan production
 * runbook'undan (`POST /api/admin/migrate`) çağrılır — `autoIndex`'in arka
 * planda ne zaman biteceğine güvenmek yerine açıkça beklenir.
 *
 * SEC-007: aynı süreç içinde iki çağrı ÇAKIŞIRSA (ör. runbook'u iki kez
 * art arda tetikleyen bir devops), `createIndexSafely`'nin drop→create
 * penceresi ikisinin arasında yarışabilir. `health/realtime`'daki
 * `probeRunning` kilidiyle AYNI desen: ikinci çağrı beklemeden reddedilir.
 */
export async function ensureIndexes(): Promise<void> {
  if (ensuring) {
    throw new Error('ensureIndexes zaten çalışıyor — eşzamanlı ikinci çağrı reddedildi (SEC-007)')
  }
  ensuring = true
  try {
    for (const model of MODELS) {
      const collectionName = model.collection.collectionName
      const expected = EXPECTED_INDEXES.filter((entry) => entry.collection === collectionName)
      for (const spec of expected) {
        await createIndexSafely(model.collection, spec)
      }
    }
  } finally {
    ensuring = false
  }
}
