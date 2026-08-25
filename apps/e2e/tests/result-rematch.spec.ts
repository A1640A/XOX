import { cellTestId, DATA_ATTR, TESTID } from '@xox/shared'
import { TEST_USERS } from '../fixtures/auth'
import {
  captureWsFrames,
  createRoom,
  expectCell,
  joinRoom,
  playMove,
  waitForOpponentName,
} from '../fixtures/room'
import { expect, test, type TwoPlayers } from '../fixtures/two-players'

/**
 * E2E-003 — kriter 1/2 (sonuç), kriter 3 (pes+onay), kriter 4 (rövanş),
 * kriter 5 (iyimser hamle). `apps/e2e/fixtures/**` ve `playwright.config.ts`
 * DEĞİŞMEDİ (kriter 10).
 */

/** Top satır (0,1,2) X için kazanan bir dizilim: X:0 O:3 X:1 O:4 X:2 (X kazanır). */
async function playToTopRowWin(players: TwoPlayers): Promise<void> {
  await playMove(players.playerOne, 0) // X
  await expectCell(players.playerTwo, 0, 'X')
  await playMove(players.playerTwo, 3) // O
  await expectCell(players.playerOne, 3, 'O')
  await playMove(players.playerOne, 1) // X
  await expectCell(players.playerTwo, 1, 'X')
  await playMove(players.playerTwo, 4) // O
  await expectCell(players.playerOne, 4, 'O')
  await playMove(players.playerOne, 2) // X kazanır (0,1,2)
  await expectCell(players.playerTwo, 2, 'X')
}

