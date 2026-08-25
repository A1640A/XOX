import { expect, test } from '@playwright/test'
import { storageStatePath, TEST_USERS } from '../fixtures/auth'

/**
 * KK-006 (V2 doğrulaması, R5): tarayıcı context'i KAPATILIP aynı `storageState`
 * ile açıldığında `/profil` 200 döner, `/giris`'e yönlenmez. Bu gece Auth.js
 * `jwt` callback'i TANIMLANDIĞINDA (`user` yalnız ilk girişte gelir, sonraki
 * okumalarda `undefined`) çerez SESSİZCE siliniyordu — bu test o sınıfın
 * nöbetçisi: `global-setup.ts` çerezi ÖNCEDEN üretir, buradaki iki context
 * arasında SIFIRDAN bir giriş YOKTUR, yalnız var olan çerezin okunuşu vardır.
 */
test.describe('KK-006 · oturum sürekliliği', () => {
  test('context kapatılıp aynı storageState ile yeniden açıldığında /profil erişilebilir kalır', async ({
    browser,
  }) => {
    const authFile = storageStatePath('playerOne')

    const contextA = await browser.newContext({ storageState: authFile })
    const pageA = await contextA.newPage()
    const responseA = await pageA.goto('/profil')
    expect(responseA?.status()).toBe(200)
    await expect(pageA).toHaveURL(/\/profil$/)
    await contextA.close()

    // TAMAMEN YENİ bir bağlam — AYNI storageState dosyasından. Aynı context'te
    // ikinci sekme açmak bu iddiayı KANITLAMAZ (oturum zaten bellekte
    // paylaşılır); kapatıp YENİDEN AÇMAK gerekiyor.
    const contextB = await browser.newContext({ storageState: authFile })
    const pageB = await contextB.newPage()
    const responseB = await pageB.goto('/profil')
    expect(responseB?.status()).toBe(200)
    await expect(pageB).toHaveURL(/\/profil$/)
    // `TopBar` GLOBAL üst çubukta da aynı adla bir profil bağlantısı gösterir
    // (`Link href="/profil"`) — `getByText` sayfa genelinde iki eşleşme bulup
    // strict-mode'da patlar. İçerik doğrulaması `main` bölgesine kapsanır.
    await expect(pageB.getByRole('main').getByText(TEST_USERS.playerOne.name)).toBeVisible()
    await contextB.close()
  })
})
