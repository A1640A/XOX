import { WebSocket, type RawData } from 'ws'
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

/** ws `RawData` üç biçimde gelebilir (Buffer | ArrayBuffer | Buffer[]); hepsini UTF-8 metne çevir. */
function toText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

test.describe('WebSocket kanıtı', () => {
  test('echo uç noktası mesajı geri gönderir', async ({ baseURL }) => {
    const wsUrl = `${String(baseURL).replace(/^http/, 'ws')}/api/ws/echo`

    const reply = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('WebSocket 10 saniyede yanıt vermedi'))
      }, 10_000)

      socket.on('open', () => {
        socket.send('merhaba')
      })
      socket.on('message', (data) => {
        clearTimeout(timer)
        socket.close()
        resolve(toText(data))
      })
      socket.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })

    expect(reply).toBe('echo:merhaba')
  })
})
