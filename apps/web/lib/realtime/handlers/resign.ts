import { errorCodeSchema } from '@xox/shared'
import type { ErrorCode } from '@xox/shared'
import type { HandlerContext } from '../context'

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı.',
  ROOM_FULL: 'Bu odada bir koltuğunuz yok.',
  GAME_OVER: 'Oyun zaten bitti.',
}

/**
 * Pes etme — KK-054, tasarım §3.7.
 *
 * **R1:** başarılı pes etmede istemciye HİÇBİR ŞEY gönderilmez. Pes eden
 * oyuncu da sonucu (`game:over`) change stream yankısından alır; buraya bir
 * "hızlı yol" eklemek aynı instance'a düşen iki oyuncuda E2E'yi yeşil yakar
 * ama fan-out'u hiç sınamaz (ADR-0002 R1, `move.ts` ile aynı gerekçe).
 *
 * Yalnız REDDETME doğrudan yazılır: reddedilen pes veritabanına hiç yazılmaz,
 * dolayısıyla change stream'den gelmez.
 */
export async function handleResign(context: HandlerContext): Promise<void> {
  const result = await context.db.resign(context.roomCode, context.identity.userId)
  if (result.ok) return

  // `TransitionResult` kodu `ErrorCode | MoveRejectionReason` birliğidir;
  // `as ErrorCode` yazmak geçişler yeni bir kod eklediğinde protokol dışı bir
  // değeri sessizce tele koyardı (`move.ts` ile aynı daraltma).
  const known = errorCodeSchema.safeParse(result.code)
  const code = known.success ? known.data : 'SERVER_ERROR'
  context.connection.sendError(code, ERROR_MESSAGES[code] ?? 'Pes etme uygulanamadı.')
}
