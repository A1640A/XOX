import { act, render, screen } from '@testing-library/react'
import { DISCONNECT_GRACE_SECONDS } from '@xox/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpponentLeftBanner } from './OpponentLeftBanner'

/**
 * İstemcinin sandığı "şimdi" — `TurnTimer.test.tsx` ile aynı desen: çıplak
 * sayı bilerek, beklentiler `Date.now()`tan TÜRETİLMİYOR, aksi hâlde test
 * duvar saatine bağlanır ve CI'da kararsız olur.
 */
const CLIENT_NOW = 1_767_225_600_000
const GRACE_MS = DISCONNECT_GRACE_SECONDS * 1_000

const clock = (): number => CLIENT_NOW

afterEach(() => {
  vi.useRealTimers()
})

describe('OpponentLeftBanner (KK-070/071)', () => {
  it('graceEndsAt null iken HİÇBİR ŞEY render etmez — rakip bağlıyken sahte bir bildirim yanlış bilgidir', () => {
    const { container } = render(
      <OpponentLeftBanner graceEndsAt={null} serverOffsetMs={0} clock={clock} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('ADR-0007 2 sn gösterim eşiğinin ALTINDA hiçbir şey göstermez (kopma anı ile eşik arası)', () => {
    // graceEndsAt tam GRACE_MS sonrasında ise elapsed = 0 < 2000 → görünmez.
    const { container } = render(
      <OpponentLeftBanner graceEndsAt={CLIENT_NOW + GRACE_MS} serverOffsetMs={0} clock={clock} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('2 sn eşiği AŞILINCA KK-070 metnini kalan saniyeyle gösterir', () => {
    // elapsed = 2000ms → görünür. Kalan süre (grace bitimine kadar) 28 sn.
    const graceEndsAt = CLIENT_NOW + GRACE_MS - 2_000
    render(<OpponentLeftBanner graceEndsAt={graceEndsAt} serverOffsetMs={0} clock={clock} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Rakibin bağlantısı koptu — 28 sn içinde dönmezse oyunu kazanırsın.',
    )
  })

  it(
    'KK-070 ÇEKİRDEĞİ: istemci saati sunucudan sapmışken (serverOffsetMs) doğru görünürlük ve ' +
      'doğru geri sayım — ham istemci saati KULLANILMAZ',
    () => {
      // Cihaz saati sunucudan 3 dk ileri → sunucu saati istemciden 180 sn geri.
      const skewMs = 3 * 60 * 1000
      const serverOffsetMs = -skewMs
      // Sunucu koptu anını GRACE_MS - 10sn önce bildirdi (yani 20 sn geçti,
      // banner görünür ve 10 sn kalmış olmalı) — sunucu zamanında ifade edilir.
      const graceEndsAt = CLIENT_NOW - skewMs + 10_000

      render(
        <OpponentLeftBanner
          graceEndsAt={graceEndsAt}
          serverOffsetMs={serverOffsetMs}
          clock={clock}
        />,
      )

      expect(screen.getByRole('status')).toHaveTextContent(
        'Rakibin bağlantısı koptu — 10 sn içinde dönmezse oyunu kazanırsın.',
      )
    },
  )

  it('saniyede bir tazelenir: 1 sn ilerleyince kalan saniye düşer', () => {
    vi.useFakeTimers()
    let fake = CLIENT_NOW
    const graceEndsAt = CLIENT_NOW + GRACE_MS - 2_000 // hemen görünür, 28 sn kalan

    render(<OpponentLeftBanner graceEndsAt={graceEndsAt} serverOffsetMs={0} clock={() => fake} />)
    expect(screen.getByRole('status')).toHaveTextContent('28 sn')

    fake += 1_000
    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(screen.getByRole('status')).toHaveTextContent('27 sn')
  })

  it('rakip grace içinde dönünce (graceEndsAt null olunca) KK-071 metnini gösterir ve KK-070 metni kalkar', () => {
    vi.useFakeTimers()
    const fake = CLIENT_NOW
    const graceEndsAt = CLIENT_NOW + GRACE_MS - 2_000

    const view = render(
      <OpponentLeftBanner graceEndsAt={graceEndsAt} serverOffsetMs={0} clock={() => fake} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Rakibin bağlantısı koptu')

    view.rerender(<OpponentLeftBanner graceEndsAt={null} serverOffsetMs={0} clock={() => fake} />)
    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('status')).toHaveTextContent('Rakip geri döndü.')
    expect(screen.queryByText(/Rakibin bağlantısı koptu/)).not.toBeInTheDocument()
  })

  it('KK-071 mesajı RETURNED_VISIBLE_MS sonra kendiliğinden kalkar — rakip zaten normal oynarken banner asılı kalmaz', () => {
    vi.useFakeTimers()
    let fake = CLIENT_NOW
    const graceEndsAt = CLIENT_NOW + GRACE_MS - 2_000

    const view = render(
      <OpponentLeftBanner graceEndsAt={graceEndsAt} serverOffsetMs={0} clock={() => fake} />,
    )
    view.rerender(<OpponentLeftBanner graceEndsAt={null} serverOffsetMs={0} clock={() => fake} />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Rakip geri döndü.')

    fake += 5_000
    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('graceEndsAt hiç null olmadan (ilk mount kopukken) yalnızca KK-070 gösterir, KK-071 tetiklenmez', () => {
    const graceEndsAt = CLIENT_NOW + GRACE_MS - 2_000
    render(<OpponentLeftBanner graceEndsAt={graceEndsAt} serverOffsetMs={0} clock={clock} />)

    expect(screen.queryByText('Rakip geri döndü.')).not.toBeInTheDocument()
  })

  it('graceEndsAt DOLUYKEN kurulan aralık bileşen çıkarken temizlenir (sızdırmaz)', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const graceEndsAt = CLIENT_NOW + GRACE_MS - 2_000

    const view = render(
      <OpponentLeftBanner graceEndsAt={graceEndsAt} serverOffsetMs={0} clock={clock} />,
    )
    view.unmount()

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
