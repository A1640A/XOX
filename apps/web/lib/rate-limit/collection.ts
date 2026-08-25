import { getDbName, getMongoClient } from '@xox/db'
import type { Collection, Document } from 'mongodb'

const COLLECTION_NAME = 'rateLimitBuckets'

/**
 * SEC-002 — DURUM DEPOSU KARARI (decisions.md'ye işlenecek).
 *
 * SEÇİLEN: Atlas'ta yeni, ham (Mongoose'suz) bir koleksiyon. `packages/db`
 * DONDURULDU (bu kartın çakışma kümesi dışında) — yeni bir Mongoose modeli
 * EKLENEMEZ. Bunun yerine zaten dışa verilen `getMongoClient()` (Auth.js
 * adapter'ı için var olan aynı paylaşılan bağlantı) üzerinden ham `mongodb`
 * sürücüsüyle konuşulur; `packages/db` içindeki HİÇBİR dosyaya dokunulmadı.
 *
 * REDDEDİLEN ALTERNATİF A — bellek içi `Map`: Fluid Compute instance'ları
 * arasında paylaşılmaz (her instance kendi sayacını tutar, saldırgan farklı
 * instance'lara denk gelerek sınırı fiilen çarpar) ve soğuk başlatmada
 * sıfırlanır. Görev kartının kendisi bunu açıkça reddediyor.
 *
 * REDDEDİLEN ALTERNATİF B — Upstash/Redis: Bu projede HİÇ provizyonlanmamış
 * yeni bir dış bağımlılık + yeni bir sır (`UPSTASH_*`) ekler; gece koşusu
 * ortasında yeni bir hesap açma/env değişkeni onayı gerektirir. Atlas zaten
 * var ve TTL indeksli koleksiyon aynı garantiyi (paylaşılan, kalıcı, otomatik
 * temizlenen durum) sıfır yeni altyapıyla verir.
 *
 * MALİYET ENDİŞESİ (görev kartında açıkça soruldu): "her başarısız girişte
 * Mongo yazması yeni bir DoS vektörü açar mı?" — Tek bir indeksli
 * `findOneAndUpdate` upsert'i (bu koleksiyonun TEK indeksi `expireAt` TTL'i)
 * argon2id'nin (~30-100ms, 19MiB) yanında İHMAL EDİLEBİLİR maliyette (~birkaç
 * ms, bağlantı havuzu zaten AÇIK — `connectDb()` Fluid instance'ları arasında
 * paylaşılan tek bağlantıyı yeniden kullanıyor, KK: client.ts). Asıl DoS
 * vektörü zaten argon2 hesaplaması; bu yazma onu DURDURMAK için var, ONA
 * EKLEMİYOR. Kilitli bir kimlik için argon2 hiç ÇALIŞTIRILMIYOR (route
 * seviyesinde kısa devre) — bu yazı, tam da bu sayede, argon2 maliyetinin
 * TEKRARINI önlüyor.
 *
 * FAIL-CLOSED KARARI (güvenlik denetimi MEDIUM — bilerek BELGELENDİ,
 * DEĞİŞTİRİLMEDİ): `getRateLimitCollection()`/`checkIpRateLimit()`/
 * `getLoginLockStatus()` Mongo'ya ulaşamazsa (ör. Atlas kesintisi)
 * FIRLATIR; `register/route.ts` ve `[...nextauth]/route.ts`da bu çağrı
 * bilerek dış `try`in DIŞINDA — yani Mongo çökerse kayıt/giriş 500 ile
 * TAMAMEN durur (rate-limit'in kendisi "sessizce izin ver"e düşmez).
 * Alternatif (fail-OPEN: hata olursa sınırsız izin ver) REDDEDİLDİ: giriş/
 * kayıt zaten `connectDb()`/`User.findOne`/argon2 için Mongo'ya muhtaç —
 * Atlas çökmüşse özellik ZATEN çalışmıyor, rate limiter'ı fail-open yapmak
 * yalnız TAM OLARAK bu kartın kapatmaya çalıştığı pencereyi (kaynak
 * tükenmesi + kimlik bilgisi tahmini) Atlas en kırılgan olduğu ANDA
 * (bir kesinti/saldırı sırasında) yeniden AÇAR — savunmanın en çok
 * gerektiği anda kendini kapatması kabul edilemez. Bedel: gerçek bir Atlas
 * kesintisinde kullanıcılar `serverSelectionTimeoutMS` (10 sn, `client.ts`)
 * kadar bekleyip 500 alır — bu zaten `connectDb()`'nin var olan davranışı,
 * bu kart YENİ bir gecikme eklemiyor.
 */
export interface RateLimitBucketDoc extends Document {
  _id: string
  count?: number
  failCount?: number
  lockedUntil?: Date | null
  expireAt: Date
}

/**
 * `client.ts`teki `__xoxMongoose` global önbellek kalıbının aynısı: Fluid
 * instance'ı modül kapsamını yeniden kullandığı sürece TTL indeksi bir kez
 * kurulur, sonraki her `getRateLimitCollection()` çağrısı ek round-trip
 * YAPMAZ (aksi halde her istekte bir `createIndex` komutu daha argon2'nin
 * yanına eklenir — küçük ama gereksiz bir maliyet).
 *
 * GÜVENLİK DENETİMİ — MEDIUM (kalıcı bozulma): `createIndex` bir kez
 * REDDEDERSE (ör. geçici bir Atlas hıçkırığı), önceki sürüm o REDDEDİLMİŞ
 * promise'i `??=` ile SONSUZA KADAR önbellekte tutuyordu — aynı örnek
 * (aynı Fluid instance) o andan sonra HER isteğe aynı hatayı fırlatıyordu,
 * bağlantı düzelse bile. Şimdi reddedilirse önbellek TEMİZLENİYOR ki bir
 * sonraki çağrı YENİDEN denesin; geçici bir hata kalıcı bir instance
 * çökmesine dönüşmesin.
 */
interface RateLimitIndexCache {
  promise: Promise<void> | null
}

const globalForRateLimit = globalThis as unknown as { __xoxRateLimitIndex?: RateLimitIndexCache }

const indexCache: RateLimitIndexCache = (globalForRateLimit.__xoxRateLimitIndex ??= {
  promise: null,
})

export async function getRateLimitCollection<T extends Document = RateLimitBucketDoc>(): Promise<
  Collection<T>
> {
  const client = await getMongoClient()
  const db = client.db(getDbName())
  const collection = db.collection<T>(COLLECTION_NAME)
  indexCache.promise ??= collection
    .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })
    .then(() => undefined)
    .catch((error: unknown) => {
      indexCache.promise = null
      throw error
    })
  await indexCache.promise
  return collection
}
