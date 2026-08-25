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
 * AŞAMA 2 — YAZILDI, HENÜZ KOŞULMADI. `GET /api/rooms/[code]/ws` (WS-001)
 * bu yazıldığı anda `main`'de YOK; bu dosyanın tamamı bilerek `skip` edilir.
 * WS-001 merge olup preview'a yansıdığında: `test.describe.skip(` satırındaki
 * `.skip`'i KALDIR ve şu şekilde koştur:
 *
 *   E2E_BASE_URL=<yeni-preview> pnpm --filter @xox/e2e e2e --grep "KK-03[2]|KK-04[01]"
 *
 * Kararsız çıkarsa (`flaky`) İKİ KEZ daha tekrarla, tek koşuya bakıp
 * `blocker` etiketi VERME (kart kuralı).
 */
test.describe.skip('AŞAMA 2 · gerçek zamanlı senaryolar (WS-001 bekleniyor)', () => {
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
    const code = await createRoom(twoPlayers.playerOne)
    await joinRoom(twoPlayers.playerTwo, code)
    await waitForOpponentName(twoPlayers.playerOne, TEST_USERS.playerTwo.name)

    // Sıra X'te (playerOne) başlar → O (playerTwo) beklemede, tıklama etkisiz
    // kalmalı VE hiçbir `move` çerçevesi sunucuya gitmemeli.
    const frames = captureWsFrames(twoPlayers.playerTwo)
    await playMove(twoPlayers.playerTwo, 0)

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
