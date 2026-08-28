import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { bypassHeaders } from '../bypass-headers'
import { TEST_USERS } from '../fixtures/auth'

/**
 * E2E-005 · KK-090/KK-091 — mobil web hedefi (`expo export -p web`) duman
 * testi ve ortam sağlığı.
 *
 * Bu paket YALNIZ `apps/e2e` içinde yaşar (kural 1, CLAUDE.md) ve `apps/web`/
 * `apps/mobile`/`packages/**`e YAZMAZ — ama mobil web hedefinin hiçbir
 * dağıtımı (Vercel projesi, statik host, `apps/web` içinde bir rota) HENÜZ
 * YOK (board.json/W2-03 raporu doğrulandı: `dist/index.html` yalnız YEREL
 * üretiliyor, hiçbir `vercel.json`/rewrite onu servis etmiyor). Bu yüzden bu
 * dosya kendi kara kutusunu KENDİSİ kurar: `pnpm --filter @xox/mobile build`
 * çalıştırır (yalnız `apps/mobile/dist/**`e YAZAR — bu, `.gitignore`'daki
 * `dist/` altında bir DERLEME ÇIKTISIDIR, `next build`in `.next/` ürettiği
 * gibi; kaynak kodu DEĞİŞTİRMEZ) ve çıktıyı basit bir Node `http` sunucusuyla
 * servis eder. Bu boşluğun kendisi bir bulgu — rapora yazıldı.
 */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, '../../..')
const MOBILE_DIR = path.join(REPO_ROOT, 'apps/mobile')
const DIST_DIR = path.join(MOBILE_DIR, 'dist')

const API_BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
}

/**
 * `expo export -p web`in çıktısı "temiz URL" varsayar: `/giris` isteği
 * `giris.html`e karşılık gelir, istemci tarafı router (`expo-router`) da
 * `window.location.pathname`i `.html` SIZDIRMADAN okur. Bir dosyayı OLDUĞU
 * GİBİ (`fs.Server`/`python -m http.server`) servis etmek `/giris.html`
 * gerektirir — bu, hidrasyon sonrası `expo-router`ın rota eşleştirmesini
 * KIRAR ve "Unmatched Route" gösterir (BU GÖREVDE ölçüldü, gerçek bir ürün
 * hatası DEĞİL, yalnız naif bir statik sunucunun eseri). Gerçek bir dağıtım
 * (Vercel statik hosting, Netlify vb.) "clean URLs" sağlar; bu sunucu da
 * aynı sözleşmeyi taklit eder.
 */
function resolveDistFile(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/').replace(/^\/+/, '')
  const candidates = clean === '' ? ['index.html'] : [clean]
  if (clean !== '' && path.extname(clean) === '') candidates.push(`${clean}.html`)

  for (const candidate of candidates) {
    const full = path.join(DIST_DIR, candidate)
    if (existsSync(full)) return full
  }
  return null
}

interface StaticServer {
  readonly url: string
  close: () => Promise<void>
}

function startStaticServer(): Promise<StaticServer> {
  const server: Server = createServer((req, res) => {
    const file = resolveDistFile(req.url ?? '/')
    const notFound = path.join(DIST_DIR, '+not-found.html')
    const target = file ?? (existsSync(notFound) ? notFound : null)

    if (target === null) {
      res.writeHead(404)
      res.end('not found')
      return
    }

    readFile(target)
      .then((body) => {
        res.writeHead(file === null ? 404 : 200, {
          'content-type': MIME_TYPES[path.extname(target)] ?? 'application/octet-stream',
        })
        res.end(body)
      })
      .catch(() => {
        res.writeHead(500)
        res.end('sunucu hatası')
      })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('statik sunucu adresi çözülemedi'))
        return
      }
      resolve({
        url: `http://127.0.0.1:${String(address.port)}`,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => {
              res()
            })
          }),
      })
    })
  })
}

let staticServer: StaticServer

test.beforeAll(async () => {
  // KK-090: derleme her koşuda TAZE yapılır — bir önceki koşudan kalmış
  // `dist/`in (ör. farklı `EXPO_PUBLIC_API_BASE_URL`e karşı derlenmiş)
  // sessizce yeniden kullanılması, tam olarak lead'in "stale Turbo cache"
  // dersiyle AYNI SINIFTA bir yanlış-yeşil kaynağı olurdu.
  execFileSync('pnpm', ['--filter', '@xox/mobile', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: API_BASE_URL },
  })
  staticServer = await startStaticServer()
})

test.afterAll(async () => {
  await staticServer.close()
})

