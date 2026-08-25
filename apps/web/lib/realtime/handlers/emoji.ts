import type { HandlerContext } from '../context'

/**
 * **İSKELET (W3-03 doldurur)** — KK-122…124, tasarım §5.8.
 *
 * Gövde yazılırken iki kapı zorunlu: palet beyaz listesi (protokol zaten
 * `emojiSchema` ile daraltıyor) ve bağlantı başına kayan pencere hız sınırı
 * (10 sn / 5). Emoji `version` ARTIRMAZ; yayın yine change stream'den gider.
 */
export function handleChatEmoji(context: HandlerContext): Promise<void> {
  context.connection.sendError('SERVER_ERROR', 'Emoji henüz uygulanmadı.')
  return Promise.resolve()
}
