import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SiralamaPage from './page'

/**
 * Casus bileşen deseni (`docs/memory/conventions.md` "Casus bileşenle prop
 * iddiası") — `LeaderboardContent` gerçekten mount edilmiş mi diye ağ/oturum
 * katmanını hiç kurmadan kanıtlamanın yolu: gerçek bileşenin yerine geçen bir
 * sahte koyup `SiralamaPage`in onu render ettiğini iddia etmek.
 */
vi.mock('./LeaderboardContent', () => ({
  LeaderboardContent: () => <div data-testid="casus-leaderboard-content" />,
}))

describe('/siralama sayfası', () => {
  it('LeaderboardContent bileşenini gerçekten render eder', () => {
    render(<SiralamaPage />)

    expect(screen.getByTestId('casus-leaderboard-content')).toBeInTheDocument()
  })
})
