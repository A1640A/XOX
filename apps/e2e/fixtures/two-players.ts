import { test as base, type BrowserContext, type Page } from '@playwright/test'

export interface TwoPlayers {
  playerOne: Page
  playerTwo: Page
}

/**
 * İki bağımsız tarayıcı bağlamı = iki ayrı oturum çerezi = iki gerçek oyuncu.
 * Aynı bağlamda iki sekme AÇMAK YETMEZ; oturum paylaşılır ve test yalan söyler.
 */
export const test = base.extend<{ twoPlayers: TwoPlayers }>({
  twoPlayers: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [await browser.newContext(), await browser.newContext()]
    const [playerOne, playerTwo] = await Promise.all(contexts.map(async (c) => c.newPage()))

    if (playerOne === undefined || playerTwo === undefined) {
      throw new Error('İki oyuncu sayfası oluşturulamadı')
    }

    await use({ playerOne, playerTwo })

    await Promise.all(contexts.map(async (c) => c.close()))
  },
})

export { expect } from '@playwright/test'
