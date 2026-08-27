import { colOf, rowOf, type BoardConfig } from '@xox/game-core'
import { tr } from '@/messages/tr'

/**
 * Fark-tabanlı canlı duyuru metinlerinin SAF üretimi (ADR-0017 §7, KK-B64/B65).
 * `durum-metni`nin BAĞLAMI (hangi olayda hangi metnin gösterileceği,
 * `role="status"` mount noktası) `UI-CFG-001`'in işidir — bu dosya
 * `apps/web/components/room/status-text.ts`'e DOKUNMAZ, yalnız o dosyanın
 * tüketebileceği saf metin üreticilerini sağlar.
 *
 * Tahtanın tamamı ASLA okunmaz (KK-B64): yalnız son hamlenin/kazanan çizginin
 * KOORDİNATLARI duyurulur.
 */

/**
 * Sıra değişiminde yalnız FARKI duyuran metin:
 * "Rakip 4. satır 7. sütuna oynadı." / "4. satır 7. sütuna oynadın."
 */
export function moveAnnouncement(
  moveIndex: number,
  config: BoardConfig,
  by: 'opponent' | 'you',
): string {
  const satir = String(rowOf(moveIndex, config) + 1)
  const sutun = String(colOf(moveIndex, config) + 1)
  const template = by === 'opponent' ? tr.game.opponentPlayed : tr.game.youPlayed
  return template.replace('{satir}', satir).replace('{sutun}', sutun)
}

/**
 * Oyun bitince kazanan çizginin KOORDİNATLARINI duyuran metin:
 * "5 taş: 3. satır 4. sütundan 3. satır 8. sütuna."
 * `line`'ın ilk/son elemanı `game-core`'un `winLines` üretim sırasına göre
 * başlangıç/bitiş uçlarıdır (status.ts — üretim sırası sözleşmedir).
 */
export function winningLineAnnouncement(line: readonly number[], config: BoardConfig): string {
  const first = line[0]
  const last = line[line.length - 1]
  if (first === undefined || last === undefined) return ''

  return tr.game.winningLineAnnounce
    .replace('{n}', String(line.length))
    .replace('{baslangicsatir}', String(rowOf(first, config) + 1))
    .replace('{baslangicsutun}', String(colOf(first, config) + 1))
    .replace('{bitissatir}', String(rowOf(last, config) + 1))
    .replace('{bitissutun}', String(colOf(last, config) + 1))
}
