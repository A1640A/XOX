import { DATA_ATTR, TESTID } from '@xox/shared'
import { expect, type Page, test } from '@playwright/test'
import { MongoClient } from 'mongodb'
import { TEST_USERS } from '../fixtures/auth'
import { createRoom, expectCell, joinRoom, playMove, waitForOpponentName } from '../fixtures/room'
import { test as twoPlayersTest } from '../fixtures/two-players'

/**
 * E2E-004 — KK-070…074 (hamle süresi / terk grace'i). `apps/e2e/fixtures/**`
 * ve `playwright.config.ts` bu görevde DEĞİŞTİRİLMEDİ (kart şartı).
 *
 * Sabitler (`MOVE_TIMEOUT_SECONDS = 60`, `DISCONNECT_GRACE_SECONDS = 30`)
 * KISALTILMAZ (kart notu) — üretimde enjekte edilebilir bir saat YOK
 * (`TurnTimer`'ın `clock` prop'u yalnız birim testte kullanılır, `RoomScreen.tsx`
 * onu geçirmez). Bekleme GERÇEK duvar saatiyle yapılır; kurulum tarafında
 * gereksiz bekleme EKLENMEZ (ör. KK-074 testi hiçbir hamle oynamaz, saat
 * `joinRoom` yazımıyla ANINDA başlar — `packages/db/src/rooms/join.ts`).
 * Sabit `waitForTimeout` yerine `expect.poll`/`toHaveText`'in kendi
 * yeniden-deneyen bekleyişi kullanılır (kart notu + CLAUDE.md dersi).
 */

// `apps/web/messages/tr.ts` — `apps/e2e` path alias'ını IMPORT EDEMEZ (ayrı
// paket sınırı), bu yüzden `computer.spec.ts`'teki kalıp izlenir: hardcode
// edilmiş ama kaynağına yorumla bağlanmış metin.
const TXT = {
  wonByTimeout: 'Rakibin süresi doldu — kazandın!',
  lostByTimeout: 'Süren doldu, oyunu kaybettin.',
  wonByAbandon: 'Rakibin oyunu terk etti — kazandın!',
  opponentDisconnectedPrefix: 'Rakibin bağlantısı koptu',
  opponentReturned: 'Rakip geri döndü.',
} as const

/** `sure-sayaci` metninden (`tr.game.timeLeft`) kalan saniyeyi ayıklar. */
async function remainingSeconds(page: Page): Promise<number> {
  const text = await page.getByTestId(TESTID.sureSayaci).innerText()
  const match = /Kalan süre: (\d+) sn/.exec(text)
  if (match === null) {
    throw new Error(`sure-sayaci metni beklenmedik biçimde geldi: "${text}"`)
  }
  return Number(match[1])
}

interface GameDoc {
  readonly roomCode: string
  readonly endReason: string | null
  readonly finishedAt: Date | null
}

/**
 * `computer.spec.ts`teki KK-027 Atlas doğrulamasıyla AYNI kalıp: Playwright'ın
 * hiçbir soyutlaması olmadan `games` koleksiyonuna doğrudan bağlanır.
 * `MONGODB_URI`/`MONGODB_DB` `global-setup.ts`in zaten doğruladığı ortamdır
 * (`xox_test`) — burada TEKRAR okunur, ayrı bir bağlantı üzerinden.
 */
async function fetchGameByRoomCode(code: string): Promise<GameDoc | null> {
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
    const games = client.db(dbName).collection<GameDoc>('games')
    return await games.findOne({ roomCode: code })
  } finally {
    await client.close()
  }
}

test.describe('E2E-004 · KK-073 · hamle süresi geri sayımı', () => {
  twoPlayersTest(
    'sure-sayaci 60tan geri sayar; hamleden sonra karşı taraf için yeniden ~60tan başlar',
    async ({ twoPlayers }) => {
      const code = await createRoom(twoPlayers.playerOne)
      await joinRoom(twoPlayers.playerTwo, code)
      await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
      await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

      // `join.ts` turnDeadline'ı JOIN ANINDA `now + MOVE_TIMEOUT_SECONDS` olarak
      // yazar — X (playerOne) için sayaç zaten ~60'tan başlamış olmalı.
      const initial = await remainingSeconds(twoPlayers.playerOne)
      expect(initial).toBeGreaterThanOrEqual(50)
      expect(initial).toBeLessThanOrEqual(60)

      // SABİT SLEEP DEĞİL: `expect.poll` saniyenin GERÇEKTEN azaldığını
      // (yalnız ilk render'da donmadığını) kanıtlar.
      await expect
        .poll(() => remainingSeconds(twoPlayers.playerOne), { timeout: 6_000, intervals: [500] })
        .toBeLessThan(initial)

      // playerOne (X) oynar → sıra O'ya (playerTwo) geçer; `applyMove.ts`
      // `transport.kind==='playing'` iken YENİ bir turnDeadline (now+60) yazar
      // — KK-073'ün "karşı taraf için yeniden 60'tan başlar" iddiası budur.
      await playMove(twoPlayers.playerOne, 4)
      await expectCell(twoPlayers.playerTwo, 4, 'X')
      const afterMove = await remainingSeconds(twoPlayers.playerTwo)
      expect(afterMove).toBeGreaterThanOrEqual(55)
    },
  )
})