test.describe('E2E-003 · kriter 1/2 · sonuç', () => {
  test('kazanan çizginin 3 hücresi HER İKİ ekranda data-kazanan=true', async ({ twoPlayers }) => {
    const code = await createRoom(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    await playToTopRowWin(twoPlayers)

    for (const page of [twoPlayers.playerOne, twoPlayers.playerTwo]) {
      for (const index of [0, 1, 2]) {
        await expect(page.getByTestId(cellTestId(index))).toHaveAttribute(DATA_ATTR.kazanan, 'true')
      }
      // KANIT: kazanmayan hücreler işaretLENMEMİŞ — "her yer true" ile
      // karışmasın diye NEGATİF kontrol de var.
      for (const index of [5, 6, 7, 8]) {
        await expect(page.getByTestId(cellTestId(index))).not.toHaveAttribute(
          DATA_ATTR.kazanan,
          'true',
        )
      }
    }

    // Kazanan (X = playerOne) rövanş isteyebiliyor; sonuç paneli her iki
    // ekranda da göründü (dolu liste — vakum test değil).
    await expect(twoPlayers.playerOne.getByTestId(TESTID.btnRovansTeklif)).toBeVisible()
    await expect(twoPlayers.playerTwo.getByTestId(TESTID.btnRovansTeklif)).toBeVisible()
  })
})

test.describe('E2E-003 · kriter 3 · pes etme + onay', () => {
  test('onaylanmadan pes ETMEZ; onaylanınca games.endReason=resign ile biter', async ({
    twoPlayers,
  }) => {
    const code = await createRoom(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    // KK-054: onay REDDEDİLİRSE hiçbir şey olmaz — oyun `playing` kalır.
    twoPlayers.playerOne.once('dialog', (dialog) => {
      void dialog.dismiss()
    })
    await twoPlayers.playerOne.getByTestId(TESTID.btnPesEt).click()
    // Kanıt: pes düğmesi hâlâ etkin (oyun bitmedi), tahta hâlâ oynanabilir durumda.
    await expect(twoPlayers.playerOne.getByTestId(TESTID.btnPesEt)).toBeEnabled()
    await expect(twoPlayers.playerOne.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      'X',
    )

    // Onaylanınca gerçekten pes eder.
    twoPlayers.playerOne.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await twoPlayers.playerOne.getByTestId(TESTID.btnPesEt).click()

    // Her iki ekranda da oyun bitti: sıra göstergesi 'yok', pes düğmesi kapandı.
    await expect(twoPlayers.playerOne.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      'yok',
    )
    await expect(twoPlayers.playerTwo.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      'yok',
    )
    await expect(twoPlayers.playerOne.getByTestId(TESTID.btnPesEt)).toBeDisabled()
    // Rakip (playerTwo, kazanan) rövanş isteyebiliyor — sonuç yalnız pes eden
    // tarafta değil, IKI TARAFTA da işlendi.
    await expect(twoPlayers.playerTwo.getByTestId(TESTID.btnRovansTeklif)).toBeVisible()

    // Otorite doğrulaması: bu test kendi `docs/board/reports/E2E-003.md`
    // raporunda ayrıca AtLAS sorgusuyla (`packages/db` üzerinden, apps/e2e
    // paketine mongoose bağımlılığı EKLENMEDEN) `endReason: 'resign'`
    // doğrulanıyor — bkz. rapor "Atlas doğrulaması" bölümü. Oda kodu konsola
    // basılır ki QA kanıtı odayla eşleşsin.
    console.warn(`KK-054 Atlas doğrulaması için oda kodu: ${code}`)
  })
})

test.describe('E2E-003 · kriter 4 · rövanş', () => {
  test('teklif ≤2 sn karşıda görünür; kabul sonrası tahta boşalır ve KOLTUKLAR YER DEĞİŞTİRİR', async ({
    twoPlayers,
  }) => {
    const code = await createRoom(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    // playerOne = X başlangıçta. Oyunu pes ederek hızlıca bitiriyoruz (sonuç
    // testi zaten çizgiyi kapsıyor, burada asıl ilgi rövanş).
    twoPlayers.playerOne.once('dialog', (dialog) => void dialog.accept())
    await twoPlayers.playerOne.getByTestId(TESTID.btnPesEt).click()
    await expect(twoPlayers.playerOne.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      'yok',
    )

    const offerStart = Date.now()
    await twoPlayers.playerOne.getByTestId(TESTID.btnRovansTeklif).click()
    // Kriter 4: teklif ≤2 sn içinde KARŞI TARAFTA görünür.
    await expect(twoPlayers.playerTwo.getByTestId(TESTID.btnRovansKabul)).toBeVisible({
      timeout: 2_000,
    })
    expect(Date.now() - offerStart).toBeLessThan(2_000)

    await twoPlayers.playerTwo.getByTestId(TESTID.btnRovansKabul).click()

    // Yeni oyun başladı: sıra tekrar X'te, tahta TAMAMEN boş.
    await expect(twoPlayers.playerOne.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      'X',
      { timeout: 5_000 },
    )
    for (let index = 0; index < 9; index += 1) {
      await expectCell(twoPlayers.playerOne, index, null)
      await expectCell(twoPlayers.playerTwo, index, null)
    }

    // KOLTUKLAR YER DEĞİŞTİRDİ: playerOne ÖNCEDEN X'ti (pes edip kaybetti);
    // rövanşta X SIRASI geldiğinde artık playerTwo'nun hücreleri etkin,
    // playerOne'ınkiler DISABLED olmalı — takas kanıtı budur (sadece
    // "board reset oldu" değil, kimin oynadığı da değişti).
    await expect(twoPlayers.playerTwo.getByTestId(cellTestId(4))).toBeEnabled()
    await expect(twoPlayers.playerOne.getByTestId(cellTestId(4))).toBeDisabled()

    // playerTwo (şimdi X) oynayabiliyor — gerçek bir tıklamayla kanıtlanır.
    await playMove(twoPlayers.playerTwo, 4)
    await expectCell(twoPlayers.playerOne, 4, 'X')
    // Sıra şimdi O'da (playerOne, TAKAS sonrası O koltuğunda) — takas kalıcı,
    // tek hamlelik bir yanılsama değil.
    await expect(twoPlayers.playerOne.getByTestId(cellTestId(0))).toBeEnabled()
    await expect(twoPlayers.playerTwo.getByTestId(cellTestId(1))).toBeDisabled()
  })
})

test.describe('E2E-003 · kriter 5 · iyimser hamle', () => {
  test('tıklamadan hemen sonra data-bekliyor=true, move:applied yankısından sonra kalkar', async ({
    twoPlayers,
  }) => {
    const code = await createRoom(twoPlayers.playerOne)
    const frames = captureWsFrames(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    await twoPlayers.playerOne.getByTestId(cellTestId(0)).click()
    // İyimser bayrak: sunucu yankısı gelmeden ÖNCE (ya da gelirken) DOM'da
    // görünür olmalı. Playwright'ın `toHaveAttribute` polling'i bunu yakalar.
    await expect(twoPlayers.playerOne.getByTestId(cellTestId(0))).toHaveAttribute(
      DATA_ATTR.bekliyor,
      'true',
    )
    // KANIT: `move` çerçevesi gerçekten GİTTİ (bayrak süs değil, gerçek bir
    // isteğin gösterimi).
    const sentMove = frames.sent.some((raw) => {
      try {
        const parsed = JSON.parse(raw) as { type?: unknown }
        return parsed.type === 'move'
      } catch {
        return false
      }
    })
    expect(sentMove).toBe(true)

    // Yankı gelince (`expectCell` X'i doğrular) bayrak KALKMIŞ olmalı.
    await expectCell(twoPlayers.playerOne, 0, 'X')
    await expect(twoPlayers.playerOne.getByTestId(cellTestId(0))).not.toHaveAttribute(
      DATA_ATTR.bekliyor,
      'true',
    )
  })
})
