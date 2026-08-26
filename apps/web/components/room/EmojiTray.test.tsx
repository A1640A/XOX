import { EMOJI_PALETTE, TESTID, emojiTestId } from '@xox/shared'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmojiTray } from './EmojiTray'

/**
 * ÇIPLAK beklenti tablosu. `EMOJI_PALETTE`ten türetilmiş bir iddia, palet bir
 * gün üç emojiye düşse de yeşil kalırdı (conventions.md "iki katmanlı test");
 * aşağıda sabitin KENDİSİYLE de ayrıca karşılaştırılıyor.
 */
const BEKLENEN_PALET = ['👋', '😀', '😂', '😮', '😢', '👏', '🔥', '🤝']

describe('EmojiTray — KK-122', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tam sekiz sabit emoji`yi emoji-0…emoji-7 kancalarıyla gösterir', () => {
    render(<EmojiTray onSend={vi.fn()} lastEmoji={null} />)

    const gorulen = BEKLENEN_PALET.map(
      (_, index) => screen.getByTestId(emojiTestId(index)).textContent,
    )

    expect(gorulen).toStrictEqual(BEKLENEN_PALET)
    expect(gorulen).toStrictEqual([...EMOJI_PALETTE])
    // Dokuzuncu düğme YOK — palet sabit.
    expect(screen.queryByTestId(emojiTestId(8))).toBeNull()
  })

  it('bir düğmeye basınca onSend O emojiyle çağrılır', () => {
    const onSend = vi.fn()
    render(<EmojiTray onSend={onSend} lastEmoji={null} />)

    fireEvent.click(screen.getByTestId(emojiTestId(6)))

    expect(onSend).toHaveBeenCalledExactlyOnceWith('🔥')
  })

  it('sekiz düğmenin her biri KENDİ emojisini gönderir', () => {
    const onSend = vi.fn()
    render(<EmojiTray onSend={onSend} lastEmoji={null} />)

    for (let index = 0; index < BEKLENEN_PALET.length; index += 1) {
      fireEvent.click(screen.getByTestId(emojiTestId(index)))
    }

    expect(onSend.mock.calls.flat()).toStrictEqual(BEKLENEN_PALET)
  })

  it('lastEmoji yokken balon DOM`da hiç yoktur (ama palet DOLU)', () => {
    render(<EmojiTray onSend={vi.fn()} lastEmoji={null} />)

    expect(screen.queryByTestId(TESTID.emojiBalonu)).toBeNull()
    // "Yokluk" iddiasının pozitif eşi: bileşen gerçekten render edildi.
    expect(screen.getByTestId(emojiTestId(0))).toBeInTheDocument()
  })

  it('gelen emoji balonu görünür ve 3 sn sonra kaybolur', () => {
    vi.useFakeTimers()
    render(<EmojiTray onSend={vi.fn()} lastEmoji={{ from: 'O', emoji: '👏', at: 1_000 }} />)

    expect(screen.getByTestId(TESTID.emojiBalonu)).toHaveTextContent('👏')

    act(() => {
      vi.advanceTimersByTime(2_999)
    })
    expect(screen.getByTestId(TESTID.emojiBalonu)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId(TESTID.emojiBalonu)).toBeNull()
  })

  it('yeni emoji süreyi SIFIRLAR — eskisi kaybolurken yenisi tam 3 sn kalır', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <EmojiTray onSend={vi.fn()} lastEmoji={{ from: 'O', emoji: '👏', at: 1_000 }} />,
    )

    act(() => {
      vi.advanceTimersByTime(2_500)
    })
    rerender(<EmojiTray onSend={vi.fn()} lastEmoji={{ from: 'X', emoji: '🔥', at: 3_500 }} />)

    expect(screen.getByTestId(TESTID.emojiBalonu)).toHaveTextContent('🔥')
    act(() => {
      vi.advanceTimersByTime(2_999)
    })
    // Eski zamanlayıcı (500 ms sonra dolacaktı) yeniyi ERKEN kapatmamalı.
    expect(screen.getByTestId(TESTID.emojiBalonu)).toHaveTextContent('🔥')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId(TESTID.emojiBalonu)).toBeNull()
  })

  it('AYNI emoji ikinci kez gelirse (farklı at) balon YENİDEN belirir', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <EmojiTray onSend={vi.fn()} lastEmoji={{ from: 'O', emoji: '👏', at: 1_000 }} />,
    )
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.queryByTestId(TESTID.emojiBalonu)).toBeNull()

    rerender(<EmojiTray onSend={vi.fn()} lastEmoji={{ from: 'O', emoji: '👏', at: 9_000 }} />)

    expect(screen.getByTestId(TESTID.emojiBalonu)).toHaveTextContent('👏')
  })
})
