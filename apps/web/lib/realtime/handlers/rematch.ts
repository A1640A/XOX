import { errorCodeSchema } from '@xox/shared'
import type { ErrorCode } from '@xox/shared'
import type { TransitionResult } from '@xox/db'
import type { HandlerContext } from '../context'

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı.',
  ROOM_FULL: 'Bu odada bir koltuğunuz yok.',
  REMATCH_EXPIRED: 'Rövanş teklifi zaman aşımına uğradı.',
  INVALID_MESSAGE: 'Oyun bitmeden rövanş istenemez.',
}

/**
 * **R1:** başarılı rövanş yazımında istemciye hiçbir şey gönderilmez. Teklif
 * de kabul de oda dokümanına yazılır; `rematch:offered` / tam `state` her iki
 * tarafa da change stream'den gider (`connection.ts` türetilmiş olaylar).
 */
function reportFailure(context: HandlerContext, result: TransitionResult, fallback: string): void {
  if (result.ok) return
  const known = errorCodeSchema.safeParse(result.code)
  const code = known.success ? known.data : 'SERVER_ERROR'
  context.connection.sendError(code, ERROR_MESSAGES[code] ?? fallback)
}

/**
 * Rövanş teklifi — KK-055…057.
 *
 * Karşılıklı teklifin doğrudan kabule dönüşmesi (spec §3.8) **otoritede**
 * yaşar (`packages/db/src/rooms/rematch.ts`): iki oyuncu iki farklı instance'ta
 * olabilir, "rakip de teklif etti mi?" sorusunun tek doğru cevabı oda
 * dokümanıdır.
 */
export async function handleRematchOffer(context: HandlerContext): Promise<void> {
  const result = await context.db.offerRematch(context.roomCode, context.identity.userId)
  reportFailure(context, result, 'Rövanş teklifi gönderilemedi.')
}

/** Rövanş kabulü — KK-056/058. Koltuk takası ve `version` disiplini otoritede. */
export async function handleRematchAccept(context: HandlerContext): Promise<void> {
  const result = await context.db.acceptRematch(context.roomCode, context.identity.userId)
  reportFailure(context, result, 'Rövanş kabul edilemedi.')
}
