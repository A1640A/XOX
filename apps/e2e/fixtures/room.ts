import { expect, type Page } from '@playwright/test'
import {
  cellTestId,
  DATA_ATTR,
  roomCodeSchema,
  TESTID,
  type Cell,
  type RoomCode,
} from '@xox/shared'

/**
 * Oda yardımcıları — E2E-001'in "asıl işi" burada donuyor. Dalga 1'in
 * pes/rövanş, Dalga 2'nin süre aşımı, Dalga 3'ün emoji/arkadaş senaryoları
 * hep bu üç ilkelin (`createRoom`/`joinRoom`, `playMove`, `expectCell`) ÜZERİNE
 * yeni bir yardımcı EKLER (ör. `resign(page)`, `offerRematch(page)`); bu
 * dosyadaki imzalar DEĞİŞMEZ, yalnız uzatılır.
 */

/** Ana sayfadan "Oda kur"a tıklar, `/oda/<KOD>`'a yönlenmeyi bekler, kodu döner (KK-030). */
export async function createRoom(page: Page): Promise<RoomCode> {
  await page.goto('/')
  await page.getByTestId(TESTID.btnOdaKur).click()
  await page.waitForURL(/\/oda\/[A-Z0-9]{6}$/)
  const code = new URL(page.url()).pathname.split('/').pop() ?? ''
  return roomCodeSchema.parse(code)
}

/**
 * Ana sayfadaki 6 haneli oda kodu alanından katılır (KK-032/033/034 akışı).
 * `JoinCodeField`'ın giriş elemanı henüz bir `data-testid` taşımıyor (yalnız
 * gönder düğmesi taşıyor, `TESTID.btnOdayaKatil`) — `#join-code` DOM id'si
 * kararlıdır (`apps/web/components/JoinCodeField.tsx`), test kancası burada
 * eksikse bunu KENDİMİZ eklemeyiz, lead'e bildiririz.
 */
export async function joinRoom(page: Page, code: RoomCode): Promise<void> {
  await page.goto('/')
  await page.locator('#join-code').fill(code)
  await page.getByTestId(TESTID.btnOdayaKatil).click()
  await page.waitForURL(new RegExp(`/oda/${code}$`))
}

export interface PlayMoveOptions {
  /**
   * KK-041: sıra karşı taraftayken hücre `disabled`dır — Playwright'ın
   * normal `.click()`'i "enabled olmasını bekle" aktörlük kontrolüne takılıp
   * zaman aşımına uğrar (element hiç enabled olmayacağı için). `force: true`
   * bu kontrolü atlayıp gerçek bir tıklamayı fiziksel olarak dener; tarayıcı
   * `disabled` bir `<button>`a JS `click` olayını YİNE DE dağıtmaz (HTML
   * spesifikasyonu) — yani bu, "gerçekten tıklansa bile hiçbir şey olmuyor
   * mu" sorusunu gerçek bir tıklamayla sınayan tek yol.
   */
  readonly force?: boolean
}

/** `hucre-<i>`'ye tıklar. */
export async function playMove(
  page: Page,
  index: number,
  options?: PlayMoveOptions,
): Promise<void> {
  await page.getByTestId(cellTestId(index)).click({ force: options?.force ?? false })
}

/** `hucre-<i>`'nin `data-tas` değerinin beklenen taşa (ya da boşa, `null`) eriştiğini doğrular. */
export async function expectCell(page: Page, index: number, mark: Cell): Promise<void> {
  await expect(page.getByTestId(cellTestId(index))).toHaveAttribute(DATA_ATTR.tas, mark ?? '')
}

/** İki oyunculu bir odada karşı tarafın görünen adının belirmesini bekler (KK-032, ≤2 sn bütçe). */
export async function waitForOpponentName(
  page: Page,
  name: string,
  timeoutMs = 2_000,
): Promise<void> {
  await expect(page.getByTestId(TESTID.rakipAdi)).toHaveText(name, { timeout: timeoutMs })
}

export interface WsFrameLog {
  readonly sent: readonly string[]
  readonly received: readonly string[]
}

function framePayloadToText(payload: string | Buffer): string {
  return typeof payload === 'string' ? payload : payload.toString('utf8')
}

/**
 * Oda WS bağlantısının GÖNDERDİĞİ/ALDIĞI ham çerçeveleri kaydeder. KK-041
 * ("sunucuya move mesajı gitmez") gibi negatif iddialar DOM gözlemiyle
 * KANITLANAMAZ — DOM değişmemiş olması mesajın hiç gönderilmediğini
 * göstermez, yalnızca sunucunun onu reddettiğini de gösterebilir. Bu yüzden
 * gerçek tele bakan bir kanca gerekiyordu (WS-001 sonrası kullanılacak).
 */
export function captureWsFrames(page: Page): WsFrameLog {
  const sent: string[] = []
  const received: string[] = []
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/ws')) return
    ws.on('framesent', (frame) => {
      sent.push(framePayloadToText(frame.payload))
    })
    ws.on('framereceived', (frame) => {
      received.push(framePayloadToText(frame.payload))
    })
  })
  return { sent, received }
}
