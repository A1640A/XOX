import { WS_CLOSE } from '@xox/shared'
import { WebSocket } from 'ws'
import { expect, test } from '../fixtures/two-players'

test.describe('harness duman testleri', () => {
  test('ana sayfa yüklenir ve başlığı gösterir', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'XOX' })).toBeVisible()
  })

  test('sağlık uç noktası veritabanına erişebiliyor', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  test("iki oyuncu fixture'ı iki bağımsız oturum verir", async ({ twoPlayers }) => {
    await Promise.all([twoPlayers.playerOne.goto('/'), twoPlayers.playerTwo.goto('/')])
    await expect(twoPlayers.playerOne.getByRole('heading', { name: 'XOX' })).toBeVisible()
    await expect(twoPlayers.playerTwo.getByRole('heading', { name: 'XOX' })).toBeVisible()
  })
})

function roomWsUrl(baseURL: string, code: string): string {
  return `${baseURL.replace(/^http/, 'ws')}/api/rooms/${code}/ws`
}

interface WsCloseEvent {
  readonly code: number
  readonly reason: string
}

/** Bağlanır, upgrade'i bekler, ilk kapanış olayını (kod + sebep) döner. */
function waitForClose(url: string): Promise<WsCloseEvent> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('WebSocket 10 saniyede kapanmadı'))
    }, 10_000)

    socket.on('close', (code, reasonBuffer) => {
      clearTimeout(timer)
      resolve({ code, reason: reasonBuffer.toString('utf8') })
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

/**
 * `/api/ws/echo` WS-001'in güvenlik denetiminde SİLİNDİ: kimlik doğrulaması
 * olmayan, sınırsız (varsayılan `maxPayload` 256 KiB), production'da CANLI
 * açık bir 1:1 WS yansıtıcısıydı — harness kanıtı Dalga 0'da zaten alınmıştı,
 * ucun kalmasına gerek yoktu (`GET /api/ws/echo` artık HTTP 404).
 *
 * Amaç aynı kaldı: "bu deployment'ta WebSocket upgrade'i GERÇEKTEN çalışıyor
 * mu" sorusu bir duman testi olarak hâlâ değerli — Dalga 0'da Vercel WS'in
 * çalıştığını kanıtlayan şey buydu. Yeni hedef uygulamanın TEK gerçek zamanlı
 * ucu: `GET /api/rooms/[code]/ws`. Bu uç artık kimlik İSTER; kimliksiz/bozuk
 * istek HTTP 401/404 DÖNMEZ (istemci bunu `1006` sanıp sonsuz yeniden
 * bağlanma döngüsüne girerdi, ADR-0006) — upgrade HER ZAMAN olur, sonra
 * gerçek bir WS KAPANIŞ KODUYLA kapanır. Bu kodun istemciye ulaşması TEK
 * BAŞINA "upgrade bu deployment'ta çalışıyor" kanıtıdır (`1006` değil,
 * `route.ts`'in bilerek yazdığı gerçek kod — bkz. WS-001, `upgradeAndClose`).
 *
 * Kimlikli mutlu yol (join/move/vs.) Aşama 2'nin işi (`room-realtime.spec.ts`,
 * hâlâ `.skip` — ayrı bir sinyal bekliyor); burada yalnız "upgrade çalışıyor +
 * doğru kapanış kodu ulaşıyor" doğrulanır, hiçbir oda/kullanıcı oluşturmaya
 * gerek yok — her iki kapanış da `route.ts`'in DB'ye hiç dokunmadığı erken
 * dallardan gelir.
 *
 * WS-001 bu görev sürerken `main`'e merge edildi (`ae25322`). Bu iki test
 * `main`'den alınan taze bir preview'a karşı (`https://xox-9kk0h1h1w-izrandevu.vercel.app`,
 * `dpl_7EXxGBX65gio9jkAdJAQknTVUCTz`) 3 ayrı tam koşuda kararsızlık olmadan
 * GEÇTİ — `.skip` YOK. (Mantık ayrıca WS-001'in kendi ön-merge preview'ında
 * da ayrıca doğrulanmıştı.)
 */
test.describe('WS upgrade duman testleri', () => {
  test('kimliksiz upgrade → soket açılır, 4401 unauthenticated ile kapanır', async ({
    baseURL,
  }) => {
    // "ABCDEF": roomCodeSchema'ya UYUMLU (6 hane, izinli alfabe) — kimlik
    // kontrolüne ulaşmak için kod adımını GEÇMESİ gerekiyor, oda var/yok
    // önemsiz (identity null iken route hiç DB'ye bakmıyor).
    const { code, reason } = await waitForClose(roomWsUrl(String(baseURL), 'ABCDEF'))
    expect(code).toBe(WS_CLOSE.UNAUTHENTICATED)
    expect(reason).toBe('unauthenticated')
  })

  test('bozuk oda kodu → soket açılır, 4404 invalid-code ile kapanır', async ({ baseURL }) => {
    // "000000": roomCodeSchema'nın alfabesi (`ROOM_CODE_ALPHABET`) '0' İÇERMEZ
    // (karışan karakter yasağı) — bilerek geçersiz, kimlikten ÖNCE elenir.
    const { code, reason } = await waitForClose(roomWsUrl(String(baseURL), '000000'))
    expect(code).toBe(WS_CLOSE.NOT_FOUND)
    expect(reason).toBe('invalid-code')
  })
})
