import { chromium, request as playwrightRequest } from '@playwright/test'
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
  const api = await playwrightRequest.newContext({ baseURL })
  let body: { ok?: unknown; db?: unknown }
  try {
    const response = await api.get('/api/health')
    body = (await response.json()) as { ok?: unknown; db?: unknown }
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
      const context = await browser.newContext({ baseURL })
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
