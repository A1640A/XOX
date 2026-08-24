import { createHmac } from 'node:crypto'

/**
 * SEC-002 — rate-limit koleksiyonunda ham IP/e-posta SAKLANMAZ. `AUTH_SECRET`
 * zaten var olan bir sır; yeni bir sır tanıtmadan HMAC anahtarı olarak
 * kullanılır (kapsam kısıtı: "secret asla commit edilmez", yeni env değişkeni
 * eklemek ayrı bir onay + `vercel env add` gerektirir — bundan kaçınıldı).
 *
 * Bu bir gizlilik/PII önlemidir, GÜVENLİK sınırı DEĞİL: `_id` alanı Mongo'da
 * dizinli metin olarak durur, tersine çevrilemez bir özet olması Atlas
 * sızıntısında doğrudan e-posta/IP listesi çıkmasını engeller — rate-limit
 * mantığının doğruluğu özetin DETERMİNİSTİK olmasına dayanır, gizliliğine
 * değil (namespace önekiyle çakışma da engellenir: aynı ham değer farklı
 * amaçlarla farklı anahtara düşer).
 */
export function hashIdentifier(namespace: string, raw: string): string {
  const secret = process.env['AUTH_SECRET']
  if (secret === undefined || secret === '') {
    throw new Error('AUTH_SECRET tanımlı değil — rate-limit anahtarı türetilemez.')
  }
  return createHmac('sha256', secret).update(`${namespace}:${raw}`).digest('hex')
}
