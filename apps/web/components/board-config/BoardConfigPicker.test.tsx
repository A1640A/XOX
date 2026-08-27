import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardConfig } from '@xox/game-core'
import { BoardConfigPicker } from './BoardConfigPicker'

/**
 * Kontrollü sarmalayıcı: gerçek bir kullanım gibi `value`/`onChange`'i
 * kendi state'inde tutar — bileşenin KENDİSİ state tutmaz (saf kontrollü
 * bileşen), bu yüzden çok adımlı akışları (boyut değiştir → K güncellenir)
 * test etmek için gerçek bir ebeveyn simüle edilir.
 */
function Controlled({
  initial,
  enabledSizes,
  onChangeSpy,
}: {
  initial: BoardConfig
  enabledSizes?: readonly number[]
  onChangeSpy?: (config: BoardConfig) => void
}): React.ReactElement {
  const [value, setValue] = useState<BoardConfig>(initial)
  return (
    <BoardConfigPicker
      value={value}
      {...(enabledSizes !== undefined ? { enabledSizes } : {})}
      onChange={(config) => {
        setValue(config)
        onChangeSpy?.(config)
      }}
    />
  )
}

describe('BoardConfigPicker', () => {
  it('enabledSizes belirtilmezse üç boyutun TAMAMINI gösterir (yerel bilgisayar oyunu varsayılanı)', () => {
    render(<Controlled initial={{ size: 3, winLength: 3 }} />)

    expect(screen.getByTestId('tahta-boyut-3')).toBeVisible()
    expect(screen.getByTestId('tahta-boyut-6')).toBeVisible()
    expect(screen.getByTestId('tahta-boyut-11')).toBeVisible()
  })

  it('kapalı bir boyut HİÇ RENDER EDİLMEZ — sessizce seçilip düşürülmez (Sert şart 2)', () => {
    render(<Controlled initial={{ size: 3, winLength: 3 }} enabledSizes={[3, 6]} />)

    expect(screen.getByTestId('tahta-boyut-3')).toBeVisible()
    expect(screen.getByTestId('tahta-boyut-6')).toBeVisible()
    expect(screen.queryByTestId('tahta-boyut-11')).not.toBeInTheDocument()
  })

  it('3×3 sabit K değerini metinle gösterir, düğme SUNMAZ', () => {
    render(<Controlled initial={{ size: 3, winLength: 3 }} />)

    expect(screen.getByText('3 taş (3×3 tahtada sabit)')).toBeVisible()
    expect(screen.queryByRole('button', { name: '3 taş' })).not.toBeInTheDocument()
  })

  it('6×6 seçilince o boyutun K seçeneklerini (4, 5 taş) düğme olarak sunar', async () => {
    const user = userEvent.setup()
    render(<Controlled initial={{ size: 3, winLength: 3 }} />)

    await user.click(screen.getByTestId('tahta-boyut-6'))

    expect(screen.getByRole('button', { name: '4 taş' })).toBeVisible()
    expect(screen.getByRole('button', { name: '5 taş' })).toBeVisible()
    expect(screen.getByText('6×6 tahtada 4 taş hızlı ve kararlı bir oyun verir.')).toBeVisible()
  })

  it('boyut değişince GEÇERSİZ kalan K, o boyutun varsayılanına DÜŞER (BOARD_MODES.defaultWinLength)', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<Controlled initial={{ size: 11, winLength: 5 }} onChangeSpy={onChangeSpy} />)

    // Büyükten küçüğe geçiş: 11×11/K5 → 3×3. 3×3'te tek geçerli K=3'tür,
    // eski K=5 GEÇERSİZDİR — sessizce 5 kalmaz, mode.defaultWinLength'e döner.
    await user.click(screen.getByTestId('tahta-boyut-3'))

    expect(onChangeSpy).toHaveBeenLastCalledWith({ size: 3, winLength: 3 })
    expect(screen.getByText('3 taş (3×3 tahtada sabit)')).toBeVisible()
  })

  it('mevcut K yeni boyutta hâlâ geçerliyse KORUNUR (6×6/K5 → 11×11 önce K5 geçerli olduğundan aynı kalır)', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<Controlled initial={{ size: 6, winLength: 5 }} onChangeSpy={onChangeSpy} />)

    await user.click(screen.getByTestId('tahta-boyut-11'))

    // 11×11 winLengths: [4,5,6] — 5 hâlâ geçerli, korunur.
    expect(onChangeSpy).toHaveBeenLastCalledWith({ size: 11, winLength: 5 })
  })

  it('K düğmesine tıklayınca yalnız winLength değişir, size AYNI kalır', async () => {
    const user = userEvent.setup()
    const onChangeSpy = vi.fn()
    render(<Controlled initial={{ size: 11, winLength: 5 }} onChangeSpy={onChangeSpy} />)

    await user.click(screen.getByRole('button', { name: '6 taş' }))

    expect(onChangeSpy).toHaveBeenLastCalledWith({ size: 11, winLength: 6 })
  })

  it('seçili boyut/K düğmeleri aria-pressed=true taşır', async () => {
    const user = userEvent.setup()
    render(<Controlled initial={{ size: 6, winLength: 4 }} />)

    expect(screen.getByTestId('tahta-boyut-6')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tahta-boyut-3')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '4 taş' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '5 taş' }))
    expect(screen.getByRole('button', { name: '5 taş' })).toHaveAttribute('aria-pressed', 'true')
  })

  it("kazanma-uzunlugu kancası her zaman DOM'da bulunur (K seçici kapsayıcısı)", () => {
    render(<Controlled initial={{ size: 3, winLength: 3 }} />)

    expect(screen.getByTestId('kazanma-uzunlugu')).toBeVisible()
  })
})
