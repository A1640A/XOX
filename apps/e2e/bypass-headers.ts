/**
 * Vercel Deployment Protection ("Vercel Authentication") atlatma başlıkları — OPS-008.
 *
 * NEDEN GEREKLİ: proje `omeerdursunn` takımına taşındığında o takımın varsayılanı
 * uygulandı — `ssoProtection.enabled = true`, `deploymentType = "all_except_custom_domains"`.
 * Sonuç ikiye bölündü ve yarısı yeşil kaldığı için bir gün fark edilmedi:
 *   - `xox.omerdursun.com` (özel alan adı) → MUAF, production smoke yeşil kaldı
 *   - tüm `*.vercel.app` önizlemeleri → SSO duvarının arkasında
 * `/api/health` JSON yerine HTML giriş sayfası döndürdüğü için `response.json()`
 * `Unexpected token '<'` ile patladı — sebebi hiç göstermeyen bir hata.
 *
 * NEDEN SSO'YU KAPATMIYORUZ: Vercel'in `deploymentType` enum'unda "yalnız production'ı
 * koru" seçeneği YOK (`all` · `preview` · `prod_deployment_urls_and_all_previews`).
 * Yani önizlemeleri açmak, korumayı tamamen kaldırmak demek. Repo PUBLIC ve önizleme
 * gerçek Atlas kümesine bağlanıyor; doğru çözüm duvarı yıkmak değil, otomasyona
 * kapıdan geçiş anahtarı vermek.
 *
 * Değer `VERCEL_AUTOMATION_BYPASS_SECRET` ortam değişkeninden okunur; CI'da GitHub
 * secret'ından, yerelde `.env.local`'den (ikisi de gitignore/secret). Bu dosya
 * secret'ın KENDİSİNİ ASLA içermez.
 *
 * Değişken yoksa başlıklar hiç eklenmez: yerel `localhost` koşusunun SSO'su yoktur
 * ve orada anlamsız bir başlık göndermek istemeyiz. Önizlemeye karşı koşarken
 * eksikse duvara çarpılır — `global-setup.ts` bunu okunabilir bir hataya çevirir.
 */
export function bypassHeaders(): Record<string, string> {
  const secret = process.env['VERCEL_AUTOMATION_BYPASS_SECRET']
  if (secret === undefined || secret === '') return {}
  return {
    'x-vercel-protection-bypass': secret,
    // Yanıtla birlikte bir atlatma çerezi de kurdurur. Başlık yalnız Playwright'ın
    // kendi isteklerine eklenir; sayfanın KENDİ başlattığı yönlendirmeler,
    // `next/link` gezinmeleri ve WebSocket upgrade'i başlığı taşımaz — çerez taşır.
    // `samesitenone` şart: WS ve çapraz-bağlam isteklerde çerez aksi halde düşer.
    'x-vercel-set-bypass-cookie': 'samesitenone',
  }
}
