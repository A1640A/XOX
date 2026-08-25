import { randomInt } from 'node:crypto'
import { DATA_ATTR, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TESTID } from '@xox/shared'
import { expect, test } from '../fixtures/auth'
import { createRoom } from '../fixtures/room'

/**
 * E2E-002 — oda kodu girişi: KK-033 (yok olan oda), KK-034 (istemci
 * normalleştirmesi), + KK-030 regresyonu (bu dosya `room-create.spec.ts`'in
 * YANINDA, onun YERİNE geçmez — E2E-002 kartı KK-030'un bu dalgadan sonra da
 * yeşil kaldığını görmek istiyor, aşağıdaki test tam bunu koşarak sağlar).
 */

/** `roomCodeSchema`ya uyan ama olması NEREDEYSE imkânsız rastgele bir kod (32^6 alan). */
function randomValidLookingCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length))
  }
  return code
}

test.describe('KK-033 · var olmayan oda kodu', () => {
  test('hata-mesaji ROOM_NOT_FOUND, sayfa değişmez', async ({ playerOnePage }) => {
    const missingCode = randomValidLookingCode()
    await playerOnePage.goto('/')
    await playerOnePage.locator('#join-code').fill(missingCode)
    await playerOnePage.getByTestId(TESTID.btnOdayaKatil).click()

    const err = playerOnePage.getByTestId(TESTID.hataMesaji)
    await expect(err).toHaveAttribute(DATA_ATTR.kod, 'ROOM_NOT_FOUND')
    await expect(err).toHaveText('Böyle bir oda yok. Kodu kontrol et.')

    // Sayfa değişmedi — hâlâ ana sayfadayız, `/oda/**`ye geçmedik.
    await expect(playerOnePage).toHaveURL(/\/$/)
  })
})

test.describe('KK-034 · istemci tarafı kod normalleştirmesi', () => {
  test('küçük harf ve boşluk toleranslı: " abc234 " girişi ABC234 olarak normalize edilir', async ({
    playerOnePage,
  }) => {
    await playerOnePage.goto('/')
    const input = playerOnePage.locator('#join-code')
    await input.fill(' abc234 ')

    // Normalleştirme HER TUŞ VURUŞUNDA olur (`onChange`), gönderimde DEĞİL —
    // yani `fill` sonrası input'un DOM değeri ZATEN "ABC234" olmalı.
    await expect(input).toHaveValue('ABC234')

    // Gönderim: `roomCodeSchema` şimdi geçer, sunucuya GERÇEK istekte
    // normalize edilmiş kod gider (`GET /api/rooms/ABC234`) — istek gözlemiyle
    // doğrulanır, yalnızca DOM'a bakmak sunucuya NEYİN gittiğini KANITLAMAZ.
    const requestPromise = playerOnePage.waitForRequest((req) => req.url().includes('/api/rooms/'))
    await playerOnePage.getByTestId(TESTID.btnOdayaKatil).click()
    const req = await requestPromise
    expect(req.url()).toContain('/api/rooms/ABC234')
  })

  test('alfabe dışı karakter içeren giriş INVALID_CODE ile reddedilir (istemci, ağa hiç çıkmadan)', async ({
    playerOnePage,
  }) => {
    await playerOnePage.goto('/')
    const input = playerOnePage.locator('#join-code')
    // `normalizeInput` alfabe dışı her karakteri (I, O, 0, 1 dâhil) anında
    // YUTAR — bu yüzden ALFABE DIŞI bir karakterle geçersizliği tetiklemenin
    // TEK yolu kısa bir kod göndermektir (uzunluk < 6 → `roomCodeSchema` reddi).
    await input.fill('AB')
    await expect(input).toHaveValue('AB')

    let sawRoomRequest = false
    playerOnePage.on('request', (req) => {
      if (req.url().includes('/api/rooms/')) sawRoomRequest = true
    })

    await playerOnePage.getByTestId(TESTID.btnOdayaKatil).click()

    const err = playerOnePage.getByTestId(TESTID.hataMesaji)
    await expect(err).toHaveAttribute(DATA_ATTR.kod, 'INVALID_CODE')

    // Kısa süre bekleyip ağa hiç çıkılmadığını doğrula (istemci format
    // kontrolü sunucuya SORMADAN reddeder).
    await playerOnePage.waitForTimeout(300)
    expect(sawRoomRequest).toBe(false)
  })
})

test.describe('KK-030 regresyonu · oda kurma', () => {
  test('oda kur hâlâ /oda/<KOD>a yönlendirir (bu dalgadan etkilenmedi)', async ({
    playerOnePage,
  }) => {
    const code = await createRoom(playerOnePage)
    await expect(playerOnePage.getByTestId(TESTID.odaKodu)).toHaveText(code)
  })
})
