import { emojiSchema } from '@xox/shared'
import type { Emoji, Player } from '@xox/shared'
import { Room } from '../models/room'
import type { RoomEvent, TransitionResult } from './types'

/**
 * Son emoji — **`version` ARTIRMAZ** (tasarım §5.5 kural 1'in tek istisnası).
 *
 * `casUpdateRoom` BİLEREK kullanılmaz: o yardımcı her yazmada `$inc:{version:1}`
 * yazar ve emoji bir *durum* değişikliği değildir. Sürümü artırmak iki şeyi
 * birden bozardı: (a) istemcinin sürüm kapısı emojiyi bir tahta deltası sanıp
 * `move:applied` beklerdi, (b) rakibin uçuştaki hamlesinin CAS'ı ("okuduğum
 * `version` hâlâ geçerli mi") emoji yüzünden kaybedilirdi — bir emoji rakibin
 * hamlesini reddettirebilirdi.
 *
 * Yayın yine change stream'den gider (R1): `timestamps:true` sayesinde bu
 * yazma `updatedAt`i tazeler, dolayısıyla oda dokümanında GERÇEK bir değişiklik
 * olur ve olay üretilir. `apps/web/lib/realtime/connection.ts` emojiyi sürüm
 * kapısından ÖNCE ele alır (`emitEmoji`), tam da bu yüzden.
 *
 * **Beyaz liste — üçüncü ve son kapı (KK-123).** Protokol (`emojiSchema`) ve
 * `connection.ts` zaten iki kez süzüyor; buradaki kontrol *kalıcılık*
 * sınırınındır: mongoose şeması `emoji: String` olduğu için model tek başına
 * hiçbir şey engellemez ve `Emoji` tipi yalnız derleme zamanında yaşar. Bir
 * kez veritabanına serbest metin girerse, ODAYA BAĞLANAN HERKESE dağıtılmaya
 * aday olur.
 *
 * **Tek gidiş-dönüş:** önce okuyup sonra yazmıyoruz. Odanın var olup olmadığı
 * `findOneAndUpdate`in `null` dönüşünden anlaşılır; instance başına TEK change
 * stream olduğu için (ADR-0002) gereksiz her Atlas işlemi paylaşılan bütçeden
 * yer.
 */
export async function pushEmoji(
  code: string,
  seat: Player,
  emoji: Emoji,
): Promise<TransitionResult> {
  const allowed = emojiSchema.safeParse(emoji)
  if (!allowed.success) return { ok: false, code: 'INVALID_MESSAGE' }

  const lastEmoji = { from: seat, emoji: allowed.data, at: new Date() }

  const updated = await Room.findOneAndUpdate(
    { code },
    { $set: { lastEmoji } },
    { returnDocument: 'after' },
  ).lean()
  if (updated === null) return { ok: false, code: 'ROOM_NOT_FOUND' }

  const events: RoomEvent[] = [{ kind: 'emoji', from: seat }]
  return { ok: true, room: updated, events }
}
