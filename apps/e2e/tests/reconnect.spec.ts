import { cellTestId, DATA_ATTR, TESTID } from '@xox/shared'
import { TEST_USERS } from '../fixtures/auth'
import {
  captureWsFrames,
  createRoom,
  expectCell,
  joinRoom,
  playMove,
  waitForOpponentName,
  type WsFrameLog,
} from '../fixtures/room'
import { expect, test } from '../fixtures/two-players'

/**
 * E2E-003 — kriter 6/7/8 (kopma/resync) + kriter 9 (takeover).
 *
 * `apps/e2e/fixtures/**` VE `playwright.config.ts` bu görevde DEĞİŞTİRİLMEDİ
 * (kriter 10) — iki yeni yardımcı (`opponentLeftFrames`, ikinci sekme açma)
 * doğrudan bu dosyada, fixture'ların ÜZERİNE yazılmadan yaşıyor.
 */

/** Bir çerçeve listesinde belirli bir `type` alanı arar (KANIT DİSİPLİNİ: liste boş değilse gösterir). */
function framesOfType(log: WsFrameLog, type: string): unknown[] {
  return log.received
    .map((raw) => {
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return null
      }
    })
    .filter(
      (parsed): parsed is { type: string } =>
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        (parsed as { type?: unknown }).type === type,
    )
}

test.describe('E2E-003 · kriter 9 · oturum devralma (takeover)', () => {
  test('eski sekme devredildi görür, salt-okunur kalır, yeniden bağlanmaz — rakip HİÇBİR kopma göstergesi görmez', async ({
    twoPlayers,
    playerOneContext,
  }) => {
    const code = await createRoom(twoPlayers.playerOne)
    // playerTwo'nun ham çerçevelerini NAVİGASYONDAN ÖNCE takıyoruz (E2E-001
    // dersi: `joinRoom`'dan SONRA takmak soketi kaçırır, "0 çerçeve" iddiası
    // hiçbir şey kanıtlamaz).
    const opponentFrames = captureWsFrames(twoPlayers.playerTwo)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)
    await waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name)

    // KANIT: rakibin çerçeve listesi BOŞ DEĞİL (joinRoom sonrası state/opponent:joined
    // gibi trafik zaten aktı) — "yokluk" iddiamız dolu bir listenin yanında.
    expect(opponentFrames.received.length).toBeGreaterThan(0)

    // Aynı bağlamda (AYNI oturum/userId) İKİNCİ bir sekme açıp aynı odaya
    // gidiyoruz — bu, sunucunun `presence[seat].connId`sini değiştiren
    // GERÇEK bir "başka yerden bağlanma" (§3.2), iki context açmakla
    // KARIŞTIRILMAMALI: burada bilerek AYNI context kullanılıyor çünkü
    // takeover senaryosu tam olarak budur.
    const playerOneSecondTab = await playerOneContext.newPage()
    await playerOneSecondTab.goto(`/oda/${code}`)
    await expect(playerOneSecondTab.getByTestId(TESTID.odaKodu)).toHaveText(code)

    // Eski sekme: `devredildi` — `kopuk` DEĞİL (W1-03 ayrımı).
    await expect(twoPlayers.playerOne.getByTestId(TESTID.baglantiDurumu)).toHaveAttribute(
      DATA_ATTR.durum,
      'devredildi',
      { timeout: 5_000 },
    )

    // Salt-okunur: eski sekmede hücreye tıklamak (force: gerçek bir tıklama
    // denemesi) tahtayı DEĞİŞTİRMEZ.
    await playMove(twoPlayers.playerOne, 0, { force: true })
    await expectCell(twoPlayers.playerOne, 0, null)

    // Yeniden bağlanma DENENMEZ: birkaç saniye bekleyip durumun HÂLÂ
    // `devredildi` olduğunu doğruluyoruz (`baglaniyor`/`bagli`ya dönmemeli).
    await twoPlayers.playerOne.waitForTimeout(3_000)
    await expect(twoPlayers.playerOne.getByTestId(TESTID.baglantiDurumu)).toHaveAttribute(
      DATA_ATTR.durum,
      'devredildi',
    )

    // KARŞIT KANIT + "yokluk" iddiası: rakip (playerTwo) bu süre boyunca hiçbir
    // `opponent:left` çerçevesi ALMADI. Liste BOŞ DEĞİL (yukarıda kanıtlandı),
    // bu yüzden bu iddia anlamlı: trafik akıyordu ama bu tip hiç gelmedi.
    const opponentLeftFrames = framesOfType(opponentFrames, 'opponent:left')
    expect(opponentLeftFrames).toHaveLength(0)
    // Rakibin kendi bağlantı durumu da bozulmamış olmalı.
    await expect(twoPlayers.playerTwo.getByTestId(TESTID.baglantiDurumu)).toHaveAttribute(
      DATA_ATTR.durum,
      'bagli',
    )

    // İkinci sekme gerçek koltuğu taşıyor: tahtası görünür ve rakip adı dolu.
    await expect(playerOneSecondTab.getByTestId(TESTID.tahta)).toBeVisible()
    await waitForOpponentName(playerOneSecondTab, TEST_USERS.playerTwo.name)

    await playerOneSecondTab.close()
  })
})

