'use client'

import { useEffect, useState } from 'react'
import { EMOJI_PALETTE, TESTID, emojiTestId } from '@xox/shared'
import type { Emoji, ReceivedEmoji } from '@xox/shared'
import { tr } from '@/messages/tr'

export interface EmojiTrayProps {
  readonly onSend: (emoji: Emoji) => void
  readonly lastEmoji: ReceivedEmoji | null
}

/**
 * Balonun ekranda kaldığı süre (KK-122). Çıplak sayı bilerek: sabitten
 * türetilmiş bir beklenti, süre yanlışlıkla değiştirilse de testi yeşil tutar.
 */
const BUBBLE_VISIBLE_MS = 3_000

/**
 * 8'li emoji paleti (`emoji-0`…`emoji-7`) ve gelen emoji balonu — KK-122.
 *
 * `RoomScreen.tsx` bu bileşeni `UI-SKEL-001`de zaten monte etti ve o dosya
 * DONDURULMUŞ: prop sözleşmesi (`onSend` = `useRoom().actions.sendEmoji`,
 * `lastEmoji` = `state.lastEmoji`) burada değiştirilemez.
 *
 * **Görünürlük `at` damgasına bağlıdır, `emoji` değerine değil.** Aynı emoji
 * arka arkaya iki kez gelirse (`👏`, `👏`) nesne alanları aynı olur; ayırt eden
 * tek şey sunucunun yazdığı `at`tir. Bir efekt bağımlılığı olarak `lastEmoji`
 * nesnesini kullanmak da yanlış olurdu: reducer her mesajda YENİ nesne üretir,
 * yani alakasız bir `pong` bile balonu yeniden başlatırdı.
 *
 * Beyaz liste burada TEKRARLANMAZ: gösterilen değer `state.lastEmoji`e ancak
 * `chat:emoji` sunucu mesajından girer ve o mesaj `serverMessageSchema`
 * (`emojiSchema` = `z.enum(EMOJI_PALETTE)`) süzgecinden geçmiştir.
 */
export function EmojiTray({ onSend, lastEmoji }: EmojiTrayProps): React.ReactElement {
  const at = lastEmoji?.at ?? null
  /**
   * "Gizlenmiş olan damga" tutulur, "görünen" değil. Ters kurgu (`visibleAt`)
   * efektin gövdesinde SENKRON `setState` gerektiriyordu ve
   * `react-hooks/set-state-in-effect` bunu haklı olarak reddediyor: her yeni
   * emoji fazladan bir render turu doğururdu. Böyle kurulunca görünürlük
   * render sırasında TÜRETİLİYOR, `setState` yalnız zamanlayıcı dolunca
   * (asenkron) çağrılıyor.
   */
  const [hiddenAt, setHiddenAt] = useState<number | null>(null)

  useEffect(() => {
    if (at === null) return undefined
    const handle = setTimeout(() => {
      setHiddenAt(at)
    }, BUBBLE_VISIBLE_MS)
    return () => {
      clearTimeout(handle)
    }
  }, [at])

  const bubble = lastEmoji !== null && hiddenAt !== lastEmoji.at ? lastEmoji : null

  return (
    <section aria-label={tr.chat.sendEmoji} className="flex items-center gap-2">
      <ul className="flex flex-wrap gap-1">
        {EMOJI_PALETTE.map((emoji, index) => (
          <li key={emoji}>
            <button
              type="button"
              data-testid={emojiTestId(index)}
              aria-label={emoji}
              onClick={() => {
                onSend(emoji)
              }}
              className="border-border bg-surface hover:bg-surface-raised hover:border-text rounded-[6px] border px-2 py-1 text-lg transition-colors duration-150 motion-reduce:transition-none"
            >
              {emoji}
            </button>
          </li>
        ))}
      </ul>
      {bubble !== null && (
        <p data-testid={TESTID.emojiBalonu} role="status" aria-live="polite" className="text-2xl">
          {bubble.emoji}
        </p>
      )}
    </section>
  )
}