test.describe('KK-090 · mobil web hedefi duman testi', () => {
  test('dist/ statik olarak servis edilir ve ana ekran yüklenir', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(`${staticServer.url}/`)

      // `tr.app.name`/`tr.app.tagline` (`apps/mobile/messages/tr.ts`) — bu
      // dosya `apps/mobile`i IMPORT EDEMEZ (proje sınırı, `computer.spec.ts`
      // ile AYNI desen); metin bilerek harfiyen kopyalanır.
      await expect(page.getByText('XOX', { exact: true })).toBeVisible()
      await expect(page.getByText('Arkadaşınla ya da bilgisayara karşı oyna')).toBeVisible()

      // Yalnız statik kabuk DEĞİL, gerçek hidrasyon: oturum yoksa istemci
      // `localStorage`ı okuyup "girmedi" durumuna geçer ve giriş/kayıt
      // bağlantılarını gösterir (`session.tsx`, `restore()`).
      await expect(page.getByText('Giriş yap')).toBeVisible({ timeout: 5_000 })
      await expect(page.getByText('Kayıt ol')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('tüm expo-router statik rotaları (12) 200 döner', async ({ request }) => {
    const routes = [
      '/',
      '/giris',
      '/kayit',
      '/oyna/bilgisayar',
      '/oda/katil',
      // Statik dışa aktarımda dinamik segment DOSYA ADINDA literal olarak
      // kalır (`dist/oda/[kod].html`, expo-router'ın kendi kuralı) — gerçek
      // bir dağıtımda sunucu tarafı yönlendirme kuralı bunu herhangi bir
      // koda eşler, burada dosyanın VAR OLDUĞUNU doğrudan sınıyoruz.
      `/oda/${encodeURIComponent('[kod]')}`,
      '/profil',
      '/siralama',
      '/gecmis',
      '/arkadaslar',
      '/_sitemap',
    ]
    for (const route of routes) {
      const response = await request.get(`${staticServer.url}${route}`)
      expect(response.status(), `${route} 200 dönmedi`).toBe(200)
    }
  })
})

test.describe('BULGU · mobil web farklı origin sorunu (KK-091 ön koşulu)', () => {
  /**
   * KK-091'in İLK adımı ("giriş") mobil web hedefinde `EXPO_PUBLIC_API_BASE_URL`
   * (`apps/web`) mobil web dist'inin KENDİ servis edildiği origin'den FARKLI
   * olduğunda tamamen KIRILIR — bu WS'ten ve preview'dan BAĞIMSIZ, tamamen
   * yerelde, `next build && next start`e karşı DETERMİNİSTİK olarak
   * ölçüldü:
   *
   *   `apps/web`in HİÇBİR route'unda `Access-Control-Allow-Origin` (veya
   *   herhangi bir CORS başlığı/`OPTIONS` işleyicisi) YOK (grep ile
   *   doğrulandı). `apps/mobile/lib/auth/api.ts`nin `fetchWsTicket`/
   *   `registerAccount`/`refreshTokenPair`si `content-type: application/json`
   *   gövdeli `fetch` çağrılarıdır — tarayıcı bunları "basit istek"
   *   SAYMAZ, bir CORS ÖN KONTROLÜ (`OPTIONS`) gönderir; sunucu `OPTIONS`ı
   *   hiç işlemediği için ön kontrol REDDEDİLİR ve gerçek istek TARAYICI
   *   TARAFINDAN hiç gönderilmeden engellenir (`TypeError: Failed to fetch`,
   *   konsolda: "has been blocked by CORS policy… No 'Access-Control-Allow-
   *   Origin' header is present").
   *
   * SONUÇ: mobil web hedefi, API'yle AYNI origin'den servis edilmediği
   * sürece — kayıt, giriş köprüsünün jeton alışverişi HARİÇ (o bir tam
   * sayfa/popup YÖNLENDİRMESİdir, `fetch` değil, CORS'a tabi DEĞİL), oda
   * kurma, WS bileti alma dahil HİÇBİR kimlikli istek ÇALIŞMAZ. Bu, mobil
   * web'in NEREDE barındırılacağına dair bir mimari karar (aynı origin mi,
   * yoksa CORS başlıkları mı eklenecek) olmadan KK-091'in test edilebilir
   * OLMASININ önündeki gerçek engel — lead'e/backend'e iletildi.
   */
  test("apps/web CORS başlığı yayınlamaz — farklı origin'den kimlikli fetch engellenir", async ({
    browser,
  }) => {
    const context: BrowserContext = await browser.newContext({
      extraHTTPHeaders: bypassHeaders(),
    })
    const page: Page = await context.newPage()
    try {
      await page.goto(`${staticServer.url}/giris`)

      const result = await page.evaluate(async (apiBaseUrl: string) => {
        try {
          const response = await fetch(`${apiBaseUrl}/api/ws/ticket`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ roomCode: 'ABCDEF' }),
          })
          return { blocked: false, status: response.status }
        } catch (error) {
          return { blocked: true, message: String(error) }
        }
      }, API_BASE_URL)

      // Bu istek AYNI origin'de olsaydı 401 (oturumsuz) dönerdi; farklı
      // origin'de tarayıcı isteği HİÇ SUNUCUYA ULAŞTIRMADAN engeller.
      expect(result.blocked, JSON.stringify(result)).toBe(true)
    } finally {
      await context.close()
    }
  })
})

