import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'
import { ErrorBanner } from './ErrorBanner'

describe('ErrorBanner', () => {
  it('code null iken hiçbir şey render etmez', () => {
    const { container } = render(<ErrorBanner code={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('data-kod ve tr.errors[code] metnini kodun kendisine göre yazar (sabit metin değil)', () => {
    const { rerender } = render(<ErrorBanner code="ROOM_NOT_FOUND" />)
    const banner = screen.getByTestId(TESTID.hataMesaji)
    expect(banner).toHaveAttribute('data-kod', 'ROOM_NOT_FOUND')
    expect(banner).toHaveTextContent(tr.errors.ROOM_NOT_FOUND)

    rerender(<ErrorBanner code="INVALID_CREDENTIALS" />)
    const rebound = screen.getByTestId(TESTID.hataMesaji)
    expect(rebound).toHaveAttribute('data-kod', 'INVALID_CREDENTIALS')
    expect(rebound).toHaveTextContent(tr.errors.INVALID_CREDENTIALS)
    // İki kod farklı metin üretmeli — sabit/hardcode edilmiş tek bir metne
    // dönen bir mutasyonu bu karşılaştırma yakalar.
    expect(tr.errors.ROOM_NOT_FOUND).not.toBe(tr.errors.INVALID_CREDENTIALS)
  })
})