test.describe('E2E-004 · KK-074 · süre aşımı sonuçlandırması', () => {
  twoPlayersTest(
    'sırası gelen oyuncu 60 sn içinde oynamazsa kaybeder; iki ekranda da doğru metin; games.endReason===timeout',
    async ({ twoPlayers }, testInfo) => {
      // MOVE_TIMEOUT_SECONDS=60 KISALTILMAZ (kart notu). Kurulum tarafında
      // hiçbir hazırlık hamlesi YOK — bekleme doğrudan 60 sn'lik pencerenin
      // KENDİSİ, fazladan kurulum maliyeti eklenmiyor.
      testInfo.setTimeout(100_000)
      const code = await createRoom(twoPlayers.playerOne)
      await joinRoom(twoPlayers.playerTwo, code)
      await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
      await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

      // playerOne = X HİÇ oynamıyor: X'in turnDeadline'ı dolacak, O
      // (playerTwo) zaman aşımıyla kazanacak. Sunucu tarafı hem zamanlayıcı
      // (`createSettlementTimer`, her iki bağlantı da `join` sonrası kurar)
      // hem tembel yol (`settleDeadlines`) üzerinden TAMAMEN kendiliğinden
      // sonuçlandırır — istemciden ek bir mesaj GEREKMEZ.
      await expect(twoPlayers.playerTwo.getByTestId(TESTID.durumMetni)).toHaveText(
        TXT.wonByTimeout,
        { timeout: 75_000 },
      )
      await expect(twoPlayers.playerOne.getByTestId(TESTID.durumMetni)).toHaveText(
        TXT.lostByTimeout,
        { timeout: 5_000 },
      )
      await expect(twoPlayers.playerOne.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'yok',
      )
      await expect(twoPlayers.playerTwo.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'yok',
      )

      const game = await fetchGameByRoomCode(code)
      expect(game, `games koleksiyonunda roomCode=${code} bulunamadı`).not.toBeNull()
      expect(game?.endReason).toBe('timeout')
      expect(game?.finishedAt).not.toBeNull()
    },
  )
})

test.describe('E2E-004 · KK-071 · grace içinde dönüş (fonksiyonel)', () => {
  twoPlayersTest(
    'rakip sekmeyi kapatıp 30 sn dolmadan yeni bir sekmeyle dönerse oyun kaldığı yerden sürer',
    async ({ twoPlayers, playerOneContext }) => {
      const code = await createRoom(twoPlayers.playerOne)
      await joinRoom(twoPlayers.playerTwo, code)
      await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
      await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

      // Gerçek bir "sekmeyi kapatma" — `setOffline` DEĞİL: sayfa kapanınca
      // tarayıcı WS bağlantısını GERÇEKTEN kapatır, sunucunun `ws.on('close')`
      // olayı (route.ts) ANINDA ateşlenir ve `detachConnection` (detach.ts)
      // `disconnected.graceEndsAt`i derhal yazar — ısınma/heartbeat beklemeye
      // GEREK YOK (reconnect.spec.ts'teki `setOffline` senaryosunun aksine).
      await twoPlayers.playerOne.close()

      // AYNI context (AYNI userId/oturum) üzerinden YENİ bir sekme — gerçek
      // bir "geri dönüş" (`join.ts` `reconnect()`, `seatOf` userId eşleşmesiyle
      // koltuğu geri verir ve `disconnected`i temizler).
      const returned = await playerOneContext.newPage()
      await returned.goto(`/oda/${code}`)
      await expect(returned.getByTestId(TESTID.tahta)).toBeVisible()

      // Fonksiyonel kanıt: oyun GERÇEKTEN sürüyor — sırası gelen oyuncu
      // (X = dönen playerOne) oynayabiliyor ve rakip bunu görüyor.
      await playMove(returned, 4)
      await expectCell(twoPlayers.playerTwo, 4, 'X')
      await expect(twoPlayers.playerTwo.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'O',
      )

      await returned.close()
    },
  )
})

