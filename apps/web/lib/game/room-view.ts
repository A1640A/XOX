import type { RoomDoc } from '@xox/db'
import { boardFromCells, evaluateStatus } from '@xox/game-core'
import type { Player, StateMessage, TransportStatus } from '@xox/shared'
import { toTransportStatus } from '@xox/shared'

/** Sonuç okumak için gereken en küçük oda parçası. */
export type StatusInput = Pick<RoomDoc, 'state' | 'board'>

/**
 * Odanın tahtasından taşıma durumunu okur. Kural mantığı **yeniden
 * yazılmaz**: karar `@xox/game-core`'un `evaluateStatus`'una, çeviri
 * `@xox/shared`'ın `toTransportStatus`'una delege edilir (kural 4).
 *
 * ⚠️ **Bilinen boşluk (W1-02):** pes / süre aşımı / terk ile biten oyunun
 * sebebi ve kazananı `rooms` dokümanında **tutulmuyor** (§3.2 — `RoomDoc`ta
 * sonuç alanı yok, sonuç `games`e yazılıyor). O yüzden "oda `finished` ama
 * tahta bitmemiş" durumunda buradan uydurma bir kazanan çıkarmak yerine
 * `draw` dönüyoruz: oyun kapanır, kimseye yanlış galibiyet atfedilmez. P0 bu
 * dalı hiç üretmez (tek bitiş yolu `applyMove`ın kazanan çizgisi/beraberliği);
 * W1-02 pes/terk yazarken gerçek sonucu taşıyacak.
 */
export function roomTransportStatus(room: StatusInput): TransportStatus {
  const status = evaluateStatus(boardFromCells(room.board))
  if (status.kind !== 'playing') return toTransportStatus(status)
  if (room.state === 'finished') {
    // Sessiz kalmıyor: bu dal P0'da ULAŞILAMAZ olmalı. W1-02 `resign` yazdığı
    // gün buraya düşülürse pes eden oyuncu `game:over {kind:'draw'}` görür ve
    // hiçbir kapı kırılmaz — o yüzden değişmez ihlali GÜRÜLTÜ çıkarsın.
    console.error(
      '[room-view] oda finished ama tahta bitmemiş — sonuç `rooms`ta taşınmıyor (TODO W1-02)',
    )
    return { kind: 'draw' }
  }
  return status
}

function epochOrNull(value: Date | null): number | null {
  return value === null ? null : value.getTime()
}

/**
 * Tam durum yayını (§2.4 / §3.4). Yeniden bağlanan istemcinin gördüğü tek
 * gerçek budur; Z2 rotasyonu yüzünden her bağlantıda en az bir kez gönderilir.
 *
 * `you` çağırandan gelir — alıcının kendi koltuğu (KK-050). Tahta bilinçli
 * kopyalanır: mongoose `lean()` dizisini protokol nesnesine referansla bağlamak,
 * ileride aynı odayı iki bağlantıya yayınlarken paylaşılan durum yaratırdı.
 */
export function toStateMessage(room: RoomDoc, you: Player, serverTime: number): StateMessage {
  return {
    type: 'state',
    roomCode: room.code,
    board: [...room.board],
    status: roomTransportStatus(room),
    players: { X: room.seats.X, O: room.seats.O },
    you,
    version: room.version,
    turnDeadline: epochOrNull(room.turnDeadline),
    graceEndsAt: epochOrNull(room.disconnected?.graceEndsAt ?? null),
    rematch:
      room.rematch === null
        ? null
        : { by: room.rematch.by, expiresAt: room.rematch.expiresAt.getTime() },
    serverTime,
  }
}
