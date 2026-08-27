import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameConfigSummary } from './GameConfigSummary'

describe('GameConfigSummary', () => {
  it('oyun-ayari-ozeti kancasıyla özet metnini gösterir', () => {
    render(<GameConfigSummary config={{ size: 6, winLength: 4 }} />)

    expect(screen.getByTestId('oyun-ayari-ozeti')).toHaveTextContent('6×6 tahta · 4 taş yan yana')
  })

  it('eski odanın çözülmüş {3,3} konfigürasyonunda "undefined" göstermez', () => {
    render(<GameConfigSummary config={{ size: 3, winLength: 3 }} />)

    const el = screen.getByTestId('oyun-ayari-ozeti')
    expect(el).toHaveTextContent('3×3 tahta · 3 taş yan yana')
    expect(el.textContent).not.toContain('undefined')
  })
})
