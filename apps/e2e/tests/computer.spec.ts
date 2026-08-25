import { cellTestId, DATA_ATTR, TESTID } from '@xox/shared'
import { expect, type Page, test } from '@playwright/test'
import { MongoClient } from 'mongodb'

/**
 * E2E-002 — bilgisayara karşı oyun (KK-020…027). `apps/web`, `packages/**`
 * OKUNUR ama DEĞİŞTİRİLMEZ; bu dosya kara kutu olarak `/oyna/bilgisayar`'ı
 * gerçek bir Chromium sekmesinden sınar.
 *
 * `fixtures/auth.ts`/`fixtures/room.ts` BİLEREK kullanılmaz: `/oyna/bilgisayar`
 * KK-007 ile korumalı bir rota OLSA da (bkz. `auth.spec.ts`), buradaki
 * senaryoların oturumla hiçbir ilgisi yok — `playerOneContext` gereksiz bir
 * bağımlılık eklerdi. Bunun yerine bu dosya KENDİ context'ini `playerOne`
 * storageState'iyle (aşağıdaki `authedPage` fixture'ı) açar; bu, `fixtures/
 * auth.ts`'i DEĞİŞTİRMEDEN, yalnız onun dışa verdiği `storageStatePath`'i
 * kullanan yerel bir genişletmedir.
 *
 * Metinler `@/messages/tr` (`apps/web`, TXT-001 dondurulu ağaç) içinden BİREBİR
 * kopyalanmıştır — `apps/e2e` `apps/web`'in path alias'ını IMPORT EDEMEZ
 * (ayrı paket, proje sınırı), bu yüzden var olan `auth-register.spec.ts`
 * kalıbı (hardcode edilmiş ama yorumla kaynağına bağlanmış metin) izlenir.
 */
import { storageStatePath } from '../fixtures/auth'

const authedTest = test.extend<{ authedPage: Page }>({
  authedPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: storageStatePath('playerOne') })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

// `apps/web/messages/tr.ts` (`tr.game.*`/`tr.computer.*`) — DONMUŞ metin ağacı.
const TXT = {
  yourTurn: 'Sıra sende',
  thinking: 'Bilgisayar düşünüyor…',
  youWon: 'Kazandın!',
  youLost: 'Kaybettin.',
  draw: 'Berabere.',
  playAgain: 'Yeniden oyna',
} as const

async function currentStatus(page: Page): Promise<string> {
  return page.getByTestId(TESTID.durumMetni).innerText()
}

/** İnsanın sırası dönene (ya da oyun bitene) kadar `Bilgisayar düşünüyor…`dan çıkmayı bekler. */
async function waitPastThinking(page: Page): Promise<string> {
  await expect(async () => {
    const status = await currentStatus(page)
    expect(status).not.toBe(TXT.thinking)
  }).toPass({ timeout: 3_000, intervals: [30, 60, 120] })
  return currentStatus(page)
}

/** İlk boş hücrenin indeksini döner (0..8), tahta doluysa `null`. */
async function findEmptyCellIndex(page: Page): Promise<number | null> {
  for (let i = 0; i < 9; i++) {
    const value = await page.getByTestId(cellTestId(i)).getAttribute(DATA_ATTR.tas)
    if (value === null || value === '') return i
  }
  return null
}

/**
 * `zorluk-unbeatable` seçiliyken bir oyunu SONUNA kadar oynatır — hangi
 * hücrenin boş olduğuna bakılmaksızın ilk boş hücreye tıklanır (kasıtlı
 * "saf/optimal olmayan" insan politikası: KK-021'in iddiası TAM OLARAK budur
 * — insan NASIL oynarsa oynasın kazanamaz). Nihai `durum-metni`yi döner.
 */
async function playOneGame(page: Page): Promise<string> {
  for (let guard = 0; guard < 9; guard++) {
    const status = await currentStatus(page)
    if (status !== TXT.yourTurn) return status
    const idx = await findEmptyCellIndex(page)
    if (idx === null) return currentStatus(page)
    await page.getByTestId(cellTestId(idx)).click()
    await waitPastThinking(page)
  }
  return currentStatus(page)
}

