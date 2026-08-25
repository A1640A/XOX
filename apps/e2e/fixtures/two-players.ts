import type { Page } from '@playwright/test'
import { test as authTest } from './auth'

export interface TwoPlayers {
  readonly playerOne: Page
  readonly playerTwo: Page
}

/**
 * İki bağımsız tarayıcı bağlamı = iki ayrı oturum çerezi = iki gerçek oyuncu.
 * Aynı bağlamda iki sekme AÇMAK YETMEZ; oturum paylaşılır ve test yalan söyler.
 *
 * `fixtures/auth.ts`'in `playerOnePage`/`playerTwoPage`'i üzerine kurulur:
 * her iki sayfa da `e2e-user-1`/`e2e-user-2` olarak ÖNCEDEN kimliklendirilmiş
 * gelir (bkz. `global-setup.ts`). Dalga 1-3'ün iki-oyunculu her senaryosu
 * (pes/rövanş, süre aşımı, emoji/arkadaş) bu imzayla yazılabilir — yeni bir
 * ihtiyaç çıkarsa `fixtures/room.ts`e yardımcı eklenir, burası DEĞİŞMEZ.
 */
export const test = authTest.extend<{ twoPlayers: TwoPlayers }>({
  twoPlayers: async ({ playerOnePage, playerTwoPage }, use) => {
    await use({ playerOne: playerOnePage, playerTwo: playerTwoPage })
  },
})

export { expect } from '@playwright/test'
