import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'
import { DifficultyPicker } from './DifficultyPicker'

/**
 * KK-B47 / ADR-0013 §7 — "dürüst Zor etiketi". Gerekçe: KK-B20'nin
 * tümevarımsal yenilmezlik kanıtı (642 oyun) YALNIZ `size === 3`ün TAM
 * minimaks yolunu (`bestMove`) kapsar; `size > 3`te `chooseMove` bütçeli/
 * derinlik sınırlı bir aramaya (`searchMove`) gider (ADR-0013 §2–§4) — güçlü
 * ama kanıtlanmış yenilmez DEĞİL. Bu yüzden `Difficulty` DEĞERİ ('unbeatable')
 * ve `zorluk-unbeatable` test-id'si SABİT kalırken GÖRÜNÜR etiket boyuta göre
 * değişir.
 */
describe('DifficultyPicker', () => {
  it('size === 3 iken zorluk-unbeatable "Yenilmez" gösterir, dürüstlük notu YOKTUR', () => {
    render(<DifficultyPicker value="medium" onChange={vi.fn()} size={3} />)

    expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toHaveTextContent(tr.computer.unbeatable)
    expect(screen.queryByText(tr.computer.strengthNote)).not.toBeInTheDocument()
  })

  it.each([6, 11])(
    'size === %i iken zorluk-unbeatable "Zor" gösterir ve dürüstlük notu GÖRÜNÜR',
    (size) => {
      render(<DifficultyPicker value="medium" onChange={vi.fn()} size={size} />)

      expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toHaveTextContent(tr.computer.hard)
      expect(screen.getByTestId(TESTID.zorlukUnbeatable)).not.toHaveTextContent(
        tr.computer.unbeatable,
      )
      expect(screen.getByText(tr.computer.strengthNote)).toBeInTheDocument()
    },
  )

  it('test-id ve Difficulty değeri boyuttan BAĞIMSIZ SABİT kalır — yalnız GÖRÜNÜR etiket değişir', () => {
    const onChange = vi.fn()
    const { rerender } = render(<DifficultyPicker value="medium" onChange={onChange} size={3} />)
    const button3 = screen.getByTestId(TESTID.zorlukUnbeatable)
    expect(button3).toHaveAttribute('data-testid', 'zorluk-unbeatable')

    rerender(<DifficultyPicker value="medium" onChange={onChange} size={11} />)
    const button11 = screen.getByTestId(TESTID.zorlukUnbeatable)
    expect(button11).toHaveAttribute('data-testid', 'zorluk-unbeatable')

    button11.click()
    expect(onChange).toHaveBeenCalledExactlyOnceWith('unbeatable')
  })

  it('easy/medium etiketleri boyuttan ETKİLENMEZ', () => {
    render(<DifficultyPicker value="easy" onChange={vi.fn()} size={11} />)

    expect(screen.getByTestId(TESTID.zorlukEasy)).toHaveTextContent(tr.computer.easy)
    expect(screen.getByTestId(TESTID.zorlukMedium)).toHaveTextContent(tr.computer.medium)
  })
})
