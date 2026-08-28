import { boardFromCells, nextPlayer } from '@xox/game-core'
import type { Player } from '@xox/shared'
import type { RoomDoc } from '../models/room'
import { resolveBoardConfig } from './board-config'

/**
 * Zamanlayıcı kurmak için gereken EN AZ alan. `dueSettlement`in girdisinden
 * bilerek ayrı: `createSettlementTimer` (apps/web) yalnız "ne zaman bakmalıyım"
 * sorusunu sorar, "kim kaybetti"yi sormaz — daha geniş bir tip istemek o
 * modülün testlerine alakasız fixture alanları taşırdı.
 */
export type DeadlineFields = Pick<RoomDoc, 'state' | 'turnDeadline' | 'disconnected'>

/**
 * `dueSettlement`in gördüğü tek şey (tasarım §5.7). `RoomDoc`un tamamı değil
 * sayılı alanı isteniyor: fonksiyon SAF kalsın, testte sahte bir oda kurmak
 * birkaç satır olsun ve ileride odaya eklenen bir alan bu kararı sessizce
 * etkileyemesin.
 *
 * `presence` LİSTEDE (KK-076): sonucu yazacak otorite bağlı bir istemcidir;
 * kimse bağlı değilken hiçbir sonuç yazılmaz. `size`/`winLength` de listede,
 * çünkü sıra sahibi tahtadan okunur ve tahtanın boyu odaya göre değişir
 * (ADR-0014).
 */
export type SettlementInput = DeadlineFields &
  Pick<RoomDoc, 'board' | 'presence' | 'size' | 'winLength'>

export interface DueSettlement {
  reason: 'timeout' | 'abandon'
  loser: Player
}

/** Dolma anı `now`a EŞİTSE dolmuş sayılır — sınır deterministik olsun. */
function expiredAt(deadline: Date | null, now: number): number | null {
  if (deadline === null) return null
  const at = deadline.getTime()
  return at <= now ? at : null
}

/**
 * "Bu odaya bir dahaki sefere ne zaman bakmalıyım?" — epoch ms, yoksa `null`.
 * ADR-0004'ün BİRİNCİ yürütme yolunun (zamanlayıcı) tek bilgi kaynağı.
 *
 * `dueSettlement` ile AYNI dosyada olması bilinçli: "hangi alanlar bir son
 * tarih taşır" bilgisi iki yerde yaşarsa (ör. odaya üçüncü bir son tarih
 * eklenince) zamanlayıcı hiç kurulmaz ama tembel yol yine de sonlandırır —
 * çift yürütme sessizce TEK yürütmeye düşer ve bunu hiçbir kapı görmez.
 */
export function nextDeadlineAt(room: DeadlineFields): number | null {
  if (room.state !== 'playing') return null

  const candidates: number[] = []
  if (room.turnDeadline !== null) candidates.push(room.turnDeadline.getTime())
  if (room.disconnected !== null) candidates.push(room.disconnected.graceEndsAt.getTime())
  if (candidates.length === 0) return null

  return Math.min(...candidates)
}

/**
 * Süre aşımı / terk kararının SAF hâli (tasarım §5.7, ADR-0004). DB'ye
 * dokunmaz, zaman okumaz — `now` dışarıdan gelir. Yazmayı aynı klasördeki
 * `settleDeadlines` yapar; bu fonksiyon yalnız NE olması gerektiğini söyler.
 *
 * Kurallar:
 * - `state !== 'playing'` → `null` (biten oyun bir daha bitmez)
 * - iki koltuk da bağlı değil → `null` (KK-076; aşağıda ayrıca)
 * - `turnDeadline` dolmuş → sırası gelen oyuncu kaybeder (`timeout`)
 * - `disconnected.graceEndsAt` dolmuş → kopan oyuncu kaybeder (`abandon`)
 * - ikisi de dolmuşsa **önce dolan** kazanır; **eşitlikte `timeout`**
 *   (spec §3.7 — iki instance aynı anda baksa bile aynı sonuca varsın)
 *
 * **Neden `packages/db` (W2-01 kararı):** bu kural W2-01'e kadar
 * `apps/web/lib/game/deadlines.ts`teydi ve tek üretim tüketicisi olacak
 * `settleDeadlines` onu import EDEMİYORDU — bağımlılık yönü `packages/db →
 * apps/web` olamaz. `packages/game-core` de yeri değil: ADR-0001 gereği kural
 * motoru pes etme/süre aşımı/terk kavramlarını BİLMEZ ve bilmemelidir.
 * `packages/shared` da değil: karar `RoomDoc` şekline bağlı. Kural burada TEK
 * kopya; `apps/web` bunu `@xox/db`den tüketir.
 */
export function dueSettlement(room: SettlementInput, now: number): DueSettlement | null {
  if (room.state !== 'playing') return null

  // KK-076 / ADR-0004 değişmezi: sonucu yazacak otorite BAĞLI bir istemcidir.
  // İki oyuncu da düştüyse oyun `finishedAt:null` kalır ve oda TTL ile silinir
  // — bunu telafi edecek bir cron/süpürücü BİLEREK yoktur. Kural burada, saf
  // kararın içinde: yazma yolunda dursaydı `settleDeadlines`e ikinci bir
  // "karar" sızar ve tembel yol ile zamanlayıcı yolu farklı davranabilirdi.
  if (room.presence.X === null && room.presence.O === null) return null

  const timeoutAt = expiredAt(room.turnDeadline, now)
  const abandonAt = expiredAt(room.disconnected?.graceEndsAt ?? null, now)

  if (timeoutAt === null && abandonAt === null) return null

  const abandonWins = timeoutAt === null || (abandonAt !== null && abandonAt < timeoutAt)
  if (abandonWins) {
    // `abandonAt` null olamaz: ikisi birden null olsaydı yukarıda dönerdik ve
    // `timeoutAt === null` dalında abandon dolu demektir.
    const seat = room.disconnected?.seat
    if (seat === undefined) return null
    return { reason: 'abandon', loser: seat }
  }

  // ⚠️ `boardFromCells(cells)` varsayılanı 3×3'tür ve 121 hücrelik bir tahtada
  // `RangeError` FIRLATIR. `settleDeadlines` iskelet olduğu sürece bu yol hiç
  // koşmamıştı; gövde dolunca 11×11 bir odada süre dolduğunda her temasta
  // istisna üretir, oturum onu yutar ve oyun sonsuza kadar askıda kalırdı.
  // Konfigürasyon okuma tarafının TEK kapısından (`resolveBoardConfig`) gelir.
  const config = resolveBoardConfig(room)
  return { reason: 'timeout', loser: nextPlayer(boardFromCells(room.board, config)) }
}
