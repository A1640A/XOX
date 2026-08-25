import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionBadge } from './ConnectionBadge'

describe('ConnectionBadge', () => {
  it.each(['bagli', 'baglaniyor', 'devredildi'] as const)(
    'status=%s iken "Tekrar dene" düğmesi GÖSTERİLMEZ',
    (status) => {
      render(<ConnectionBadge status={status} onRetry={vi.fn()} />)

      expect(screen.queryByRole('button', { name: 'Tekrar dene' })).not.toBeInTheDocument()
    },
  )

  it('status=kopuk iken "Tekrar dene" gösterilir ve tıklanınca onRetry çağırır (KK-062, önceden ölü API)', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ConnectionBadge status="kopuk" onRetry={onRetry} />)

    const retryButton = screen.getByRole('button', { name: 'Tekrar dene' })
    await user.click(retryButton)

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('status=kopuk ama onRetry verilmemişse düğme gösterilmez (opsiyonel prop)', () => {
    render(<ConnectionBadge status="kopuk" />)

    expect(screen.queryByRole('button', { name: 'Tekrar dene' })).not.toBeInTheDocument()
  })

  it.each([
    ['bagli', 'Bağlı'],
    ['baglaniyor', 'Bağlanıyor…'],
    ['kopuk', 'Bağlantı koptu'],
    ['devredildi', 'Bu hesapla başka bir sekmeden bağlanıldı. Oyun burada devam etmiyor.'],
  ] as const)('data-durum ve metin: %s -> %s', (status, label) => {
    render(<ConnectionBadge status={status} />)

    expect(screen.getByTestId('baglanti-durumu')).toHaveTextContent(label)
  })

  it.each([
    ['bagli', 'bagli'],
    ['baglaniyor', 'baglaniyor'],
    ['kopuk', 'kopuk'],
    ['devredildi', 'devredildi'],
  ] as const)('data-durum durumu OLDUĞU GİBİ yazar: %s', (status, durum) => {
    render(<ConnectionBadge status={status} />)

    expect(screen.getByTestId('baglanti-durumu')).toHaveAttribute('data-durum', durum)
  })

  it(
    "devredildi ARTIK kopuk'a eşlenmez — iki durumun davranışı TAM TERS " +
      '(kopuk: yeniden bağlan + "Tekrar dene", devredildi: hiçbiri, §3.2)',
    () => {
      const { unmount } = render(<ConnectionBadge status="devredildi" onRetry={vi.fn()} />)
      const devredildi = screen.getByTestId('baglanti-durumu')
      const devredildiDurum = devredildi.getAttribute('data-durum')
      const devredildiDugme = devredildi.querySelector('button')
      unmount()

      render(<ConnectionBadge status="kopuk" onRetry={vi.fn()} />)
      const kopuk = screen.getByTestId('baglanti-durumu')

      expect(devredildiDurum).not.toBe(kopuk.getAttribute('data-durum'))
      expect(devredildiDugme).toBeNull()
      expect(kopuk.querySelector('button')).not.toBeNull()
    },
  )
})
