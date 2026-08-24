import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OpponentLeftBanner } from './OpponentLeftBanner'

describe('OpponentLeftBanner', () => {
  it('İSKELET: W2-01 doldurana kadar hiçbir şey render etmez', () => {
    const { container } = render(<OpponentLeftBanner graceEndsAt={12_345} serverOffsetMs={0} />)

    expect(container).toBeEmptyDOMElement()
  })
})
