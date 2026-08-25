import type { Collection } from 'mongodb'
import { getRateLimitCollection, type RateLimitBucketDoc } from './collection'
import { hashIdentifier } from './hash'

/**
 * SEC-002 (b) — kimlik başına deneme sayacı/kilit, dağıtık credential
 * stuffing'i hedefler (tek IP sınırının kaçırdığı sınıf). Sayaç e-posta VAR
 * OLSUN YA DA OLMASIN aynı şekilde işler — kullanıcı numaralandırmasını
 * kapatan asıl mekanizma bu (kilit kararı hiçbir zaman `User` koleksiyonuna
 * bakmaz, yalnız ham (hash'lenmiş) e-posta dizesine bakar).
 *
 * GÜVENLİK DENETİMİ — HIGH-2 (hedefli hesap DoS'u): TEK bir e-posta-yalnız
 * kilit, saldırganın kurbanın e-postasına 5 (tek IP'den, IP sınırının
 * ALTINDA) yanlış parola gönderip kurbanı 15 dakika kilitlemesine izin
 * veriyordu — DOĞRU parola bile reddediliyordu, döngü sürdürülürse kurban
 * SÜRESİZ dışarıda tutulabilirdi. Kart bu ödünleşimi açıkça sormuştu; bu
 * sürüm İKİ KATMANLI bir tasarımla yanıtlıyor:
 *
 * 1. E-POSTA+IP bileşik kilit (SIKI, HIZLI): TEK bir saldırgan/IP'nin aynı
 *    hesaba karşı hızlı tahmin denemesini `MAX_FAILED_ATTEMPTS_PER_IP` (3)
 *    denemede durdurur. Bu, kurbanı DEĞİL, yalnız O SALDIRGAN IP'yi o
 *    hesaba karşı kilitler — kurban BAŞKA bir IP'den (kendi telefonu,
 *    kendi evi) giriş yapmaya devam edebilir.
 * 2. E-POSTA-YALNIZ hesap-geneli kilit (GEVŞETİLDİ): eşik 5'ten
 *    `MAX_FAILED_LOGIN_ATTEMPTS` (10)'a çıkarıldı, süre 15 dakikadan
 *    `LOGIN_LOCK_DURATION_SECONDS` (5 dakika)'ya düşürüldü. Bu katman hâlâ
 *    var — kartın "dağıtık credential stuffing" hedefi bunu GEREKTİRİYOR
 *    (yalnız katman 1'e güvenilse saldırgan her denemede IP değiştirip
 *    katman 1'i asla tetiklemeden sınırsız dener). Ama artık bu eşiğe
 *    ulaşmak için saldırganın EN AZ ⌈10/3⌉=4 FARKLI IP kullanması
 *    ZORUNLU (her IP katman-1'de en fazla 3 deneme yapabilir) — bu,
 *    "dağıtık" kelimesinin gerçek bir maliyet karşılığı olmasını sağlıyor.
 *    Ve tetiklense bile kurban artık 15 değil 5 dakika bekliyor.
 *
 * REDDEDİLEN ALTERNATİF — yalnız e-posta+IP kilidi (katman 1 TEK BAŞINA):
 * saldırgan her denemede IP değiştirirse (gerçek dağıtık stuffing SENARYOSU,
 * kartın tanımladığı TEHDİT MODELİNİN TAM OLARAK KENDİSİ) hiçbir zaman
 * katman-1 eşiğine ulaşmaz — hesap SINIRSIZ tahmine açık kalır. Bu, kartın
 * "dağıtık credential stuffing'i hedefler" ölçüm kriterini SIFIRA indirir;
 * reddedildi.
 *
 * Doğru bulunan ve DOKUNULMAYAN kısım: e-posta normalizasyonu
 * (`trim().toLowerCase()`, `emailSchema`ile tutarlı).
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 10
export const LOGIN_LOCK_WINDOW_SECONDS = 15 * 60
export const LOGIN_LOCK_DURATION_SECONDS = 5 * 60

export const MAX_FAILED_ATTEMPTS_PER_IP = 3
export const IP_EMAIL_LOCK_WINDOW_SECONDS = 15 * 60
export const IP_EMAIL_LOCK_DURATION_SECONDS = 15 * 60

export interface LoginLockStatus {
  locked: boolean
  retryAfterSeconds: number
}

function normalize(identifier: string): string {
  return identifier.trim().toLowerCase()
}

function accountLockKey(email: string): string {
  return hashIdentifier('credential-lockout', normalize(email))
}

function ipEmailLockKey(email: string, ip: string): string {
  return hashIdentifier('credential-lockout-ip', `${normalize(email)}:${ip}`)
}

function lockStatusFromDoc(lockedUntil: Date | null): LoginLockStatus {
  if (lockedUntil === null) return { locked: false, retryAfterSeconds: 0 }
  const remainingMs = lockedUntil.getTime() - Date.now()
  if (remainingMs <= 0) return { locked: false, retryAfterSeconds: 0 }
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) }
}

function combine(a: LoginLockStatus, b: LoginLockStatus): LoginLockStatus {
  if (!a.locked && !b.locked) return { locked: false, retryAfterSeconds: 0 }
  return { locked: true, retryAfterSeconds: Math.max(a.retryAfterSeconds, b.retryAfterSeconds) }
}

/**
 * Yazma YAPMADAN yalnız mevcut kilit durumunu okur — argon2'den ÖNCE
 * çağrılır. İKİ katman da (hesap-geneli VE e-posta+IP) okunur; İKİSİNDEN
 * BİRİ bile kilitliyse (locked=true) kısa devre yapılır.
 */
