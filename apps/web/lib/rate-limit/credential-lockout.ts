import { getRateLimitCollection } from './collection'
import { hashIdentifier } from './hash'

/**
 * SEC-002 (b) — kimlik başına deneme sayacı/kilit, dağıtık credential
 * stuffing'i hedefler (tek IP sınırının kaçırdığı sınıf). `MAX_FAILED_ATTEMPTS`
 * ardışık BAŞARISIZ deneme sonrası kimlik `LOCK_DURATION_SECONDS` boyunca
 * kilitlenir. Sayaç e-posta VAR OLSUN YA DA OLMASIN aynı şekilde işler —
 * kullanıcı numaralandırmasını kapatan asıl mekanizma bu (kilit kararı hiçbir
 * zaman `User` koleksiyonuna bakmaz, yalnız ham (hash'lenmiş) e-posta
 * dizesine bakar).
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5
export const LOGIN_LOCK_WINDOW_SECONDS = 15 * 60
export const LOGIN_LOCK_DURATION_SECONDS = 15 * 60

export interface LoginLockStatus {
  locked: boolean
  retryAfterSeconds: number
}

function lockKey(identifier: string): string {
  return hashIdentifier('credential-lockout', identifier.trim().toLowerCase())
}

/** Yazma YAPMADAN yalnız mevcut kilit durumunu okur — argon2'den ÖNCE çağrılır. */
export async function getLoginLockStatus(identifier: string): Promise<LoginLockStatus> {
  const collection = await getRateLimitCollection()
  const doc = await collection.findOne({ _id: lockKey(identifier) })
  return lockStatusFromDoc(doc?.lockedUntil ?? null)
}

function lockStatusFromDoc(lockedUntil: Date | null): LoginLockStatus {
  if (lockedUntil === null) return { locked: false, retryAfterSeconds: 0 }
  const remainingMs = lockedUntil.getTime() - Date.now()
  if (remainingMs <= 0) return { locked: false, retryAfterSeconds: 0 }
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) }
}

/**
 * BAŞARISIZ girişten SONRA çağrılır (yalnız `getLoginLockStatus` zaten
 * kilitli DEMEDİYSE — kilitliyken tekrar tekrar yazmak gereksiz, kısa devre
 * zaten route seviyesinde argon2'yi de atlıyor). Eşik aşılırsa `lockedUntil`
 * kurulur ve `expireAt` (TTL) kilidin bitişinin biraz ötesine taşınır — kilit
 * süresi dolmadan koleksiyon belgesi silinmez.
 */
export async function recordLoginFailure(identifier: string): Promise<LoginLockStatus> {
  const now = Date.now()
  const key = lockKey(identifier)
  const lockUntilCandidate = new Date(now + LOGIN_LOCK_DURATION_SECONDS * 1000)
  const windowExpireAt = new Date(now + LOGIN_LOCK_WINDOW_SECONDS * 1000)
  const lockExpireAt = new Date(lockUntilCandidate.getTime() + 60_000)

  const collection = await getRateLimitCollection()
  const doc = await collection.findOneAndUpdate(
    { _id: key },
    [
      { $set: { failCount: { $add: [{ $ifNull: ['$failCount', 0] }, 1] } } },
      {
        $set: {
          lockedUntil: {
            $cond: [{ $gte: ['$failCount', MAX_FAILED_LOGIN_ATTEMPTS] }, lockUntilCandidate, null],
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

/** Başarılı girişte sayaç TAMAMEN sıfırlanır — sonraki yanlış deneme dizisi sıfırdan başlar. */
export async function recordLoginSuccess(identifier: string): Promise<void> {
  const collection = await getRateLimitCollection()
  await collection.deleteOne({ _id: lockKey(identifier) })
}
