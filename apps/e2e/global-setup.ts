import { chromium, request as playwrightRequest } from '@playwright/test'
import { bypassHeaders } from './bypass-headers'
import { loginAndSaveState, TEST_USERS, type TestUserKey } from './fixtures/auth'

/**
 * BLOKE EDİCİ ön kontrol (kart E2E-001, ilk satır): herhangi bir testin
 * herhangi bir şey YAZMASINDAN önce preview'ın gerçekten `xox_test`
 * veritabanına baktığı doğrulanır. Preview yanlışlıkla `xox_prod`'a
 * bakıyorsa e2e temizliği production verisini SİLER — bu bir öneri değil,
 * koşuyu DURDURAN bir kapı. `globalSetup` testlerden ÖNCE, tek işçide çalışır;
 * burada atılan hata Playwright'ın TÜM koşuyu (hiçbir test dosyası
 * çalıştırmadan) kırmızı yapmasına yeter.
 */
async function assertTestDatabase(baseURL: string): Promise<void> {
  // OPS-008: `use.extraHTTPHeaders` BURAYA UYGULANMAZ — `globalSetup` config'in
  // `use` bloğunu okumaz, kendi context'ini kurar. Başlığı açıkça vermezsek
  // önizleme SSO duvarına çarpar ve aşağıdaki teşhis dalına düşeriz.
  const api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: bypassHeaders() })
  let body: { ok?: unknown; db?: unknown }
  try {
    const response = await api.get('/api/health')
    const raw = await response.text()
    try {
      body = JSON.parse(raw) as { ok?: unknown; db?: unknown }
    } catch {
      // JSON değil. En olası sebep Vercel Deployment Protection: `/api/health`
      // yerine HTML giriş sayfası döndü. Ham `Unexpected token '<'` hatası sebebi
      // hiç göstermediği için bir gün kaybettik (bkz. gotchas.md, OPS-008) —
      // bu dal yalnız TEŞHİS ekler, kapıyı GEVŞETMEZ: her hâlükârda fırlatıyoruz.
      // Tespit SON URL'DEN yapılıyor. Üç aday ölçülüp elendi (2026-08-26):
      //   gövde metni → SSO sayfası hash'li sınıflardan oluşan bir Next.js kabuğu;
      //                 'Authentication Required', 'vercel.com/sso' dahil yedi adayın
      //                 HİÇBİRİ gövdede geçmiyor
      //   durum kodu  → duvar 401 değil **HTTP 200** dönüyor
      //   set-cookie  → curl `_vercel_sso_nonce` görüyor ama Playwright yönlendirmeyi
      //                 TAKİP ETTİĞİ için başlık zincirde tükeniyor (headersArray'de 0 adet)
      // Geriye kalan tek kararlı iz: isteği kendi origin'imize attık, yanıt BAŞKA bir
      // origin'den (`vercel.com/login?next=/sso-api…`) döndü.
      const finalOrigin = new URL(response.url()).origin
      const sso = finalOrigin !== new URL(baseURL).origin
      throw new Error(
        `BLOKE: /api/health JSON döndürmedi (HTTP ${String(response.status())}). ` +
          (sso
            ? `İstek '${baseURL}' origin'ine gitti ama yanıt '${finalOrigin}' origin'inden döndü — ` +
              'bu dağıtım Vercel Deployment Protection (SSO) arkasında (OPS-008). ' +
              `VERCEL_AUTOMATION_BYPASS_SECRET şu an ${
                bypassHeaders()['x-vercel-protection-bypass'] === undefined
                  ? 'TANIMSIZ — GitHub secret / .env.local ekleyin'
                  : 'tanımlı ama REDDEDİLDİ — değer eskimiş olabilir, Vercel ayarından yenileyin'
              }.`
            : `Yanıtın ilk 200 karakteri: ${raw.slice(0, 200)}`),
      )
    }
  } finally {
    await api.dispose()
  }

  if (body.db !== 'xox_test') {
    throw new Error(
      `BLOKE: /api/health 'db' alanı 'xox_test' DEĞİL (alınan: '${JSON.stringify(body.db)}'). ` +
        `Preview '${baseURL}' production veya başka bir ortama bakıyor olabilir — ` +
        'hiçbir e2e testi çalıştırılmadan durduruldu.',
    )
  }
}

/**
 * `e2e-user-1`/`e2e-user-2` için storageState'i BİR KEZ üretir (testler değil,
 * bu dosya). `packages/db/src/seed.ts`'in bu kullanıcıları `xox_test`'e
 * yazmış olması ÖN KOŞULDUR (`MONGODB_DB=xox_test pnpm --filter @xox/db seed`)
 * — seed yapılmamışsa `GirisForm` `INVALID_CREDENTIALS` gösterir ve
 * `waitForURL('/')` zaman aşımına uğrayarak bu adımı okunabilir bir hatayla
 * kırar (sessizce geçmez).
 */
async function seedAuthStates(baseURL: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    for (const key of Object.keys(TEST_USERS) as TestUserKey[]) {
      // OPS-008 — burası da `use`'u okumayan ikinci yer.
      const context = await browser.newContext({ baseURL, extraHTTPHeaders: bypassHeaders() })
      await loginAndSaveState(context, key, baseURL)
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000'
  await assertTestDatabase(baseURL)
  await seedAuthStates(baseURL)
}
