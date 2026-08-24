import type { ErrorCode, MoveRejectionReason, Player, TransportStatus } from '@xox/shared'
import type { RoomDoc } from '../models/room'

/**
 * Otoriter geçişlerin ortak dönüş biçimi (tasarım §3.7). **Hiçbir geçiş
 * istisna FIRLATMAZ** — bilinen her başarısızlık yolu bu birliğin `ok:false`
 * dalıyla ayrıştırılabilir bir sonuç olarak döner. (Bu, mongoose/ağ
 * seviyesinde beklenmeyen bir hatanın hiç fırlatılamayacağı anlamına gelmez;
 * yalnız TASARIMIN öngördüğü hata kodları — `ROOM_NOT_FOUND`, `ROOM_FULL`,
 * `not-your-turn` vb. — istisna olarak sızdırılmaz.)
 */
export type TransitionResult<T = RoomDoc> =
  { ok: true; room: T; events: RoomEvent[] } | { ok: false; code: ErrorCode | MoveRejectionReason }

/**
 * Geçişin NE olduğunu anlatan yerel bilgi (tasarım §3.7). **Yayın için
 * kullanılmaz** — R1 (fan-out saflığı) gereği yayın yalnız change stream'den
 * gelir; bu tip yalnız çağıran uca anında hata döndürmek ve günlük yazmak
 * içindir.
 */
export type RoomEvent =
  | { kind: 'created' }
  | { kind: 'joined'; seat: Player }
  | { kind: 'reconnected'; seat: Player }
  | { kind: 'moved'; index: number; by: Player }
  | { kind: 'finished'; status: TransportStatus }
  | { kind: 'resigned'; by: Player }
  | { kind: 'rematch-offered'; by: Player }
  | { kind: 'rematch-accepted' }
  | { kind: 'settled'; reason: 'timeout' | 'abandon' }
  | { kind: 'emoji'; from: Player }
