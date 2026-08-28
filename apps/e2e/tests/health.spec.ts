import { expect, test } from '@playwright/test'

/**
 * E2E-005 — ortam sağlığı + gözlemlenebilirlik duman testleri (KK-100/101/104).
 *
 * `global-setup.ts`in BLOKE EDİCİ ön kontrolü (`assertTestDatabase`) zaten
 * `/api/health`in `db`sini TÜM testlerden önce doğruluyor — o kontrol
 * başarısızsa bu dosyadaki hiçbir test hiç ÇALIŞMAZ (koşu daha başlamadan
 * kırmızı biter). Bu dosyadaki `KK-101` testi öyleyse "tekrar" gibi
 * görünebilir ama DEĞİL: kartın kabul kriteri açıkça bir TEST istiyor
 * (bloke edici bir ön kontrol değil, raporlanabilir bir test sonucu) — bu
 * ayrım önemli çünkü ön kontrol başarısız olursa `qa-latest.json`da hiçbir
 * test görünmez, yalnız `globalSetup` hatası görünür; bu test AYRICA
 * `db` alanının sözleşmesini kendi başına, normal bir test satırı olarak
 * kanıtlar.
 */
test.describe('sağlık uç noktası', () => {
  test('KK-101: GET /api/health ok:true ve db:xox_test döner', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)

    const body: unknown = await response.json()
    expect(body).toMatchObject({ ok: true, db: 'xox_test' })
  })
})

test.describe('gözlemlenebilirlik (W2-04)', () => {
  /**
   * KK-104 — `@vercel/analytics`/`@vercel/speed-insights`in `next/index.js`si
   * `"use client"`tir ve script etiketini `document.createElement('script')`
   * ile bir `useEffect` İÇİNDE DOM'a ekler (ölçüldü:
   * `node_modules/@vercel/analytics/dist/next/index.js`, `injectScript`,
   * `document.head.appendChild`). Sunucunun ürettiği HTML'de bu etiket HİÇ
   * YOKTUR — `curl`/sunucu tarafı `fetch` ile YAKALANAMAZ, ölçüldü (bu görevde,
   * `next build && next start` çıktısına karşı): gerçek bir tarayıcı +
   * hidrasyon ZORUNLU.
   *
   * Enjeksiyon ayrıca `NODE_ENV` "development"/"test" İKEN BİLEREK ATLANIR
   * (`detectEnvironment()`, aynı dosya) — bu yüzden bu test yalnız
   * ÜRETİM DERLEMESİNE (`next build && next start`) karşı anlamlıdır,
   * `next dev`e karşı DEĞİL (kart notu: `next dev` StrictMode'un mount
   * effect'i iki kez çalıştırmasıyla ayrıca yanıltır — burada onunla
   * karışmasın diye ayrıca not düşülüyor, iki farklı neden aynı öneriye çıkıyor).
   *
   * Yerelde koşulduğunda `/_vercel/insights/script.js` ve
   * `/_vercel/speed-insights/script.js` istekleri gerçek Vercel edge'i
   * OLMADIĞI için ağ hatasıyla (404/bağlantı reddi) sonuçlanabilir — bu testin
   * umursadığı TEK şey enjeksiyonun KENDİSİ (DOM'a `<script src="...">`
   * eklendi mi), ağ isteğinin başarıyla YÜKLENMESİ değil. Gerçek bir Vercel
   * preview/production dağıtımında aynı script 200 ile GERÇEKTEN yüklenir.
   */
  test('KK-104: Analytics ve Speed Insights script etiketleri DOM içine enjekte edilir', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.locator('script[src*="/_vercel/insights/script.js"]')).toBeAttached({
      timeout: 10_000,
    })
    await expect(page.locator('script[src*="/_vercel/speed-insights/script.js"]')).toBeAttached({
      timeout: 10_000,
    })
  })

  test('KK-100 [ATLANDI]: xox.omerdursun.com üretim özel alan adı', () => {
    test.skip(
      true,
      "KK-100 kriteri https://xox.omerdursun.com/api/health'i (ÜRETİM özel alan adı) hedefler. " +
        'Bu paket YALNIZ `E2E_BASE_URL` (preview dağıtımı) hedefine karşı koşar; özel alan adı ' +
        "HİÇBİR preview URL'sinde çözülmez (Vercel preview'ları kendi `*.vercel.app` adresini " +
        "kullanır) — bu testi burada 'yeşil' yapmanın tek yolu `E2E_BASE_URL`i sessizce " +
        "yok sayıp sabit bir üretim URL'i çağırmak olurdu, bu da preview izolasyonunu (OPS-007 " +
        "nöbetçisinin TÜM amacı) delerdi. Kartın orijinal gerekçesi 'OPS-001 blocker'ına bağlı' " +
        "idi — board.json artık OPS-001'i 'done' işaretliyor (2026-08-25, " +
        'xox.omerdursun.com verified:true, /api/health {ok:true,db:xox_prod} canlı doğrulandı, ' +
        "bkz. board.json → OPS-001.note) — yani engel KALKTI ama bu, KK-100'ü BİR PREVIEW " +
        'KOŞUSUNDA çalıştırılabilir hale GETİRMİYOR (farklı bir hedef, farklı bir ortam sınıfı). ' +
        "Öneri (lead'e iletildi): KK-100'ü E2E-005'ten ayırıp ayrı, production-only bir smoke " +
        "job'a taşı (tetikleyici: deploy sonrası, preview run'ları değil).",
    )
  })
})
