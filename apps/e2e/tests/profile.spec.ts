import { randomUUID } from 'node:crypto'
import { DATA_ATTR, TESTID } from '@xox/shared'
import { expect, type Page, test } from '@playwright/test'
import { MongoClient } from 'mongodb'
import { storageStatePath } from '../fixtures/auth'

/**
 * E2E-004 — KK-080…083 (profil + tema). `apps/e2e/fixtures/**` ve
 * `playwright.config.ts` bu görevde DEĞİŞTİRİLMEDİ (kart şartı).
 *
 * KK-006'nın "tam biçimi" (`/profil` gerçekten 200 döner) zaten
 * `session-persistence.spec.ts`te yeşil — burada TEKRARLANMAZ (aynı iddiayı
 * ikinci bir dosyada koşmak sinyal eklemez, yalnız süre ekler); bu dosyada QA
 * koşusu sırasında o dosya da GATE'in parçası olarak ayrıca doğrulandı (bkz.
 * rapor).
 */

/** `auth-register.spec.ts`teki KK-001 kalıbıyla AYNI: her testte TEKİL bir
 * misafir kullanıcı kaydeder — paylaşılan `e2e-user-1/2` stats/tema
 * durumunu KİRLETMEZ, paralel koşularla e-posta çakışması YAŞANMAZ. */
async function registerFreshUser(page: Page): Promise<{ email: string; displayName: string }> {
  const unique = randomUUID().slice(0, 8)
  const email = `qa-e2e-profile-${unique}@xox.test`
  const displayName = `QA Profil ${unique}`
  const password = 'GecerliParola123'

  await page.goto('/kayit')
  await page.getByLabel('Görünen ad').fill(displayName)
  await page.getByTestId(TESTID.girisEposta).fill(email)
  await page.getByTestId(TESTID.girisParola).fill(password)
  await page.getByTestId(TESTID.btnKayit).click()
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 })

  return { email, displayName }
}

interface UserDoc {
  readonly _id: string
  readonly name: string
  readonly email: string
  readonly stats: { wins: number; losses: number; draws: number }
  readonly elo: number
}

/**
 * `computer.spec.ts`teki KK-027 Atlas doğrulamasıyla AYNI kalıp: Playwright
 * soyutlaması olmadan `users` koleksiyonuna doğrudan bağlanır. KK-080'in
 * "sayılar `users.stats` ile birebir eşittir" iddiası DOM'a bakarak
 * KANITLANAMAZ — hangi sayının doğru olduğunu bilen tek kaynak Atlas'ın
 * kendisidir.
 */
async function fetchUser(userId: string): Promise<UserDoc | null> {
  const uri = process.env['MONGODB_URI']
  const dbName = process.env['MONGODB_DB']
  if (uri === undefined || dbName === undefined) {
    throw new Error('MONGODB_URI/MONGODB_DB tanımlı değil — Atlas doğrulaması BLOKE.')
  }
  if (dbName !== 'xox_test') {
    throw new Error(`BLOKE: MONGODB_DB 'xox_test' değil (alınan: '${dbName}').`)
  }
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const users = client.db(dbName).collection<UserDoc>('users')
    return await users.findOne({ _id: userId })
  } finally {
    await client.close()
  }
}

test.describe('E2E-004 · KK-081 · yeni kullanıcı başlangıç değerleri', () => {
  test('yeni kullanıcının üç sayacı da 0, ELO 1200', async ({ page }) => {
    await registerFreshUser(page)

    await page.goto('/profil')
    await expect(page.getByTestId(TESTID.istatistikGalibiyet)).toHaveText('0')
    await expect(page.getByTestId(TESTID.istatistikMaglubiyet)).toHaveText('0')
    await expect(page.getByTestId(TESTID.istatistikBeraberlik)).toHaveText('0')
    await expect(page.getByTestId(TESTID.eloPuani)).toHaveText('1200')
  })
})

