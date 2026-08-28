import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnTimer } from './TurnTimer'

/**
 * İstemcinin sandığı "şimdi". Çıplak sayı bilerek — beklentiler `Date.now()`tan
 * TÜRETİLMİYOR, aksi hâlde test duvar saatine bağlanır ve CI'da kararsız olur.
 */
const CLIENT_NOW = 1_767_225_600_000

/** `deadline`i istemcinin saatine göre `saniye` sonrasına kuran yardımcı. */
function deadlineIn(seconds: number, offsetMs = 0): number {
  return CLIENT_NOW + offsetMs + seconds * 1000
}

const clock = (): number => CLIENT_NOW

afterEach(() => {
  vi.useRealTimers()
})

describe('TurnTimer (KK-073 · sure-sayaci)', () => {
  it('deadline null iken HİÇBİR ŞEY render etmez — sahte sayaç yanlış bilgidir', () => {
    render(<TurnTimer deadline={null} serverOffsetMs={0} clock={clock} />)

    expect(screen.queryByTestId('sure-sayaci')).not.toBeInTheDocument()
  })

  it('kalan süreyi Türkçe metinle gösterir', () => {
    render(<TurnTimer deadline={deadlineIn(42)} serverOffsetMs={0} clock={clock} />)

    expect(screen.getByTestId('sure-sayaci')).toHaveTextContent('Kalan süre: 42 sn')
  })

  it('sapma sıfırken bile sayaç çalışır — NÖTR OLMAYAN ikinci vaka aşağıda', () => {
    render(<TurnTimer deadline={deadlineIn(17)} serverOffsetMs={0} clock={clock} />)

    expect(screen.getByTestId('sure-sayaci')).toHaveAttribute('data-kalan', '17')
  })

  it(
    'KK-073 ÇEKİRDEĞİ: istemci saati 3 DAKİKA İLERİ alınmışken sayaç DOĞRU geri sayar — ' +
      'offset = serverTime - Date.now() uygulanır, ham istemci saati KULLANILMAZ',
    () => {
      // Cihaz saati sunucudan 3 dk ileri → sunucu saati istemciden 180 sn geri.
      const skewMs = 3 * 60 * 1000
      const serverOffsetMs = -skewMs
      // Sunucu "60 sn sonra" diyor; sunucunun `now`u istemciden 180 sn geride.
      const deadline = CLIENT_NOW - skewMs + 60_000

      render(<TurnTimer deadline={deadline} serverOffsetMs={serverOffsetMs} clock={clock} />)

      // Ham `Date.now()` kullanılsaydı `deadline - CLIENT_NOW` = -120 sn → 0.
      expect(screen.getByTestId('sure-sayaci')).toHaveAttribute('data-kalan', '60')
      expect(screen.getByTestId('sure-sayaci')).toHaveTextContent('Kalan süre: 60 sn')
    },
  )

  it('istemci saati GERİ alınmışsa da doğru sayar (sapmanın öteki yönü)', () => {
    const skewMs = 90_000
    // Cihaz 90 sn GERİDE → serverTime - Date.now() = +90 sn.
    const deadline = CLIENT_NOW + skewMs + 25_000

    render(<TurnTimer deadline={deadline} serverOffsetMs={skewMs} clock={clock} />)

    expect(screen.getByTestId('sure-sayaci')).toHaveAttribute('data-kalan', '25')
  })

  it('süre geçmişte kalmışsa 0 gösterilir, negatife düşmez', () => {
    render(<TurnTimer deadline={deadlineIn(-9)} serverOffsetMs={0} clock={clock} />)

    expect(screen.getByTestId('sure-sayaci')).toHaveAttribute('data-kalan', '0')
  })

  it('10 sn ve altında aciliyet metni eklenir', () => {
    render(<TurnTimer deadline={deadlineIn(10)} serverOffsetMs={0} clock={clock} />)

    expect(screen.getByTestId('sure-sayaci')).toHaveTextContent('Acele et!')
  })

  it('11 sn üstünde aciliyet metni YOKTUR — ama sayaç metni VARDIR (pozitif eş)', () => {
    render(<TurnTimer deadline={deadlineIn(11)} serverOffsetMs={0} clock={clock} />)

    const el = screen.getByTestId('sure-sayaci')
    expect(el).toHaveTextContent('Kalan süre: 11 sn')
    expect(el).not.toHaveTextContent('Acele et!')
  })

  it('saniyede bir tazelenir: 1 sn ilerleyince gösterilen değer düşer', () => {
    vi.useFakeTimers()
    let fake = CLIENT_NOW
    const deadline = CLIENT_NOW + 30_000

    render(<TurnTimer deadline={deadline} serverOffsetMs={0} clock={() => fake} />)
    expect(screen.getByTestId('sure-sayaci')).toHaveAttribute('data-kalan', '30')

    fake += 1000
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByTestId('sure-sayaci')).toHaveAttribute('data-kalan', '29')
  })

  it('deadline null olunca aralık kurulmaz (bileşen çıkarken sızdırmaz)', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')

    const view = render(
      <TurnTimer deadline={CLIENT_NOW + 5_000} serverOffsetMs={0} clock={clock} />,
    )
    view.unmount()

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
