import type { Player } from '@xox/shared'
import { DISCONNECT_GRACE_SECONDS } from '@xox/shared'
import { Room } from '../models/room'
import { casUpdateRoom } from './cas'

/**
 * Kaybedilen `version` yarışında kaç kez yeniden okunup denenir.
 *
 * ⚠️ Bu döngü bir "belki iyi olur" değil, bir HATA DÜZELTMESİDİR (W1-03).
 * Tek denemeli sürümde okuma ile CAS arasına ARADAKİ HERHANGİ bir yazma
 * (rakibin hamlesi, tembel `settleDeadlines`, rakibin `join`i) girdiğinde
 * `expectedVersion` tutmuyor ve detach **sessizce hiçbir şey yazmıyordu**.
 * Sonucu görünmez ama ölümcül: `presence[seat]` ölü bir `connId` ile takılı
 * kalır, `disconnected` hiç damgalanmaz → rakip ne `opponent:left` görür ne de
 * 30 saniye sonunda terk galibiyetini (ADR-0004) alır; oyun sonsuza kadar
 * "rakip düşünüyor" ekranında donar. Pencere bir Atlas gidiş-dönüşü kadar
 * (~10-50 ms) ve tam da bağlantının koptuğu an rakibin hamle yapması gibi
 * TAMAMEN olağan bir senaryoda açılıyor.
 *
 * Çıplak sayı bilerek: sabitten türetilmiş bir test kör olur.
 */
const DETACH_CAS_ATTEMPTS = 3

/**
 * WS bağlantısı kapanınca çağrılır (tasarım §5.2 adım 10 / §5.4).
 *
 * **Koşulludur:** yalnız `presence[seat].connId === connId` ise yazar — bu
 * koşul hem ilk okumada hem de `casUpdateRoom`'un `extraFilter`'ında ayrıca
 * uygulanır, böylece okuma ile yazma arasında bir takeover araya girse bile
 * (yarış) yazma 0 doküman günceller ve sessizce hiçbir şey değişmez.
 *
 * Devredilmiş (takeover edilmiş) eski bağlantının kapanışı **hiçbir şey
 * yazmaz** — aksi hâlde takeover anında sahte bir "rakip koptu" olayı
 * yayınlanırdı (klasik yarış hatası, AC6).
 *
 * Sahiplik koşulu (`extraFilter`) her denemede yeniden uygulandığı için
 * yeniden deneme takeover güvenliğini ZAYIFLATMAZ: araya giren yazma bir
 * takeover ise ikinci okuma `presence[seat].connId !== connId` görüp erken
 * döner, başka bir yazma ise yalnız `version` tazelenir.
 */
export async function detachConnection(code: string, seat: Player, connId: string): Promise<void> {
  for (let attempt = 0; attempt < DETACH_CAS_ATTEMPTS; attempt += 1) {
    // Döngü BİLEREK ardışık: her deneme bir öncekinin sonucuna (taze `version`)
    // bağlıdır, paralelleştirilemez.
    const room = await Room.findOne({ code }).lean()
    if (room === null) return

    const presence = room.presence[seat]
    if (presence?.connId !== connId) return

    const set: Record<string, unknown> = { [`presence.${seat}`]: null }
    if (room.state === 'playing') {
      const now = new Date()
      set['disconnected'] = {
        seat,
        at: now,
        graceEndsAt: new Date(now.getTime() + DISCONNECT_GRACE_SECONDS * 1000),
      }
    }

    const updated = await casUpdateRoom({
      code,
      expectedVersion: room.version,
      extraFilter: { [`presence.${seat}.connId`]: connId },
      set,
    })
    if (updated !== null) return
  }
}
