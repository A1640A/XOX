import { DATA_ATTR, roomCodeSchema, TESTID } from '@xox/shared'
import { expect, test } from '../fixtures/auth'
import { createRoom } from '../fixtures/room'

/**
 * KK-030 + KK-031: "Oda kur" → `/oda/<KOD>`; `oda-kodu` 6 hane ve
 * `roomCodeSchema`'ya uygun; `sira-gostergesi` `data-sira="X"`; `rakip-adi`
 * "Rakip bekleniyor". WS gerektirmez — `RoomScreen`'in ilk render'ı
 * `initialRoomClientState()`ten gelir (`status.turn: 'X'`, `you: null` →
 * rakip her zaman `null`), bu yüzden Aşama 1'de gerçekten koşulabilir.
 */
test.describe('KK-030/031 · oda kurma', () => {
  test('oda kur → koda yönlenir, 6 haneli geçerli kod, sıra X, rakip bekleniyor', async ({
    playerOnePage,
  }) => {
    const code = await createRoom(playerOnePage)

    const parsed = roomCodeSchema.safeParse(code)
    expect(parsed.success).toBe(true)
    expect(code).toHaveLength(6)

    await expect(playerOnePage.getByTestId(TESTID.odaKodu)).toHaveText(code)
    await expect(playerOnePage.getByTestId(TESTID.siraGostergesi)).toHaveAttribute(
      DATA_ATTR.sira,
      'X',
    )
    await expect(playerOnePage.getByTestId(TESTID.rakipAdi)).toHaveText('Rakip bekleniyor')
  })
})
