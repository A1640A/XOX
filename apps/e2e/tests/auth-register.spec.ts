import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { TESTID } from '@xox/shared'

/**
 * KK-001: `/kayit`'te geçerli e-posta + ≥8 karakter parola + görünen ad girilirse
 * kullanıcı oluşur, oturum otomatik açılır (`signIn`, `KayitForm.tsx`), `/`'a
 * yönlenir ve görünen ad sayfada görünür (`tr.home.welcome`).
 *
 * Bilerek `@playwright/test`'in ÇIPLAK `test`'i kullanılır (`fixtures/auth.ts`
 * DEĞİL) — bu bir MİSAFİR akışı, önceden kimliklendirilmiş storageState
 * burada YANLIŞ olurdu. E-posta her koşuda `randomUUID` ile TEKİLLEŞTİRİLİR:
 * preview `xox_test`'i paylaşan paralel koşular birbirinin `EMAIL_TAKEN`
 * hatasına çarpmasın diye (aynı sınıfın bir örneği: sabit e-posta ikinci
 * koşuda 409 döner ve test kırmızı olur).
 */
test.describe('KK-001 · kayıt ol', () => {
  test('geçerli bilgilerle kayıt olan kullanıcı otomatik giriş yapar ve ana sayfaya yönlenir', async ({
    page,
  }) => {
    const unique = randomUUID().slice(0, 8)
    const email = `qa-e2e-${unique}@xox.test`
    const displayName = `QA Oyuncu ${unique}`
    const password = 'GecerliParola123'

    await page.goto('/kayit')
    await page.getByLabel('Görünen ad').fill(displayName)
    await page.getByTestId(TESTID.girisEposta).fill(email)
    await page.getByTestId(TESTID.girisParola).fill(password)
    await page.getByTestId(TESTID.btnKayit).click()

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 })
    await expect(page.getByText(`Hoş geldin, ${displayName}`)).toBeVisible()
  })
})
