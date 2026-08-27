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
    // DÜZELTME (AUTH-003 — QA'nın bulduğu test artefaktı, ürün hatası DEĞİL):
    // bu iddia `5a73009` (W2-02, ad düzenleme + istatistik/ELO) ÖNCESİNDEKİ
    // `ProfileContent.tsx`i sınıyordu — o sürüm adı `<p>{session.user.name}</p>`
    // olarak DÜZ METİN basıyordu. `5a73009` bunu KASITLI OLARAK `EditNameForm`
    // (düzenlenebilir `<input>`) ile DEĞİŞTİRDİ: ad artık yalnız bir INPUT
    // DEĞERİDİR, metin düğümü değil — `getByText()` bir `<input>`ın `value`
    // özniteliğini asla eşleştirmez (DOM metin içeriği değildir), bu yüzden
    // eski iddia `5a73009`den beri preview'da SESSİZCE HİÇ ÇALIŞMIYORDU
    // (kanıt: gerçek CI koşusu error-context.md'de `textbox "Görünen ad":
    // Test Oyuncu 1` erişilebilirlik ağacında AÇIKÇA GÖRÜNÜYOR — oturum
    // BAŞARIYLA sürüyor, veri DOĞRU hidratlanıyor, yalnız test tekniği
    // input değerini "metin" sanıyordu). KK-006'nın gerçek amacı korunur:
    // ikinci context'in doğru kullanıcı verisini gösterdiğini kanıtlamak —
    // yalnız doğrulama yöntemi güncel DOM biçimine uyarlanır.
    await expect(pageB.getByRole('main').getByLabel('Görünen ad')).toHaveValue(
      TEST_USERS.playerOne.name,
    )
    await contextB.close()
  })
})