test.describe('E2E-003 · kriter 6/7/8 · kopma ve resync', () => {
  test('setOffline → kopuk; kopukken rakip hamle yapar; dönüşte 9 hücre + sıra göstergesi rakiple eşitlenir', async ({
    twoPlayers,
  }, testInfo) => {
    // İstemci kopmayı KENDİ nabzıyla algılar (`ws-client.ts`:
    // `HEARTBEAT_LOSS_MS = WS_HEARTBEAT_MS * 2` = 50 sn — 2 kayıp nabız).
    // `context.setOffline(true)` mevcut soketi ANINDA kapatmıyor (ölçüldü:
    // 10 sn'de hâlâ `bagli`), bu yüzden varsayılan 30 sn test bütçesi yetmez;
    // burada BİLEREK genişletiliyor (playwright.config.ts DEĞİŞMEDİ, kriter 10).
    testInfo.setTimeout(120_000)
    const code = await createRoom(twoPlayers.playerOne)
    const opponentFrames = captureWsFrames(twoPlayers.playerTwo)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    // playerOne = X, ilk hamleyi yapıyor (index 0) — sıra O'ya geçsin ki
    // playerOne kopukken playerTwo GERÇEKTEN oynayabilsin.
    await playMove(twoPlayers.playerOne, 0)
    await expectCell(twoPlayers.playerTwo, 0, 'X')

    // Kriter 6: bağlantıyı kes → `data-durum="kopuk"`.
    await twoPlayers.playerOne.context().setOffline(true)
    await expect(twoPlayers.playerOne.getByTestId(TESTID.baglantiDurumu)).toHaveAttribute(
      DATA_ATTR.durum,
      'kopuk',
      { timeout: 60_000 },
    )

    // KARŞIT KANIT DENEMESİ (takeover testinin tersi, GÖZLEMSEL — assert DEĞİL):
    // GERÇEK bir kopmada sunucu tarafı ancak KENDİ boşta kalma eşiğinde
    // (`WS_IDLE_TIMEOUT_MS` = 75 sn, son geçerli çerçeveden itibaren) fark eder
    // ve `opponent:left` yayınlar — istemcinin 50 sn'lik kendi nabız algısıyla
    // TOPLAMDA 100+ sn'ye çıkar. Bu, tek bir test bütçesine sığdırmak için çok
    // pahalı; bu yüzden burada BLOKE EDİCİ bir `expect` YOK, yalnız 5 sn'lik
    // kısa bir gözlem penceresi var — rapora "kaç sn'de kaç çerçeve" olarak
    // düşülür. DOM'da zaten görünür bir gösterge yok: `OpponentLeftBanner`
    // hâlâ iskelet (her zaman `null` döner) — bu ayrı bir bulgu, rapora yazıldı.
    await twoPlayers.playerTwo.waitForTimeout(5_000)
    console.warn(
      `KK-070 gözlemi: 5 sn içinde playerTwo'ya ulaşan opponent:left çerçevesi = ${String(framesOfType(opponentFrames, 'opponent:left').length)} (sunucunun 75 sn'lik boşta-kalma eşiği bu pencerenin çok üzerinde — beklenen: 0)`,
    )

    // Kriter 7: kopukken rakip (O) hamle yapar.
    await playMove(twoPlayers.playerTwo, 1)
    await expectCell(twoPlayers.playerTwo, 1, 'O')

    // Geri bağlan.
    await twoPlayers.playerOne.context().setOffline(false)
    await expect(twoPlayers.playerOne.getByTestId(TESTID.baglantiDurumu)).toHaveAttribute(
      DATA_ATTR.durum,
      'bagli',
      { timeout: 20_000 },
    )

    // Kriter 8: dönen istemcinin DOKUZ hücresi rakibinkiyle BİREBİR eşit.
    for (let index = 0; index < 9; index += 1) {
      const opponentCell = await twoPlayers.playerTwo
        .getByTestId(cellTestId(index))
        .getAttribute(DATA_ATTR.tas)
      await expect(twoPlayers.playerOne.getByTestId(cellTestId(index))).toHaveAttribute(
        DATA_ATTR.tas,
        opponentCell ?? '',
      )
    }
    // Sıra göstergesi de eşit.
    const opponentTurn = await twoPlayers.playerTwo
      .getByTestId(TESTID.siraGostergesi)
      .getAttribute(DATA_ATTR.sira)
    await expect(twoPlayers.playerOne.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      opponentTurn ?? '',
    )
  })
})
