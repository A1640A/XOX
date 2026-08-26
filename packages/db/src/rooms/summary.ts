import type { SeatOccupant } from '@xox/shared'
import { Room } from '../models/room'
import type { RoomState } from '../models/room'
import { resolveBoardConfig } from './board-config'

/**
 * `getRoomSummary`'nin GERÇEKTE döndürdüğü alanları taşıyan dar tip.
 *
 * **BİLİNÇLİ OLARAK `RoomDoc`'un tamamı DEĞİL.** `RoomDoc` kullanılsaydı çağıran
 * (`GET /api/rooms/[code]`) `presence`/`board`/`moves`/`version` gibi hiç
 * seçilmemiş alanları "var" sanabilirdi — tip, projeksiyonun GERÇEKTE ne
 * döndürdüğü konusunda yalan söylerdi. Projeksiyon dizesi genişlerse/daralırsa
 * bu tip VE aşağıdaki `PROJECTION` sabiti BİRLİKTE güncellenmeli; `summary.test.ts`
 * bunun tek koruyucusu (bkz. o dosyadaki yorum — TypeScript projeksiyon
 * daraltmasını YAKALAMAZ, yalnız çalışma zamanı testi yakalar).
 *
 * `size`/`winLength` ZORUNLU alanlardır (SB-09, US-B03): katılan oyuncu
 * odaya girmeden önce hangi oyunu oynayacağını görebilmelidir. Değerler
 * `resolveBoardConfig`'ten geçirilmiş, ÇÖZÜLMÜŞ (resolved) değerlerdir — eski
 * (alan yok) ya da bozuk bir dokümanda bile `{3,3}`'ten daha az bir şey asla
 * dönmez (ADR-0014 §2).
 */
export interface RoomSummary {
  code: string
  state: RoomState
  seats: { X: SeatOccupant | null; O: SeatOccupant | null }
  size: number
  winLength: number
}

/**
 * Mongo projeksiyon dizesi — `RoomSummary`'nin `Room` dokümanından OKUNAN
 * alan listesiyle BİRE BİR eşleşmek zorunda (`size`/`winLength` `resolveBoardConfig`
 * girdisi olarak da seçilmek ZORUNDA, aksi hâlde çözücü onları hep `undefined`
 * görür ve her oda {3,3} sanılır). Bu string TypeScript'e görünmez:
 * `Room.findOne(...).select(x)` `x` daraltılsa da derleme zamanı hiçbir hata
 * vermez, dönen belge sessizce eksik alanlarla gelir. Tek koruma
 * `summary.test.ts`'teki çalışma zamanı sondası.
 */
const PROJECTION = 'code state seats size winLength'

/**
 * Oda özeti — WS upgrade ÖNCESİ salt-okunur ön kontrol için (tasarım §5.1/§7,
 * KK-033). **Bu bir durum GEÇİŞİ değildir** — `rooms/`'un diğer fonksiyonlarının
 * aksine `TransitionResult` DÖNMEZ, koşullu yazma yapmaz, `casUpdateRoom`
 * kullanmaz. Yalnız `Room` koleksiyonundan dar bir projeksiyon okur.
 *
 * `code` ÖNCEDEN doğrulanmış kabul edilir (`@xox/shared`'ın `roomCodeSchema`'sı
 * ve normalleştirme ÇAĞIRANIN sorumluluğudur — 400 `INVALID_CODE` bir HTTP
 * kararıdır, bu fonksiyon HTTP bilmez). Kullanıcı girdisi doğrudan buraya
 * PASLANMAMALI; çağıran zod'dan geçmiş değeri vermeli.
 *
 * Oda bulunamazsa (veya TTL ile silinmişse) çıplak `null` döner — `ok:false`
 * bir `TransitionResult` DEĞİL, çünkü "oda yok" burada bir geçiş
 * başarısızlığı değil, bir okuma sonucu. Çağıran bunu 404 `ROOM_NOT_FOUND`'a
 * çevirmeye devam eder.
 *
 * `canJoin` BURADA HESAPLANMAZ (bkz. `CTR-003`) — bu fonksiyon ham oda
 * özetini döner, türetme çağıranın işi olarak kalır.
 */
export async function getRoomSummary(code: string): Promise<RoomSummary | null> {
  const room = await Room.findOne({ code }).select(PROJECTION).lean()
  if (room === null) return null
  const config = resolveBoardConfig(room)
  return { code: room.code, state: room.state, seats: room.seats, ...config }
}
