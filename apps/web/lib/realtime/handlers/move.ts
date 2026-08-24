import { errorCodeSchema, moveRejectionReasonSchema } from '@xox/shared'
import type { ClientMessageOf, HandlerContext } from '../context'

const ERROR_MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı.',
  ROOM_FULL: 'Bu odada bir koltuğunuz yok.',
  SERVER_ERROR: 'Hamle uygulanamadı.',
}

/**
 * Çevrimiçi oyunun kalbi — ve **R1'in en sert uygulandığı yer**.
 *
 * Başarılı hamlede istemciye **hiçbir şey gönderilmez**: yazan oyuncu kendi
 * hamlesinin onayını da change stream yankısından alır (`move:applied`,
 * `connection.ts` §5.3). Buraya bir "hızlı yol" eklemek, aynı instance'a düşen
 * iki oyuncuda E2E'yi yeşil yakar ama fan-out'u hiç sınamaz — Dalga 0'ın
 * kanıtı tam olarak burada durur (ADR-0002 R1).
 *
 * Yalnız REDDETME istemciye doğrudan yazılır, çünkü reddedilen hamle
 * veritabanına hiç yazılmaz (`version` artmaz) ve dolayısıyla change
 * stream'den gelmez.
 */
export async function handleMove(
  context: HandlerContext,
  message: ClientMessageOf<'move'>,
): Promise<void> {
  const result = await context.db.applyMove(
    context.roomCode,
    context.identity.userId,
    message.index,
  )
  if (result.ok) return

  const rejection = moveRejectionReasonSchema.safeParse(result.code)
  if (rejection.success) {
    context.connection.send({
      type: 'move:rejected',
      index: message.index,
      reason: rejection.data,
    })
    return
  }

  // `TransitionResult` hata kodu `ErrorCode | MoveRejectionReason` birliğidir;
  // reddetme olmadığı kesinleştikten sonra kalanı şemayla DARALTIYORUZ —
  // `as ErrorCode` yazmak, geçişler yeni bir kod eklediğinde protokol dışı bir
  // değeri sessizce tele koyardı.
  const known = errorCodeSchema.safeParse(result.code)
  const code = known.success ? known.data : 'SERVER_ERROR'
  context.connection.sendError(code, ERROR_MESSAGES[code] ?? 'Hamle uygulanamadı.')
}
