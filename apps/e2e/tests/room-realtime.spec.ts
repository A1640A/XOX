import { cellTestId, DATA_ATTR, type Cell } from '@xox/shared'
import { TEST_USERS } from '../fixtures/auth'
import {
  captureWsFrames,
  createRoom,
  expectCell,
  joinRoom,
  playMove,
  waitForOpponentName,
} from '../fixtures/room'
import { expect, test } from '../fixtures/two-players'

/**
 * AŞAMA 2 — `GET /api/rooms/[code]/ws` (WS-001) `main`'e merge edildi
 * (`ae25322`); `.skip` KALDIRILDI, bu dosya artık gerçek preview'a karşı
 * koşuyor.
 */
test.describe('AŞAMA 2 · gerçek zamanlı senaryolar', () => {
  test('KK-032: ikinci istemci kodu girip katılır, iki istemcide de rakip adı ≤2 sn içinde görünür', async ({
    twoPlayers,
  }) => {
    const code = await createRoom(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)

    await Promise.all([
      waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name, 2_000),
      waitForOpponentName(twoPlayers.playerTwo, TEST_USERS.playerOne.name, 2_000),
    ])
  })

  test('KK-040: A hamle yapar, B tahtasında aynı hücre aynı taşla ≤1500 ms içinde görünür (≥5 hamle)', async ({
    twoPlayers,
  }) => {
    const code = await createRoom(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    // Sırayla X (playerOne) / O (playerTwo) — hiçbir hücre iki kez oynanmaz,
    // hiçbiri kazanma/doluluk kuralına takılmaz (0..4, ard arda farklı hücre).
    const moveIndexes = [0, 1, 2, 3, 4] as const

    const selfLatenciesMs: number[] = []
    const opponentLatenciesMs: number[] = []

    for (const index of moveIndexes) {
      const isPlayerOneTurn = index % 2 === 0
      const mover = isPlayerOneTurn ? twoPlayers.playerOne : twoPlayers.playerTwo
      const watcher = isPlayerOneTurn ? twoPlayers.playerTwo : twoPlayers.playerOne
      const mark: Cell = isPlayerOneTurn ? 'X' : 'O'

      const start = Date.now()
      await playMove(mover, index)

      // R1 değişmezi: yazan taraf da KENDİ hamlesini change stream yankısından
      // öğrenir — süreç-içi kısayol yok. Bu yüzden mover'ın kendi görme süresi
      // de ölçülür ve sıfıra yakınsa bu bir BULGUDUR (kısayol geri gelmiş).
      await expectCell(mover, index, mark)
      selfLatenciesMs.push(Date.now() - start)

      await expectCell(watcher, index, mark)
      opponentLatenciesMs.push(Date.now() - start)
    }

    function stats(values: number[]): { min: number; avg: number; max: number } {
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((sum, v) => sum + v, 0) / values.length,
      }
    }

    const selfStats = stats(selfLatenciesMs)
    const opponentStats = stats(opponentLatenciesMs)

    // Rapora SAYI olarak yazılacak (kart kriteri) — konsola basılır, koşan
    // agent bunu `docs/board/reports/E2E-001.md`e taşır.
    console.warn(
      `KK-040 yazan-taraf gecikmesi (ms): min=${String(selfStats.min)} ort=${selfStats.avg.toFixed(1)} maks=${String(selfStats.max)}`,
    )
    console.warn(
      `KK-040 rakip-taraf gecikmesi (ms): min=${String(opponentStats.min)} ort=${opponentStats.avg.toFixed(1)} maks=${String(opponentStats.max)}`,
    )

    expect(selfStats.min).toBeGreaterThan(0)
    for (const latency of [...selfLatenciesMs, ...opponentLatenciesMs]) {
      expect(latency).toBeLessThan(1_500)
    }
  })

  test('KK-041: sıra karşı taraftayken tıklama hücreyi değiştirmez ve sunucuya move mesajı gitmez', async ({
    twoPlayers,
  }) => {
    // `captureWsFrames` NAVİGASYONDAN ÖNCE takılır: `page.on('websocket')`
    // yalnız kendinden SONRA açılan soketleri görür — `joinRoom`'dan sonra
    // takmak bu odanın soketini (zaten açılmış) KAÇIRIRDI, test sessizce
    // hiçbir şey doğrulamayan bir "0 çerçeve" iddiasına dönüşürdü.
    const code = await createRoom(twoPlayers.playerOne)
    const frames = captureWsFrames(twoPlayers.playerTwo)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    // Katman 1 (UI): hücre gerçekten `disabled` — bu, bir kullanıcının GERÇEK
    // bir tıklamayla `onCellPress`i asla tetikleyemeyeceğinin kanıtı.
    await expect(twoPlayers.playerTwo.getByTestId(cellTestId(0))).toBeDisabled()

    // Sıra X'te (playerOne) başlar → O (playerTwo) beklemede, hücre
    // `disabled`dır. `force: true`: Playwright'ın normal `.click()`'i
    // "enabled olmasını bekle" kontrolüne takılıp zaman aşımına uğrardı
    // (element hiç enabled olmayacak) — `force` bunu atlayıp GERÇEK bir
    // tıklamayı dener; tarayıcı yine de `disabled` `<button>`a `click`
    // olayını dağıtmaz (HTML spesifikasyonu), yani bu "fiziksel bir tıklama
    // gerçekten hiçbir şey yapmıyor mu" sorusunu gerçek bir tıklamayla sınar.
    await playMove(twoPlayers.playerTwo, 0, { force: true })

    await expectCell(twoPlayers.playerTwo, 0, null)
    await expect(twoPlayers.playerTwo.getByTestId(cellTestId(0))).not.toHaveAttribute(
      DATA_ATTR.bekliyor,
      'true',
    )

    const sentMoveFrames = frames.sent.filter((raw) => {
      try {
        const parsed: unknown = JSON.parse(raw)
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          'type' in parsed &&
          (parsed as { type?: unknown }).type === 'move'
        )
      } catch {
        return false
      }
    })
    expect(sentMoveFrames).toHaveLength(0)
  })
})
