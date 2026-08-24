import type { Emoji, ReceivedEmoji } from '@xox/shared'

export interface EmojiTrayProps {
  readonly onSend: (emoji: Emoji) => void
  readonly lastEmoji: ReceivedEmoji | null
}

/**
 * İSKELET (kart DONDURMA #1) — W3-03 "Emoji tepkileri, hız sınırı ve davet
 * linki" görevi 8'li paleti (`emoji-0`…`emoji-7`) ve gelen balonu
 * (`emoji-balonu`) burada doldurur. Prop sözleşmesi şimdiden `useRoom`'un
 * dışa verdiği `sendEmoji` eylemine ve `state.lastEmoji`'ye bağlıdır; bu
 * dosya sonraki dalgada AÇILIP yalnız gövdesi doldurulur.
 */
export function EmojiTray(props: EmojiTrayProps): React.ReactElement | null {
  void props
  return null
}
