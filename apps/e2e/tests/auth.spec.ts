import { randomUUID } from 'node:crypto'
import { DATA_ATTR, TESTID } from '@xox/shared'
import { expect, type Page, test } from '@playwright/test'
import { TEST_USERS } from '../fixtures/auth'

/**
 * E2E-002 — kimlik hataları (KK-002, KK-005, KK-007, KK-011). Kara kutu:
 * `apps/web`/`packages/**` yalnız OKUNUR.
 *
 * `TEST_USER_PASSWORD` `fixtures/auth.ts`'te BİLİNÇLİ DIŞA VERİLMEZ (dosyanın
 * kendi yorumu: testler parolaya ihtiyaç duymamalı, giriş storageState'e
 * gömülü gelir). KK-007'nin ikinci yarısı ("giriş sonrası istenen yola döner")
 * TAM OLARAK bunun istisnası: kasıtlı olarak KİMLİKSİZ bir context'ten
 * gerçek bir UI girişi yapılması gerekiyor. `packages/db/src/seed.ts`'teki
 * `TEST_USER_PASSWORD` değeriyle BİREBİR aynı sabit burada YİNELENİR — bu,
 * `fixtures/auth.ts`'in KENDİSİNİN de zaten yaptığı, dondurulmuş dosyaya
 * dokunmadan aynı deseni izleyen bir kopyadır.
 */
const TEST_USER_PASSWORD = 'XoxTest!2026'

const PROTECTED_PATHS = ['/oyna/bilgisayar', '/oda/YENI', '/oda/ABC234', '/profil'] as const

test.describe('KK-002 · kayıtlı e-postayla kayıt', () => {
  test('form kalır, 409, hata-mesaji EMAIL_TAKEN', async ({ page }) => {
    await page.goto('/kayit')
    const responsePromise = page.waitForResponse((r) => r.url().includes('/api/auth/register'))
    await page.getByLabel('Görünen ad').fill('Zaten Kayitli Deneme')
    await page.getByTestId(TESTID.girisEposta).fill(TEST_USERS.playerOne.email)
    await page.getByTestId(TESTID.girisParola).fill('BaskaBirGecerliParola1')
    await page.getByTestId(TESTID.btnKayit).click()

    const response = await responsePromise
    expect(response.status()).toBe(409)

    // Form KALIR — /kayit'te kalınır, /'a yönlenmez.
    await expect(page).toHaveURL(/\/kayit$/)

    const err = page.getByTestId(TESTID.hataMesaji)
    await expect(err).toHaveAttribute(DATA_ATTR.kod, 'EMAIL_TAKEN')
    await expect(err).toHaveText('Bu e-posta zaten kayıtlı.')
  })
})

test.describe('KK-005 · giriş hataları e-posta varlığını ayırt etmez', () => {
  async function attemptLogin(
    page: Page,
    email: string,
    password: string,
  ): Promise<{ status: number }> {
    await page.goto('/giris')
    const responsePromise = page.waitForResponse((r) =>
      r.url().includes('/api/auth/callback/credentials'),
    )
    await page.getByTestId(TESTID.girisEposta).fill(email)
    await page.getByTestId(TESTID.girisParola).fill(password)
    await page.getByTestId(TESTID.btnGiris).click()
    const response = await responsePromise
    return { status: response.status() }
  }

  test('yanlış parola: 401 ve "E-posta veya parola hatalı."', async ({ page }) => {
    const { status } = await attemptLogin(page, TEST_USERS.playerOne.email, 'KesinlikleYanlis1')
    expect(status).toBe(401)

    const err = page.getByTestId(TESTID.hataMesaji)
    await expect(err).toHaveAttribute(DATA_ATTR.kod, 'INVALID_CREDENTIALS')
    await expect(err).toHaveText('E-posta veya parola hatalı.')
  })

  test('kayıtsız e-posta: AYNI 401, AYNI kod, AYNI metin', async ({ page }) => {
    const unique = randomUUID().slice(0, 8)
    const { status } = await attemptLogin(
      page,
      `qa-e2e-yok-${unique}@xox.test`,
      'HerhangiBirParola1',
    )
    expect(status).toBe(401)

    const err = page.getByTestId(TESTID.hataMesaji)
    await expect(err).toHaveAttribute(DATA_ATTR.kod, 'INVALID_CREDENTIALS')
    await expect(err).toHaveText('E-posta veya parola hatalı.')
  })
})

test.describe('KK-007 · korumalı rotalar oturumsuz istemciyi /giris?donus=…e yönlendirir', () => {
  for (const path of PROTECTED_PATHS) {
    test(`${path} → 307 → /giris?donus=${path} → giriş sonrası ${path}'e döner`, async ({
      page,
      request,
    }) => {
      // Ham HTTP katmanı: gerçek 307 durum kodu + Location başlığı
      // (tarayıcı yönlendirmeleri sessizce izler, bu yüzden ayrı bir
      // yönlendirme-izlemeyen istek gerekiyor).
      const direct = await request.get(path, { maxRedirects: 0 })
      expect(direct.status()).toBe(307)
      const location = direct.headers()['location'] ?? ''
      expect(location).toContain(`/giris?donus=${encodeURIComponent(path)}`)

      // Gerçek tarayıcı akışı: git → /giris'e düş → giriş yap → istenen yola dön.
      await page.goto(path)
      await expect(page).toHaveURL(/\/giris\?donus=/)
      expect(new URL(page.url()).searchParams.get('donus')).toBe(path)

      await page.getByTestId(TESTID.girisEposta).fill(TEST_USERS.playerOne.email)
      await page.getByTestId(TESTID.girisParola).fill(TEST_USER_PASSWORD)
      await page.getByTestId(TESTID.btnGiris).click()

      await page.waitForURL((url) => url.pathname === path, { timeout: 10_000 })
    })
  }
})

test.describe("KK-011 · çıkış sonrası /profil isteği /giris'e yönlenir", () => {
  test('çıkış yap → /profil → /giris', async ({ browser }) => {
    // Kendi bağımsız context'i: `fixtures/auth.ts`in paylaşılan storageState
    // dosyasını MUTASYONA UĞRATMAMAK için (bu test oturumu SONLANDIRIR),
    // `playerOneContext` fixture'ı YERİNE burada elle bir giriş yapılır.
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/giris')
    await page.getByTestId(TESTID.girisEposta).fill(TEST_USERS.playerOne.email)
    await page.getByTestId(TESTID.girisParola).fill(TEST_USER_PASSWORD)
    await page.getByTestId(TESTID.btnGiris).click()
    await page.waitForURL((url) => url.pathname === '/')

    await page.goto('/profil')
    await expect(page).toHaveURL(/\/profil$/)

    // `components/profile/ProfileContent.tsx`: "Çıkış yap" düğmesinin
    // `data-testid`'i yok — metin `tr.auth.signOut`'tan BİREBİR kopyalanır.
    await page.getByRole('button', { name: 'Çıkış yap' }).click()
    await page.waitForURL((url) => url.pathname === '/')

    await page.goto('/profil')
    await expect(page).toHaveURL(/\/giris/)

    await context.close()
  })
})