test.describe('KK-091 · mobil web + web çapraz senkron', () => {
  test('giriş -> oda kur -> ikinci istemci (web) katılır -> hamle ≤1500 ms içinde senkron', async ({
    browser,
  }) => {
    test.skip(
      true,
      'BLOKER (bu görevde bulundu ve gerçek tarayıcıda kanıtlandı — bkz. ' +
        'docs/board/reports/E2E-005.md § "Mobil web girişi çalışmıyor"): mobil auth ' +
        'köprüsü (`apps/web/app/api/auth/mobile/callback/route.ts`) PLATFORMDAN BAĞIMSIZ ' +
        'her zaman `xox://auth?token=&refresh=&state=` özel şemasına 307 döner. Web ' +
        'hedefinde `expo-web-browser`in popup tabanlı akışı (`ExpoWebBrowser.web.js`, ' +
        "`openAuthSessionAsync`) bunun yerine AYNI origin'de gerçek bir http(s) sayfası " +
        "bekler (`redirectUri` web'de `Linking.createURL('auth')` ile " +
        '`http://<origin>/auth` olarak hesaplanır, `createURL.web.js` ölçüldü) — böyle bir ' +
        'rota (`apps/mobile/app/auth.tsx`, `maybeCompleteAuthSession()` çağıran) hiç YOK. ' +
        "Gerçek Chromium'da ölçüldü (bu görevde, yerelde, WS/preview OLMADAN): popup " +
        '`chrome-error://chromewebdata/`e düşüyor (kayıtlı olmayan `xox://` şeması), ana ' +
        'sayfa SONSUZA DEK "Tarayıcıda giriş açılıyor…" durumunda KALIYOR — giriş adımı ' +
        '1. adımda tıkanıyor, oda kurma/senkron mantığına HİÇ ULAŞILAMIYOR. Bu deterministik ' +
        '(flaky DEĞİL, `retries` ile gizlenecek bir şey YOK). İKİNCİL bir engel daha var ' +
        "('BULGU' describe bloğu, yukarıda): mobil web dist'i API'den FARKLI origin'den " +
        'servis edilirse `apps/web`de CORS başlığı OLMADIĞI için kimlikli her fetch AYRICA ' +
        'engellenir — köprü düzeltilse bile aynı-origin dağıtım ŞART. Düzeltme ' +
        '`apps/web`+`apps/mobile` kaynağını gerektiriyor: agent yetki dışı (bu paket YALNIZ ' +
        "`apps/e2e`e yazar), lead'e iletildi (öneri: yeni P0/P1 kart, xox-dev-mobile + " +
        'xox-dev-backend). Kod aşağıda korunuyor: köprü + CORS düzeltildikten SONRA bile bu ' +
        'senaryo gerçek bir preview + gerçek WS gerektirir (yerelde `next start` altında WS ' +
        "ÇALIŞMAZ, E2E-004'ün ölçtüğü ortamsal kısıt) — unskip GERÇEK preview koşusunu BEKLER.",
    )

    // Aşağıdaki iskelet köprü düzeltildikten SONRA doldurulacak gerçek akışı
    // belgeler — şu an ERİŞİLEMEZ (yukarıdaki skip nedeniyle hiç çalışmaz).
    const mobileContext = await browser.newContext()
    const mobilePage = await mobileContext.newPage()
    await mobilePage.goto(`${staticServer.url}/giris`)

    const popupPromise = mobilePage.waitForEvent('popup')
    await mobilePage.getByTestId('btn-giris').click()
    const popup = await popupPromise

    // Köprü web hedefini desteklediğinde: popup web'in KENDİ `/giris`
    // formuna düşer (oturumsuzsa) — `TEST_USER_PASSWORD` `apps/e2e/fixtures/
    // auth.ts` ve `packages/db/src/seed.ts` ile BİREBİR aynı, bilinen,
    // gerçek olmayan bir test sabiti (ikisinde de hâlihazırda TEKRARLANMIŞ,
    // burada üçüncü bir kopya DEĞİL, aynı sözleşme).
    const TEST_USER_PASSWORD = 'XoxTest!2026'
    await popup.getByTestId('giris-eposta').fill(TEST_USERS.playerOne.email)
    await popup.getByTestId('giris-parola').fill(TEST_USER_PASSWORD)
    await popup.getByTestId('btn-giris').click()

    // Beklenen (düzeltmeden sonra): popup kapanır, mobil ana ekran oturumlu
    // görünüme geçer.
    await expect(mobilePage.getByTestId('mobile-home')).toBeVisible()

    await mobileContext.close()
  })
})
