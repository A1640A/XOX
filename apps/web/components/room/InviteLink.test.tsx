import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InviteLink } from './InviteLink'

describe('InviteLink', () => {
  it('İSKELET: W3-03 doldurana kadar hiçbir şey render etmez', () => {
    const { container } = render(<InviteLink roomCode="ABC234" />)

    expect(container).toBeEmptyDOMElement()
  })
})
