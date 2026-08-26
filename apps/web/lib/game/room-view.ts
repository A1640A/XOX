import type { RoomDoc } from '@xox/db'
import { resolveBoardConfig } from '@xox/db'
import { boardFromCells, evaluateStatus } from '@xox/game-core'
import type { BoardSize, LastMove, Player, StateMessage, TransportStatus } from '@xox/shared'
import { boardSizeSchema, toTransportStatus, transportStatusSchema } from '@xox/shared'
import { logError } from '@/lib/log'

/** Sonuç okumak için gereken en küçük oda parçası. */
export type StatusInput = Pick<RoomDoc, 'state' | 'board' | 'result' | 'size' | 'winLength'>

/**
 * `rooms.result` → `TransportStatus`. Alanlar birebir aynı olduğu için elle
 * bir eşleme YOK: protokol şemasının kendisi doğrular. Böylece ADR-0001'in
 * `reason === 'line' ⟺ line !== null` değişmezi veritabanından gelen veride de
 * çalışma zamanında kontrol edilir — elle yazılmış bir dönüştürücü bu
 * kontrolü sessizce atlardı.
 */
function storedStatus(result: RoomDoc['result']): TransportStatus | null {
  if (result === null) return null
  const parsed = transportStatusSchema.safeParse(result)
  if (!parsed.success) {
    logError('[room-view] rooms.result protokol şemasına uymuyor', {}, parsed.error.issues)
    return null
  }
  return parsed.data
}

/**
 * Odanın **sonucunu** okur. Kural mantığı **yeniden yazılmaz**: karar
 * `@xox/game-core`'un `evaluateStatus`'una, çeviri `@xox/shared`'ın
 * `toTransportStatus`'una delege edilir (kural 4).
 *
 * Öncelik `rooms.result` alanındadır (W1-02): pes / süre aşımı / terk ile
 * biten oyunun kazananı tahtadan OKUNAMAZ, o yüzden oda dokümanına
 * damgalanıyor (`models/room.ts` → `RoomResult`). Alan yoksa tahtaya bakılır;
 * tahta da bitmemişken oda `finished` ise **değişmez ihlali** vardır ve
 * sessiz kalmaz.
 */
export function roomTransportStatus(room: StatusInput): TransportStatus {
  const stored = storedStatus(room.result)
  if (stored !== null) return stored

  const config = resolveBoardConfig(room)
  const status = evaluateStatus(boardFromCells(room.board, config), config)
  if (status.kind !== 'playing') return toTransportStatus(status)
  if (room.state === 'finished') {
    // Buraya düşmek, bitişi yazan yolun `result` alanını DOLDURMADIĞI anlamına
    // gelir; sonuç ekranı kimseye yanlış galibiyet atfetmesin diye oyunu
    // sonuçsuz kapatıyoruz — ama gürültü çıkararak (W1-02).
    logError(
      '[room-view] oda finished ama rooms.result BOŞ — kazanan taşınamıyor, draw ile kapatıldı',
    )
    return { kind: 'draw' }
  }
  return status
}

function epochOrNull(value: Date | null): number | null {
  return value === null ? null : value.getTime()
}

/**
 * `resolveBoardConfig`'in `size`'ı `game-core`'un `BOARD_MODES`'undan gelir
 * (yalnız 3/6/11) ama TİPİ salt `number`dır — protokolün `boardSizeSchema`sı
 * literal birleşim ister. `parseBoardConfig` bu üç değer DIŞINDA hiçbir
 * `size` KABUL ETMEZ, yani bu güvenli bir daraltmadır; yine de KK-B32'nin
 * disiplinini korumak için sessizce cast ETMEK yerine çalışma zamanında
 * doğrulanır — beklenmeyen bir değer 3'e düşer ve gürültü çıkarır.
 */
function protocolBoardSize(size: number): BoardSize {
  const parsed = boardSizeSchema.safeParse(size)
  if (parsed.success) return parsed.data
  logError('[room-view] resolveBoardConfig beklenmeyen bir size döndürdü', {}, { size })
  return 3
}

/**
 * Rakibin son oynadığı hücre (ADR-0015 §3, KK-B55). `RoomDoc.moves`'un SON
 * elemanından üretilir; `moves` dizisinin TAMAMI GÖNDERİLMEZ (yük bütçesi,
 * KK-B70 — hiçbir ekran hamle geçmişini göstermiyor).
 */
function lastMoveOf(room: RoomDoc): LastMove | null {
  const last = room.moves.at(-1)
  if (last === undefined) return null
  return { index: last.index, by: last.by }
}

/**
 * Tam durum yayını (§2.4 / §3.4). Yeniden bağlanan istemcinin gördüğü tek
 * gerçek budur; Z2 rotasyonu yüzünden her bağlantıda en az bir kez gönderilir.
 *
 * `you` çağırandan gelir — alıcının kendi koltuğu (KK-050). Tahta bilinçli
 * kopyalanır: mongoose `lean()` dizisini protokol nesnesine referansla bağlamak,
 * ileride aynı odayı iki bağlantıya yayınlarken paylaşılan durum yaratırdı.
 *
 * `size`/`winLength` `resolveBoardConfig`'in TEK okuma kapısından geçirilir
 * (ADR-0014 §2) — `room.size ?? 3` YAZILMAZ, o satır sabitin ikinci kopyası
 * olurdu. Eski/bozuk kayıtlar bile SESSİZCE ya da gürültüyle `{3,3}`'e düşer,
 * asla `undefined` göndermez.
 */
export function toStateMessage(room: RoomDoc, you: Player, serverTime: number): StateMessage {
  const config = resolveBoardConfig(room)
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
    size: protocolBoardSize(config.size),
    winLength: config.winLength,
    lastMove: lastMoveOf(room),
  }
}
