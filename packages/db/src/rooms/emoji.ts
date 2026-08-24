import type { Emoji, Player } from '@xox/shared'
import type { TransitionResult } from './types'

/**
 * Son emoji — **`version` ARTIRMAZ** (tasarım §5.5 kural 1'in tek istisnası),
 * beyaz liste + hız sınırı KK-122…124'te. **Tipli iskelet**: `W3-03` doldurur
 * (`packages/db/src/rooms/emoji.ts`, tasarım §12). Bilerek `casUpdateRoom`
 * KULLANMAZ — o yardımcı her zaman `version`'ı artırır.
 */
export async function pushEmoji(
  code: string,
  seat: Player,
  emoji: Emoji,
): Promise<TransitionResult> {
  await Promise.resolve()
  throw new Error(
    `pushEmoji(${code}, ${seat}, ${emoji}) henüz uygulanmadı — W3-03 doldurur (tasarım §5.5, KK-122)`,
  )
}
