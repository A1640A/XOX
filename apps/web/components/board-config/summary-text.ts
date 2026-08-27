import type { BoardConfig } from '@xox/game-core'
import { tr } from '@/messages/tr'
import { sizeLabel } from './size-label'

/**
 * `oyun-ayari-ozeti` kancasının metni — oda/bekleme/katılma ekranlarının
 * ÜÇÜNDE de AYNI şablon (`testids.ts` başlık yorumu). SAF fonksiyon: React'e,
 * fetch'e, oturuma bağımlılığı yok, `RoomScreen`/`JoinRoomPreview` ikisi de
 * çağırır — ikinci bir metin üretimi YAZILMAZ.
 *
 * `size`/`winLength` her zaman SOMUT sayılardır (RoomClientState/roomStateResponseSchema
 * ikisi de opsiyonel değil) — eski (size/winLength taşımayan) bir oda bile
 * sunucuda `resolveBoardConfig` ile `{3,3}`'e çözülmüş gelir; burada
 * `undefined` sızma ihtimali YOKTUR.
 */
export function boardConfigSummaryText(config: BoardConfig): string {
  return tr.boardConfig.summary
    .replace('{boyut}', sizeLabel(config.size))
    .replace('{n}', String(config.winLength))
}
