import { tr } from '@/messages/tr'

/**
 * Tahta kenar uzunluğunu görünür etikete çevirir — TEK türetme noktası.
 * `BoardConfigPicker` (boyut düğmeleri) ve `summary-text.ts` (özet cümlesi)
 * İKİSİ de bunu çağırır; ikinci bir eşleme YAZILMAZ (bu hafta beş kez
 * tekrarlanan "aynı şeyin iki kopyası" hatasıyla aynı sınıf).
 *
 * `size` `game-core`'un `BoardConfig.size`'ı gibi ham `number`'dır (donmuş
 * `3|6|11` birleşimi değil) — RoomClientState/WS taşıması bunu daraltılmamış
 * taşır. Bilinmeyen bir değer `BOARD_MODES`'un asla üretemeyeceği bir
 * durumdur ama render ASLA çökmemeli (Board.tsx'in KK-B57 disipliniyle aynı):
 * güvenli, çeviri gerektirmeyen sayısal bir geri dönüş kullanılır.
 */
export function sizeLabel(size: number): string {
  if (size === 3) return tr.boardConfig.size3
  if (size === 6) return tr.boardConfig.size6
  if (size === 11) return tr.boardConfig.size11
  return `${String(size)}×${String(size)}`
}
