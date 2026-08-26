import { EMOJI_RATE_LIMIT, errorCodeSchema } from '@xox/shared'
import type { ErrorCode } from '@xox/shared'
import { tr } from '@/messages/tr'
import type { RoomConnection } from '../connection'
import type { ClientMessageOf, HandlerContext } from '../context'

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı.',
  ROOM_FULL: 'Bu odada bir koltuğunuz yok.',
}

/**
 * Emoji'ye ÖZEL kayan pencere (KK-124), bağlantı başına.
 *
 * **Neden genel sınır (WS-001, 10 sn / 20 çerçeve) yetmiyor:** emoji spam'e en
 * açık yol — bedava, tekrarlanabilir ve rakibin ekranını doldurur. Genel bütçe
 * oyun temposuna göre ölçülmüştü (seyrek hamle + 25 sn'de bir nabız); bir
 * saldırgan onun ALTINDA kalarak 10 saniyede 19 emoji gönderebilir ve her biri
 * gerçek bir Atlas yazması + gerçek bir change stream olayı üretirdi. Instance
 * başına TEK stream olduğu için (ADR-0002) fatura odadaki kullanıcıya değil, o
 * instance'taki BÜTÜN odalara çıkar.
 *
 * **İki sınırın etkileşimi:** 5 < 20 olduğu için emoji seli DAİMA önce bu
 * kapıya çarpar; bu kapı bağlantıyı KAPATMAZ, yalnız çerçeveyi düşürür. Israr
 * eden istemci reddedilen çerçeveleriyle genel pencereyi de doldurur (genel
 * sayaç kabul/ret ayırmaz) ve 40'ta 4400 ile kapatılır — kademelenme kasıtlı.
 * Meşru kullanım ikisine de değmez: 5 emoji + nabız + hamle < 20.
 *
 * **Yalnız KABUL EDİLEN emoji sayılır** (genel sınırdan bilinçli sapma):
 * reddedilenler de sayılsaydı, ısrarcı bir istemcinin penceresi kendi
 * retleriyle sürekli dolu kalır ve sınır kayan pencereden kalıcı cezaya
 * dönüşürdü — 10 saniye sonra meşru bir emoji atmak imkânsız olurdu.
 *
 * `WeakMap`: durum bağlantı NESNESİNE bağlı. Oturum bitince kayıt kendiliğinden
 * düşer; oda kodu ya da userId anahtarlı bir modül-düzeyi sözlük olsaydı uzun
 * ömürlü bir instance'ta sonsuza kadar büyürdü.
 */
const emojiWindows = new WeakMap<RoomConnection, number[]>()

/** Bütçe varsa damgayı kaydeder ve `true` döner; yoksa hiçbir şey yazmaz. */
function admitEmoji(connection: RoomConnection, now: number): boolean {
  const cutoff = now - EMOJI_RATE_LIMIT.windowMs
  const stamps = (emojiWindows.get(connection) ?? []).filter((at) => at > cutoff)
  emojiWindows.set(connection, stamps)
  if (stamps.length >= EMOJI_RATE_LIMIT.count) return false
  stamps.push(now)
  return true
}

/**
 * Emoji tepkisi — KK-122…124, tasarım §5.8.
 *
 * **R1:** başarılı emojide istemciye HİÇBİR ŞEY gönderilmez. Gönderen de kendi
 * emojisini change stream yankısından alır (`connection.ts` `emitEmoji`, sürüm
 * kapısından ÖNCE) — buraya bir "hızlı yol" eklemek aynı instance'a düşen iki
 * oyuncuda testi yeşil yakar ama fan-out'u hiç sınamaz (`resign.ts` ile aynı
 * gerekçe). İstemcinin `inFlight:'emoji'` kilidini açan da o yankıdır.
 *
 * **Beyaz liste burada TEKRARLANMAZ.** `clientMessageSchema` (`emojiSchema`
 * = `z.enum(EMOJI_PALETTE)`) palet dışı her değeri `session.ts`'te
 * `INVALID_MESSAGE` ile düşürüyor, bu handler'a asla ulaşmıyor; ikinci kapı
 * `connection.ts`'in yayın yolunda, üçüncüsü `packages/db`'nin yazma yolunda.
 * Buraya dördüncüsünü koymak ULAŞILAMAZ bir dal olurdu.
 */
export async function handleChatEmoji(
  context: HandlerContext,
  message: ClientMessageOf<'chat:emoji'>,
): Promise<void> {
  const seat = context.connection.seat()
  if (seat === null) {
    // `session.ts` koltuksuz çerçeveyi zaten eliyor; bu, `pushEmoji`nin bir
    // `Player` istemesini `as`sız karşılayan ikinci savunma hattı.
    context.connection.sendError('ROOM_FULL', 'Bu odada bir koltuğunuz yok.')
    return
  }

  if (!admitEmoji(context.connection, context.now())) {
    context.connection.sendError('RATE_LIMITED', tr.chat.tooFast)
    return
  }

  const result = await context.db.pushEmoji(context.roomCode, seat, message.emoji)
  if (result.ok) return

  // `TransitionResult` kodu `ErrorCode | MoveRejectionReason` birliğidir;
  // `as ErrorCode` yazmak protokol dışı bir değeri sessizce tele koyardı.
  const known = errorCodeSchema.safeParse(result.code)
  const code = known.success ? known.data : 'SERVER_ERROR'
  context.connection.sendError(code, ERROR_MESSAGES[code] ?? 'Emoji gönderilemedi.')
}