test.describe('E2E-004 · KK-080 · profil görünümü Atlas ile birebir', () => {
  test('/profil görünen adı, e-postayı ve sayaçları users.stats ile birebir gösterir', async ({
    browser,
  }) => {
    // Sayaçlar bu preview'ı paylaşan ÖNCEKİ e2e koşularıyla birikmiş olabilir
    // (DB-005'ten sonra `seedTestUsers` `$set` kullanıyor, yani sıfırlamıyor)
    // — "0 bekle" YANLIŞ bir iddia olurdu. Bunun yerine Atlas'taki GERÇEK
    // değer ÖNCE okunur, DOM ona göre karşılaştırılır (KK-080'in "birebir"
    // sözü tam olarak budur, sabit bir sayı DEĞİL).
    const before = await fetchUser('e2e-user-1')
    expect(before, 'e2e-user-1 seed edilmemiş — önce seed çalıştırılmalı').not.toBeNull()
    if (before === null) return

    const context = await browser.newContext({ storageState: storageStatePath('playerOne') })
    const page = await context.newPage()
    await page.goto('/profil')

    await expect(page.getByRole('main').getByLabel('Görünen ad')).toHaveValue(before.name)
    await expect(page.getByText(before.email)).toBeVisible()
    await expect(page.getByTestId(TESTID.istatistikGalibiyet)).toHaveText(String(before.stats.wins))
    await expect(page.getByTestId(TESTID.istatistikMaglubiyet)).toHaveText(
      String(before.stats.losses),
    )
    await expect(page.getByTestId(TESTID.istatistikBeraberlik)).toHaveText(
      String(before.stats.draws),
    )
    await expect(page.getByTestId(TESTID.eloPuani)).toHaveText(String(before.elo))

    await context.close()
  })
})

test.describe('E2E-004 · KK-082 · görünen ad düzenleme', () => {
  test('2-40 karakter aralığında değiştirilebilir; kaydedilince sayfa yenilemesinden sonra yeni ad görünür', async ({
    page,
  }) => {
    await registerFreshUser(page)
    await page.goto('/profil')

    const newName = `Yeni Ad ${randomUUID().slice(0, 6)}`
    const nameField = page.getByRole('main').getByLabel('Görünen ad')
    await nameField.fill(newName)
    await page.getByRole('button', { name: 'Kaydet' }).click()

    // Kaydedildi mesajı (`tr.profile.nameSaved`) GÖRÜNENE kadar bekle — ağ
    // isteği asenkron, sabit sleep YOK.
    await expect(page.getByText('Adın güncellendi.')).toBeVisible()

    // KK-082'nin asıl iddiası SAYFA YENİLENDİKTEN SONRA: `EditNameForm`'un
    // yerel state'i DEĞİL, sunucudan taze `GET /api/profile` doğrulanıyor.
    await page.reload()
    await expect(page.getByRole('main').getByLabel('Görünen ad')).toHaveValue(newName)
  })

  test('aralık dışı ad (2 karakterden kısa) sunucu tarafında 400 INVALID_NAME ile reddedilir', async ({
    page,
  }) => {
    // KK-003/082: sunucu kapısı. `EditNameForm`'un `minLength=2` HTML kısıtı
    // formu hiç GÖNDERMEZ (tarayıcı yerel doğrulaması), bu yüzden GERÇEK
    // sunucu kapısını sınamak için istek DOĞRUDAN `context.request` ile
    // atılıyor — aynı çerez kavanozunu paylaşır (`fixtures/auth.ts` HİÇ
    // değiştirilmedi, bu yalnız bu dosyaya özgü bir istek).
    await registerFreshUser(page)

    const response = await page.context().request.patch('/api/profile', {
      data: { name: 'A' },
    })
    expect(response.status()).toBe(400)
    const body = (await response.json()) as { code?: string }
    expect(body.code).toBe('INVALID_NAME')
  })
})

test.describe('E2E-004 · KK-083 · tema seçimi', () => {
  test('koyu temaya alınca <html data-tema="koyu"> olur ve sayfa yenilemesinden sonra korunur', async ({
    page,
  }) => {
    await registerFreshUser(page)
    await page.goto('/profil')

    // Varsayılan tema `acik` (users.theme şema varsayılanı) — değişmeden
    // önce sanity kontrolü.
    await expect(page.locator('html')).toHaveAttribute(DATA_ATTR.tema, 'acik')

    await page.getByRole('button', { name: 'Koyu' }).click()
    await expect(page.locator('html')).toHaveAttribute(DATA_ATTR.tema, 'koyu')

    // KK-083'ün asıl iddiası: seçim SAYFA YENİLEMESİNDEN SONRA korunur —
    // `lib/theme.ts`in `resolveTheme()`'i SSR'da `xox-tema` çerezini okur
    // (`ProfileContent.tsx`'in `applyThemeLocally`si yazmıştı), istemci
    // state'i DEĞİL.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute(DATA_ATTR.tema, 'koyu')
    await expect(page.getByRole('button', { name: 'Koyu' })).toHaveAttribute('aria-pressed', 'true')
  })
})
