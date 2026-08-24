import { WS_CLOSE } from '@xox/shared'
import type { ClientMessageOf, HandlerContext } from '../context'

/**
 * `join` iki işi birden yapar (tasarım §5.2 adım 5+8):
 * 1. Koltuk atama / yeniden bağlanma / takeover — `packages/db`'nin koşullu
 *    `joinRoom` geçişi (`presence[seat]` yazımı, `version+1`).
 * 2. Ardından **tam durum** yayını.
 *
 * (2) bir R1 ihlali DEĞİLDİR: `state`, çağıranın KENDİ isteğine verilen bir
 * okuma yanıtıdır (KK-047 resync yolu da aynı mesajı kullanır), başka bir
 * bağlantının ürettiği bir olayın süreç içi kısayolu değil. Rakip, bu
 * `joinRoom` yazımını yalnız change stream'den öğrenir.
 */
export async function handleJoin(
  context: HandlerContext,
  message: ClientMessageOf<'join'>,
): Promise<void> {
  if (message.roomCode !== context.roomCode) {
    // Bir soket TEK odaya bağlıdır (URL'deki oda). Başka bir odaya `join`
    // yazmak, o odanın durumunu bu soketten sızdırma denemesidir.
    context.connection.sendError('INVALID_CODE', 'Bu bağlantı başka bir odaya ait.')
    return
  }

  const result = await context.db.joinRoom(
    context.roomCode,
    { userId: context.identity.userId, name: context.identity.name },
    context.connId,
  )

  if (!result.ok) {
    if (result.code === 'ROOM_NOT_FOUND') {
      context.connection.close(WS_CLOSE.NOT_FOUND, 'room-not-found')
      return
    }
    if (result.code === 'ROOM_FULL') {
      context.connection.close(WS_CLOSE.FORBIDDEN, 'room-full')
      return
    }
    context.connection.sendError('SERVER_ERROR', 'Odaya katılınamadı.')
    return
  }

  if (!context.connection.primeState(result.room)) {
    // `joinRoom` başarılı dönüp koltuk vermediyse otorite ile taşıma katmanı
    // ayrışmış demektir; oda içeriğini koltuksuz bir bağlantıya yayınlamayız.
    context.connection.close(WS_CLOSE.FORBIDDEN, 'no-seat')
  }
}
