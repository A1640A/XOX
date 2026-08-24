import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

describe('CopyButton', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tıklanınca getValue() sonucunu panoya yazar ve data-kopyalandi 2 sn görünür kalır', async () => {
    vi.useFakeTimers()
    render(<CopyButton label="Kodu kopyala" getValue={() => 'ABC234'} testId="btn-kopyala" />)

    fireEvent.click(screen.getByTestId('btn-kopyala'))
    // `writeText`in çözülen Promise'i `setCopied(true)` + `setTimeout` zincirini
    // ANCAK bir mikro görev turundan sonra kurar. `advanceTimersByTimeAsync(0)`
    // hem sahte zamanlayıcıları hem mikro görev kuyruğunu bu sırayla boşaltır.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(writeText).toHaveBeenCalledExactlyOnceWith('ABC234')
    expect(screen.getByTestId('btn-kopyala')).toHaveAttribute('data-kopyalandi', 'true')

    // `data-kopyalandi` 2 sn sonra kalkmalı — zamanlayıcıyı ilerlet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(screen.getByTestId('btn-kopyala')).not.toHaveAttribute('data-kopyalandi')
  })

  it('kopyalanmadan önce data-kopyalandi yazmaz ve etiketi gösterir', () => {
    render(<CopyButton label="Kodu kopyala" getValue={() => 'ABC234'} testId="btn-kopyala" />)

    const button = screen.getByTestId('btn-kopyala')
    expect(button).not.toHaveAttribute('data-kopyalandi')
    expect(button).toHaveTextContent('Kodu kopyala')
  })
})