export async function getLoginLockStatus(email: string, ip: string): Promise<LoginLockStatus> {
  const collection = await getRateLimitCollection()
  const [accountDoc, ipEmailDoc] = await Promise.all([
    collection.findOne({ _id: accountLockKey(email) }),
    collection.findOne({ _id: ipEmailLockKey(email, ip) }),
  ])
  return combine(
    lockStatusFromDoc(accountDoc?.lockedUntil ?? null),
    lockStatusFromDoc(ipEmailDoc?.lockedUntil ?? null),
  )
}

async function bumpFailureCounter(
  collection: Collection<RateLimitBucketDoc>,
  key: string,
  maxAttempts: number,
  lockDurationSeconds: number,
  windowSeconds: number,
): Promise<LoginLockStatus> {
  const now = Date.now()
  const lockUntilCandidate = new Date(now + lockDurationSeconds * 1000)
  const windowExpireAt = new Date(now + windowSeconds * 1000)
  const lockExpireAt = new Date(lockUntilCandidate.getTime() + 60_000)

  const doc = await collection.findOneAndUpdate(
    { _id: key },
    [
      { $set: { failCount: { $add: [{ $ifNull: ['$failCount', 0] }, 1] } } },
      {
        $set: {
          lockedUntil: {
            $cond: [{ $gte: ['$failCount', maxAttempts] }, lockUntilCandidate, null],
          },
        },
      },
      {
        $set: {
          expireAt: { $cond: [{ $ne: ['$lockedUntil', null] }, lockExpireAt, windowExpireAt] },
        },
      },
    ],
    { upsert: true, returnDocument: 'after' },
  )

  return lockStatusFromDoc(doc?.lockedUntil ?? null)
}

/**
 * BAŞARISIZ girişten SONRA çağrılır (yalnız `getLoginLockStatus` zaten
 * kilitli DEMEDİYSE). İKİ sayaç da AYRI belgelerde, AYRI eşiklerle
 * artırılır (HIGH-2 — bkz. dosya başı yorumu).
 */
export async function recordLoginFailure(email: string, ip: string): Promise<LoginLockStatus> {
  const collection = await getRateLimitCollection()
  const [accountStatus, ipEmailStatus] = await Promise.all([
    bumpFailureCounter(
      collection,
      accountLockKey(email),
      MAX_FAILED_LOGIN_ATTEMPTS,
      LOGIN_LOCK_DURATION_SECONDS,
      LOGIN_LOCK_WINDOW_SECONDS,
    ),
    bumpFailureCounter(
      collection,
      ipEmailLockKey(email, ip),
      MAX_FAILED_ATTEMPTS_PER_IP,
      IP_EMAIL_LOCK_DURATION_SECONDS,
      IP_EMAIL_LOCK_WINDOW_SECONDS,
    ),
  ])
  return combine(accountStatus, ipEmailStatus)
}

/**
 * Başarılı girişte İKİ sayaç da sıfırlanır: hesap-geneli (tüm IP'ler için
 * yeniden güven) VE bu belirli e-posta+IP eşleşmesi (bu IP artık bu hesap
 * için "temiz").
 */
export async function recordLoginSuccess(email: string, ip: string): Promise<void> {
  const collection = await getRateLimitCollection()
  await Promise.all([
    collection.deleteOne({ _id: accountLockKey(email) }),
    collection.deleteOne({ _id: ipEmailLockKey(email, ip) }),
  ])
}