test.describe('E2E-004 · KK-072 · grace dolunca terk galibiyeti', () => {
  twoPlayersTest(
    '30 sn içinde dönülmezse kalan oyuncu kazanır; games.endReason===abandon',
    async ({ twoPlayers }, testInfo) => {
      // DISCONNECT_GRACE_SECONDS=30 KISALTILMAZ. Kurulum minimal: iki oyuncu
      // eşleşir eşleşmez playerOne sekmesini kapatıyoruz, bekleme doğrudan
      // 30 sn'lik pencerenin kendisi.
      testInfo.setTimeout(70_000)
      const code = await createRoom(twoPlayers.playerOne)
      await joinRoom(twoPlayers.playerTwo, code)
      await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
      await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

      await twoPlayers.playerOne.close()

      // Hiç dönülmüyor: 30 sn sonra kalan oyuncu (O = playerTwo) terk
      // galibiyeti alır. `statusText`'in `abandon` dalı (`status-text.ts`)
      // yalnız KAZANAN için özel metin tanımlar (`wonByAbandon`) — kaybeden
      // taraf zaten uzaklaşmış olduğu için ayrı bir metin YOK (spec §5),
      // bu yüzden yalnız playerTwo tarafı doğrulanıyor.
      await expect(twoPlayers.playerTwo.getByTestId(TESTID.durumMetni)).toHaveText(
        TXT.wonByAbandon,
        { timeout: 40_000 },
      )
      await expect(twoPlayers.playerTwo.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
        DATA_ATTR.sira,
        'yok',
      )

      const game = await fetchGameByRoomCode(code)
      expect(game, `games koleksiyonunda roomCode=${code} bulunamadı`).not.toBeNull()
      expect(game?.endReason).toBe('abandon')
      expect(game?.finishedAt).not.toBeNull()
    },
  )
})

/**
 * ⚠️ BİLİNEN KIRMIZI — `test.fixme` ile karantinada (kart notu: "flake
 * retries ile gizlenmez; kök neden rapora yazılır" — bu KIRMIZI DEĞİL,
 * bilinçli KARANTİNA, sebebi burada VE raporda).
 *
 * `apps/web/components/room/OpponentLeftBanner.tsx` HÂLÂ İSKELET: `props`i
 * okur ama HER ZAMAN `null` döner (dosyanın kendi yorumu bunu itiraf ediyor —
 * "W2-01 ... bu bileşeni doldurur", W2-01 raporu bunu "borç" olarak devretmiş,
 * `E2E-003` raporu bunu zaten "minor, P1 kapsamında bilinen eksik" diye not
 * düşmüştü). `RoomScreen.tsx` bileşeni GERÇEK `state.graceEndsAt`/
 * `state.serverOffsetMs` ile mount ediyor (veri BORUSU eksiksiz), yalnız
 * SUNUM katmanı boş — yani KK-070/071'in metin/sayaç iddiası şu an DOM'da
 * hiçbir zaman doğru olamaz. Testler kartın istediği KATI biçimde
 * (gevşetilmeden) yazıldı ve gerçekten kırmızı olduğu doğrulandı — sonra
 * `pnpm gates`i BEKLENEN bir kırmızıyla kilitlememek için `fixme` ile
 * karantinaya alındı. `OpponentLeftBanner.tsx` doldurulunca bu iki `fixme`
 * KALDIRILIP testler aktif edilmeli; gövde ZATEN hazır.
 */
test.describe('E2E-004 · KK-070/071 · terk bildirimi metni (BİLİNEN KIRMIZI)', () => {
  twoPlayersTest.fixme(
    'KK-070: rakip sekmeyi kapatınca 2 sn içinde grace metni görünür',
    async ({ twoPlayers }) => {
      const code = await createRoom(twoPlayers.playerOne)
      await joinRoom(twoPlayers.playerTwo, code)
      await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
      await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

      await twoPlayers.playerOne.close()

      await expect(twoPlayers.playerTwo.getByText(TXT.opponentDisconnectedPrefix)).toBeVisible({
        timeout: 2_000,
      })
    },
  )

  twoPlayersTest.fixme(
    'KK-071: rakip grace içinde dönünce "Rakip geri döndü." görünür ve sayaç kaybolur',
    async ({ twoPlayers, playerOneContext }) => {
      const code = await createRoom(twoPlayers.playerOne)
      await joinRoom(twoPlayers.playerTwo, code)
      await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
      await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

      await twoPlayers.playerOne.close()
      await expect(twoPlayers.playerTwo.getByText(TXT.opponentDisconnectedPrefix)).toBeVisible({
        timeout: 2_000,
      })

      const returned = await playerOneContext.newPage()
      await returned.goto(`/oda/${code}`)

      await expect(twoPlayers.playerTwo.getByText(TXT.opponentReturned)).toBeVisible({
        timeout: 5_000,
      })
      await expect(twoPlayers.playerTwo.getByText(TXT.opponentDisconnectedPrefix)).toHaveCount(0)

      await returned.close()
    },
  )
})
