import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InviteLink } from './InviteLink'

describe('InviteLink — KK-120', () => {
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

  function kopyalaDugmesi(): HTMLElement {
    return screen.getByRole('button', { name: 'Linki kopyala' })
  }

  it('panoya <origin>/davet/<KOD> yazar', async () => {
    render(<InviteLink roomCode="ABC234" />)

    fireEvent.click(kopyalaDugmesi())
    await act(async () => {
      await Promise.resolve()
    })

    const yazilan = writeText.mock.calls[0]?.[0]
    // İki katmanlı: hem origin'le birleştirilmiş hâli hem şeklin KENDİSİ.
    // Yalnız `${origin}/davet/${kod}` iddiası, bileşen bir gün `origin`i
    // yanlış kaynaktan alsa da (ör. boş dize) testle birlikte kayardı.
    expect(yazilan).toBe(`${window.location.origin}/davet/ABC234`)
    expect(yazilan).toMatch(/^https?:\/\/[^/]+\/davet\/ABC234$/)
    // Davet yolu `/oda/` DEĞİLDİR — oturumsuz kullanıcı `/oda/*` middleware
    // korumasına takılır, `/davet/*` muaftır (KK-121).
    expect(yazilan).not.toContain('/oda/')
  })

  it('kopyalandıktan sonra data-kopyalandi 2 sn görünür kalır', async () => {
    vi.useFakeTimers()
    render(<InviteLink roomCode="ABC234" />)

    fireEvent.click(kopyalaDugmesi())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByRole('button', { name: 'Kopyalandı' })).toHaveAttribute(
      'data-kopyalandi',
      'true',
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(kopyalaDugmesi()).not.toHaveAttribute('data-kopyalandi')
  })

  it('kopyalanmadan önce data-kopyalandi yoktur (ama düğme ORADA)', () => {
    render(<InviteLink roomCode="ABC234" />)

    expect(kopyalaDugmesi()).not.toHaveAttribute('data-kopyalandi')
    expect(kopyalaDugmesi()).toBeInTheDocument()
  })

  it('paylaşım ipucunu gösterir ve kodu ekranda okutur', () => {
    render(<InviteLink roomCode="ABC234" />)

    expect(screen.getByText('Kodu arkadaşına gönder, aynı odaya katılsın.')).toBeInTheDocument()
  })
})
