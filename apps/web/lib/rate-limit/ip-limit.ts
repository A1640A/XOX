import { getRateLimitCollection } from './collection'
import { hashIdentifier } from './hash'

/**
 * SEC-002 (a) — kaynak tükenmesine karşı IP başına kaba hız sınırı.
 * Sabit pencere: 60 saniyede en fazla 20 POST /api/auth/* isteği. Eşik
 * bilerek CÖMERT tutuldu — kart, eşik ALTINDAKİ meşru isteğin (ör. bir
 * kullanıcının art arda birkaç kez yanlış şifre denemesi, ya da e2e/manuel
 * test akışı) hâlâ 200/401 aldığını KANITLAMAYI istiyor; çok sıkı bir eşik
 * kendi kendine DoS'a döner (kartın uyardığı tam olarak bu).
 */
export const IP_RATE_LIMIT_MAX_REQUESTS = 20
export const IP_RATE_LIMIT_WINDOW_SECONDS = 60

export interface IpRateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

/**
 * `x-forwarded-for`'un İLK adresi alınır — Vercel bu başlığı sıraya
 * istemciden başlayarak proxy zinciriyle doldurur (kendi proxy'lerini
 * sona ekler), bu yüzden ilk değer gerçek istemci IP'sidir. Değer yoksa
 * (yerel `next dev`, doğrudan bağlantı) `x-real-ip`'e, o da yoksa sabit bir
 * gruba düşülür — hepsi aynı "gerçek IP çözülemedi" grubuna girer ve birlikte
 * sınırlanır (bilinmeyen kaynaklı bir istek akınını yine de durdurur).
 */
export function extractClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor !== null) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first !== undefined && first.length > 0) return first
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp !== null && realIp.trim().length > 0) return realIp.trim()
  return 'ip-cozulemedi'
}

/**
 * Tek atomik `findOneAndUpdate` (aggregation-pipeline update) — pencere hâlâ
 * geçerliyse sayaç artırılır, süresi dolmuşsa 1'den yeniden başlar. İki eşzamanlı
 * istek arasında okuma-sonra-yazma yarışı YOK (MongoDB tek belge güncellemesini
 * atomik uygular).
 */
export async function checkIpRateLimit(
  req: Request,
  routeGroup: string,
): Promise<IpRateLimitResult> {
  const ip = extractClientIp(req)
  const key = hashIdentifier('ip-rate-limit', `${routeGroup}:${ip}`)
  const now = new Date()
  const windowExpireAt = new Date(now.getTime() + IP_RATE_LIMIT_WINDOW_SECONDS * 1000)

  const collection = await getRateLimitCollection()
  const doc = await collection.findOneAndUpdate(
    { _id: key },
    [
      {
        $set: {
          count: {
            $cond: [{ $gt: ['$expireAt', now] }, { $add: [{ $ifNull: ['$count', 0] }, 1] }, 1],
          },
          expireAt: { $cond: [{ $gt: ['$expireAt', now] }, '$expireAt', windowExpireAt] },
        },
      },
    ],
    { upsert: true, returnDocument: 'after' },
  )

  const count = doc?.count ?? 1
  const expireAt = doc?.expireAt ?? windowExpireAt
  const remaining = Math.max(0, IP_RATE_LIMIT_MAX_REQUESTS - count)
  const retryAfterSeconds = Math.max(1, Math.ceil((expireAt.getTime() - now.getTime()) / 1000))

  return {
    allowed: count <= IP_RATE_LIMIT_MAX_REQUESTS,
    limit: IP_RATE_LIMIT_MAX_REQUESTS,
    remaining,
    retryAfterSeconds,
  }
}
