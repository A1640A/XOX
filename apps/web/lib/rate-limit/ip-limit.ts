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
 * GÜVENLİK DENETİMİ — BLOCKER-2 (uydurma IP başlığıyla atlatma): önceki
 * sürüm `x-forwarded-for`'un İLK değerini `x-real-ip`'ten ÖNCE tercih
 * ediyordu. `x-forwarded-for` bir ZİNCİRDİR — Vercel'in edge'i kendi
 * çözdüğü gerçek bağlantı adresini zincire EKLER ama İSTEMCİNİN göndermiş
 * olabileceği ÖNCEKİ (ilk) halkaları SİLMEZ. Yani bir istemci
 * `X-Forwarded-For: <rastgele-ip>` başlığıyla gelirse, "ilk değer" hâlâ o
 * uydurma değerdir — istemci kontrolündedir. Saldırgan her istekte farklı
 * bir uydurma ilk değer göndererek her isteği ayrı bir bucket'a düşürüp
 * sınırı tamamen atlatabiliyordu (canlı kanıt: rapora bkz).
 *
 * `x-real-ip` GÜVENİLİR birincil kaynaktır: Vercel'in edge'i bu başlığı
 * istemciden gelen değeri ZİNCİRE EKLEYEREK değil, doğrudan TCP bağlantısını
 * sonlandırdığı kendi gördüğü adresle YENİDEN YAZARAK ayarlar — istemcinin
 * gönderdiği herhangi bir `x-real-ip` değeri edge'e ULAŞMADAN önce Vercel'in
 * kendi çözdüğü değerle değiştirilir (XFF'nin aksine, tek bir halkalık,
 * istemci tarafından ANLIK olarak yeniden yazılamayan bir alan). Bu yüzden
 * `x-real-ip` BİRİNCİL, `x-forwarded-for`'un SON (Vercel'in eklediği, yine
 * edge-kaynaklı) halkası YEDEK (yalnız `x-real-ip` yoksa — ör. yerel
 * `next dev`, Vercel edge'inden GEÇMEYEN istekler) olarak kullanılıyor.
 * Canlı sonda: aynı istek 25 kez FARKLI uydurma XFF değerleriyle (ama AYNI
 * gerçek bağlantıdan, dolayısıyla AYNI `x-real-ip`'le) atıldı, 21.'de 429
 * alındı — uydurma XFF artık HİÇBİR ŞEYİ DEĞİŞTİRMİYOR (rapora ham çıktı
 * yapıştırıldı).
 */
export function extractClientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip')
  if (realIp !== null && realIp.trim().length > 0) return realIp.trim()

  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor !== null) {
    const parts = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    const last = parts.at(-1)
    if (last !== undefined) return last
  }
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
