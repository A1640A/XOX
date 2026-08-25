import path from 'node:path'
import { test as base, type BrowserContext, type Page } from '@playwright/test'
import { TESTID } from '@xox/shared'

/**
 * `packages/db/src/seed.ts` ile BİREBİR aynı sabit kullanıcılar. Kimlikler ve
 * parola orada dondurulmuş — burada YİNELENMEZ, yalnız e-posta/ad eşlenir.
 * Testler `MONGODB_DB=xox_test pnpm --filter @xox/db seed` çalıştırıldığını
 * VARSAYAR (global-setup.ts önce `/api/health`'in `db`sini doğrular, sonra bu
 * kullanıcılarla giriş dener — kullanıcı yoksa giriş adımı kendisi patlar ve
 * hatayı açıkça gösterir).
 */
export const TEST_USERS = {
  playerOne: { id: 'e2e-user-1', name: 'Test Oyuncu 1', email: 'e2e1@xox.test' },
  playerTwo: { id: 'e2e-user-2', name: 'Test Oyuncu 2', email: 'e2e2@xox.test' },
} as const

export type TestUserKey = keyof typeof TEST_USERS

/**
 * `packages/db/src/seed.ts`'teki `TEST_USER_PASSWORD` ile AYNI değer. Bilerek
 * DIŞA VERİLMEZ (knip bulgusu) — yalnız `loginAndSaveState` içinde kullanılır;
 * testlerin KENDİSİ parolaya hiç ihtiyaç duymamalı, giriş `global-setup.ts`'te
 * BİR KEZ yapılıp storageState'e gömülüyor.
 */
const TEST_USER_PASSWORD = 'XoxTest!2026'

/**
 * `apps/e2e/test-results/` zaten `.gitignore`'da (kök dosyaya dokunmadan aynı
 * muafiyeti miras alıyoruz) — storageState JSON'ları asla commit edilmez,
 * içinde gerçek oturum çerezi taşırlar.
 */
const STORAGE_DIR = path.join(process.cwd(), 'test-results', '.auth')

export function storageStatePath(user: TestUserKey): string {
  return path.join(STORAGE_DIR, `${user}.json`)
}

interface AuthFixtures {
  /**
   * `e2e-user-1` (`playerOne`) / `e2e-user-2` (`playerTwo`) storageState'i ile
   * açılmış bağımsız bir tarayıcı bağlamı. `global-setup.ts` bu dosyaları BİR
   * KEZ üretir (giriş formunu doldurup gönderir); testler yalnız OKUR.
   */
  readonly playerOneContext: BrowserContext
  readonly playerTwoContext: BrowserContext
  readonly playerOnePage: Page
  readonly playerTwoPage: Page
}

/**
 * Dalga 1'in pes/rövanş, Dalga 2'nin süre aşımı, Dalga 3'ün emoji/arkadaş
 * testleri hep "iki GERÇEK, önceden kimliklendirilmiş oyuncu" ister — bu
 * fixture'lar tam da bunu verir ve imza değişmeden kalabilir: yeni bir senaryo
 * her zaman `playerOnePage`/`playerTwoPage`'i (ya da bunları saran
 * `twoPlayers`'ı) enjekte eder, kendi context'ini KURMAZ.
 */
export const test = base.extend<AuthFixtures>({
  playerOneContext: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: storageStatePath('playerOne') })
    await use(context)
    await context.close()
  },
  playerTwoContext: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: storageStatePath('playerTwo') })
    await use(context)
    await context.close()
  },
  playerOnePage: async ({ playerOneContext }, use) => {
    const page = await playerOneContext.newPage()
    await use(page)
  },
  playerTwoPage: async ({ playerTwoContext }, use) => {
    const page = await playerTwoContext.newPage()
    await use(page)
  },
})

export { expect } from '@playwright/test'

/**
 * `global-setup.ts` tarafından çağrılır — testin KENDİSİ değil. Giriş formunu
 * UI üzerinden doldurup gönderir (Auth.js'in dahili CSRF akışını yeniden
 * uygulamaya çalışmak yerine gerçek kullanıcı yolunu kullanır, bu yüzden
 * Auth.js sürüm/çerez adı değişse bile kırılmaz) ve bağlamın storageState'ini
 * diske yazar.
 */
export async function loginAndSaveState(
  context: BrowserContext,
  user: TestUserKey,
  baseURL: string,
): Promise<void> {
  const { email } = TEST_USERS[user]
  const page = await context.newPage()
  await page.goto(`${baseURL}/giris`)
  await page.getByTestId(TESTID.girisEposta).fill(email)
  await page.getByTestId(TESTID.girisParola).fill(TEST_USER_PASSWORD)
  await page.getByTestId(TESTID.btnGiris).click()
  await page.waitForURL((url) => url.pathname === '/')
  await context.storageState({ path: storageStatePath(user) })
  await page.close()
}