async function resetGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: TXT.playAgain }).click()
}

async function selectUnbeatable(page: Page): Promise<void> {
  await page.getByTestId(TESTID.zorlukUnbeatable).click()
}

authedTest.describe('KK-020 · zorluk seçimi', () => {
  authedTest('üç düğme görünür, varsayılan seçili zorluk-medium', async ({ authedPage }) => {
    await authedPage.goto('/oyna/bilgisayar')
    await expect(authedPage.getByTestId(TESTID.zorlukEasy)).toBeVisible()
    await expect(authedPage.getByTestId(TESTID.zorlukMedium)).toBeVisible()
    await expect(authedPage.getByTestId(TESTID.zorlukUnbeatable)).toBeVisible()
    await expect(authedPage.getByTestId(TESTID.zorlukMedium)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(authedPage.getByTestId(TESTID.zorlukEasy)).toHaveAttribute('aria-pressed', 'false')
    await expect(authedPage.getByTestId(TESTID.zorlukUnbeatable)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

authedTest.describe('KK-021 · yenilmez zorlukta 5 tam oyun', () => {
  authedTest('5 tam oyunun hiçbirinde durum-metni "Kazandın!" olmaz', async ({ authedPage }) => {
    authedTest.setTimeout(60_000)
    await authedPage.goto('/oyna/bilgisayar')
    await selectUnbeatable(authedPage)

    const results: string[] = []
    for (let game = 0; game < 5; game++) {
      const finalStatus = await playOneGame(authedPage)
      results.push(finalStatus)
      expect(finalStatus).not.toBe(TXT.youWon)
      expect([TXT.draw, TXT.youLost]).toContain(finalStatus)
      if (game < 4) await resetGame(authedPage)
    }

    // Yokluk iddiası + dolu liste: 5 oyunun HEPSİ gerçekten tamamlandı,
    // hiçbiri "oynanmadan geçti" değil.
    expect(results).toHaveLength(5)
    expect(results.every((r) => r === TXT.draw || r === TXT.youLost)).toBe(true)
  })
})

authedTest.describe('KK-023 · bilgisayar hamlesi gecikmesi', () => {
  authedTest('insan hamlesinden sonra tahta 1000 ms içinde günceller', async ({ authedPage }) => {
    await authedPage.goto('/oyna/bilgisayar')
    await selectUnbeatable(authedPage)

    const start = Date.now()
    await authedPage.getByTestId(cellTestId(0)).click()
    await expect(async () => {
      const status = await currentStatus(authedPage)
      expect(status).not.toBe(TXT.thinking)
    }).toPass({ timeout: 1_000, intervals: [20, 40, 80] })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThanOrEqual(1_000)
  })
})

authedTest.describe('KK-024/025 · dolu/bitmiş hücreye tıklama sessizce yok sayılır', () => {
  authedTest(
    'dolu hücreye tıklamak tahtayı değiştirmez; oyun bitince boş hücreye tıklamak da değiştirmez',
    async ({ authedPage }) => {
      await authedPage.goto('/oyna/bilgisayar')
      await selectUnbeatable(authedPage)

      // Deterministik kayıp: X:0,1,3 karşısında yenilmez O optimal olarak
      // 4(merkez) -> 2(satır0 bloğu) -> 6(2-4-6 çaprazını TAMAMLAYIP kazanır)
      // oynar. Bkz. rapor §4 (elle türetilmiş, game-engine.test.ts'teki
      // "boş köşeden sonra en iyi cevap merkezdir" gözlemine dayanır).
      await authedPage.getByTestId(cellTestId(0)).click()
      await waitPastThinking(authedPage) // O -> 4
      await expect(authedPage.getByTestId(cellTestId(4))).toHaveAttribute(DATA_ATTR.tas, 'O')

      // KK-024 (sıra bilgisayardayken): 0 zaten dolu VE sıra insanda değil —
      // ikinci tıklama sessizce yok sayılmalı.
      await authedPage.getByTestId(cellTestId(0)).click({ force: true })
      await expect(authedPage.getByTestId(cellTestId(0))).toHaveAttribute(DATA_ATTR.tas, 'X')

      await authedPage.getByTestId(cellTestId(1)).click()
      await waitPastThinking(authedPage) // O -> 2 (satır0 bloğu)
      await expect(authedPage.getByTestId(cellTestId(2))).toHaveAttribute(DATA_ATTR.tas, 'O')

      // KK-024 (sıra insandayken, ama hücre dolu): 1 zaten X — tıklama yok
      // sayılmalı, hata GÖSTERİLMEZ (bu ekranda zaten hata-mesaji YOK).
      await authedPage.getByTestId(cellTestId(1)).click({ force: true })
      await expect(authedPage.getByTestId(cellTestId(1))).toHaveAttribute(DATA_ATTR.tas, 'X')
      await expect(authedPage.getByTestId(TESTID.durumMetni)).toHaveText(TXT.yourTurn)

      await authedPage.getByTestId(cellTestId(3)).click()
      await waitPastThinking(authedPage) // O -> 6, kazanır (2-4-6)

      await expect(authedPage.getByTestId(TESTID.durumMetni)).toHaveText(TXT.youLost)
      await expect(authedPage.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'yok',
      )
      await expect(authedPage.getByTestId(cellTestId(6))).toHaveAttribute(DATA_ATTR.tas, 'O')

      // KK-025: oyun bittikten sonra BOŞ bir hücreye (5) tıklamak tahtayı
      // değiştirmez; sira-gostergesi "yok" kalır.
      // Oyun bittiğinde `interactive=false` olur, `Board` hücreleri `disabled`
      // yapar — `force: true` KK-041 kalıbını izler (bkz. `fixtures/room.ts`):
      // gerçek bir tıklamayı GERÇEKTEN dener, Playwright'ın "enabled olmasını
      // bekle" aktörlük kontrolüne takılmaz.
      await expect(authedPage.getByTestId(cellTestId(5))).toHaveAttribute(DATA_ATTR.tas, '')
      await authedPage.getByTestId(cellTestId(5)).click({ force: true })
      await expect(authedPage.getByTestId(cellTestId(5))).toHaveAttribute(DATA_ATTR.tas, '')
      await expect(authedPage.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'yok',
      )
      await expect(authedPage.getByTestId(TESTID.durumMetni)).toHaveText(TXT.youLost)
    },
  )
})

authedTest.describe('KK-026 · Yeniden oyna', () => {
  authedTest(
    'tahtayı EMPTY_BOARD durumuna döndürür, seçili zorluğu korur',
    async ({ authedPage }) => {
      await authedPage.goto('/oyna/bilgisayar')
      await selectUnbeatable(authedPage)

      // Yukarıdakiyle aynı deterministik kayıp senaryosu, kısaltılmış.
      await authedPage.getByTestId(cellTestId(0)).click()
      await waitPastThinking(authedPage)
      await authedPage.getByTestId(cellTestId(1)).click()
      await waitPastThinking(authedPage)
      await authedPage.getByTestId(cellTestId(3)).click()
      await waitPastThinking(authedPage)
      await expect(authedPage.getByTestId(TESTID.durumMetni)).toHaveText(TXT.youLost)

      await resetGame(authedPage)

      for (let i = 0; i < 9; i++) {
        await expect(authedPage.getByTestId(cellTestId(i))).toHaveAttribute(DATA_ATTR.tas, '')
      }
      await expect(authedPage.getByTestId(TESTID.durumMetni)).toHaveText(TXT.yourTurn)
      await expect(authedPage.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'X',
      )
      // Zorluk korunur: unbeatable hâlâ basılı.
      await expect(authedPage.getByTestId(TESTID.zorlukUnbeatable)).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    },
  )
})

authedTest.describe('KK-027 · ağ ve veri izolasyonu (gerçek tarayıcı katmanı)', () => {
  authedTest(
    'oyun boyunca /api veya ws(s):// hedefine giden TEK bir istek yok',
    async ({ authedPage }) => {
      const suspiciousRequests: string[] = []
      // Casus SAYFA YÜKLENMEDEN ÖNCE takılır (E2E-001 dersi: yanlış zamanlama
      // "sıfır çerçeve" iddiasını anlamsız kılar).
      authedPage.on('request', (req) => {
        const url = req.url()
        if (url.includes('/api') || url.startsWith('ws://') || url.startsWith('wss://')) {
          suspiciousRequests.push(`${req.method()} ${url}`)
        }
      })

      await authedPage.goto('/oyna/bilgisayar')
      await selectUnbeatable(authedPage)
      const finalStatus = await playOneGame(authedPage)
      expect([TXT.draw, TXT.youLost, TXT.youWon]).toContain(finalStatus) // oyun GERÇEKTEN oynandı
      await resetGame(authedPage)
      await playOneGame(authedPage)

      expect(suspiciousRequests, `beklenmeyen istekler: ${suspiciousRequests.join(', ')}`).toEqual(
        [],
      )
    },
  )

  /**
   * Ağ katmanı sıfır olsa da, DÜZ İDDİA gerekmiyor demek DEĞİL: bu ikinci
   * test Atlas'a DOĞRUDAN (Playwright'ın hiçbir soyutlaması olmadan) bağlanıp
   * `users`/`games` dokümanlarını oyun ÖNCESİ ve SONRASI karşılaştırır.
   * `MONGODB_URI`/`MONGODB_DB` `global-setup.ts`in zaten doğruladığı ortamdır
   * (`xox_test`) — burada TEKRAR okunur, ayrı bir bağlantı üzerinden.
   */
  authedTest(
    'oyun öncesi/sonrası users(e2e-user-1) dokümanı ve games sayısı BİREBİR aynı',
    async ({ authedPage }) => {
      const uri = process.env['MONGODB_URI']
      const dbName = process.env['MONGODB_DB']
      if (uri === undefined || dbName === undefined) {
        throw new Error('MONGODB_URI/MONGODB_DB tanımlı değil — KK-027 Atlas doğrulaması BLOKE.')
      }
      if (dbName !== 'xox_test') {
        throw new Error(`BLOKE: MONGODB_DB 'xox_test' değil (alınan: '${dbName}').`)
      }

      const client = new MongoClient(uri)
      try {
        await client.connect()
        const db = client.db(dbName)
        const users = db.collection<{ _id: string }>('users')
        const games = db.collection('games')
        // GLOBAL `games.countDocuments()` DEĞİL: preview'ın `xox_test`
        // veritabanı bu dalgada BAŞKA paralel e2e koşularıyla PAYLAŞILIYOR
        // (ör. gerçek odalı iki-oyunculu testler) — global sayaç onların
        // yazdıklarını da yakalar ve bu testi YANLIŞ POZİTİF kırmızı yapar.
        // İddia, `e2e-user-1`'in KENDİ katılımcı olduğu oyun sayısına
        // daraltılır — asıl kriter zaten "BU kullanıcının bilgisayar oyunu
        // games'e yazılmadı", global koleksiyon büyüklüğü değil.
        const gamesCountBefore = await games.countDocuments({ participants: 'e2e-user-1' })
        const before = await users.findOne({ _id: 'e2e-user-1' })
        expect(before, 'e2e-user-1 seed edilmemiş — önce seed çalıştırılmalı').not.toBeNull()

        await authedPage.goto('/oyna/bilgisayar')
        await selectUnbeatable(authedPage)
        await playOneGame(authedPage)

        const after = await users.findOne({ _id: 'e2e-user-1' })
        const gamesCountAfter = await games.countDocuments({ participants: 'e2e-user-1' })

        expect(JSON.stringify(after)).toBe(JSON.stringify(before))
        expect(gamesCountAfter).toBe(gamesCountBefore)
      } finally {
        await client.close()
      }
    },
  )
})
