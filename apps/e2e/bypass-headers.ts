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
  // YALNIZ başlık. `x-vercel-set-bypass-cookie` BİLEREK YOK — bir kez denendi ve
  // ölçülerek elendi (CI, 2026-08-27):
  //
  // O başlık Vercel'e içeriği doğrudan servis etmek yerine **araya bir 307
  // yönlendirmesi** sokturuyor (Location = isteğin KENDİSİ, çerezi kurup tekrar
  // istetmek için). Tarayıcı bunu sessizce izlediği için çoğu test etkilenmiyordu,
  // ama iki yerde kapıyı kırdı:
  //   • `auth.spec.ts` `maxRedirects: 0` ile ham 307'yi okuyor → uygulamanın
  //     `/giris?donus=…` yönlendirmesi yerine Vercel'in kendi çerez redirect'ini
  //     gördü (`Location: /oyna/bilgisayar`), 4 test kırmızı.
  //   • `smoke.spec.ts`'in ham `ws` istemcisi upgrade yerine 307 aldı
  //     ("Unexpected server response: 307").
  //
  // Çerezin ilk gerekçesi "WS upgrade başlığı taşımaz" idi; o sorun artık başlığı
  // ham `ws` istemcisine ELLE geçerek çözülüyor (`smoke.spec.ts`). Yani çerezin
  // faydası kalmadı, zararı ölçüldü. GERİ EKLEME.
  return { 'x-vercel-protection-bypass': secret }
}
