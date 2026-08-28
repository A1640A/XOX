import type { Player } from '@xox/shared'
import { forfeitStatus } from '@xox/shared'
import { Room } from '../models/room'
import { casUpdateRoom } from './cas'
import { dueSettlement } from './deadlines'
import { finishGame, toRoomResult } from './finish'
import type { RoomEvent, TransitionResult } from './types'

/**
 * Tembel/zamanlayıcılı süre aşımı ve terk kesinleştirmesi — KK-072/074/075/076,
 * **çift yürütme** (ADR-0004, tasarım §5.7).
 *
 * İki yürütme yolu da BURAYA gelir:
 *
 * 1. **Zamanlayıcı** — bağlı instance `nextDeadlineAt`e bir `setTimeout` kurar
 *    (`apps/web/lib/realtime/timers.ts`), dolunca çağırır. Tek başına yetmez:
 *    Fluid instance'ı ölürse zamanlayıcı da ölür.
 * 2. **Tembel** — `apps/web/lib/realtime/session.ts` bunu bağlantı kurulurken
 *    ve GEÇERLİ HER mesajdan (bir `ping` dahil) önce çağırır. Tek başına
 *    yetmez: kimse temas etmezse oyun bitmez.
 *
 * İkisi AYNI ANDA koşabilir — hatta iki ayrı instance'ta. Sonucun idempotan
 * olması `casUpdateRoom`un `{ code, version, state:'playing' }` koşuluna
 * dayanır: **tam olarak biri** yazar (`version+1`), diğeri `null` alır ve
 * sonucu change stream'den öğrenir. `finishGame` de kendi CAS'ıyla
 * (`{ _id, finishedAt: null }`) korunuyor, yani `users.stats` yarışın hangi
 * tarafı kazanırsa kazansın BİR KEZ artar.
 *
 * Uygulanacak bir şey yoksa `null` döner (istisna değil, "bu çağrının konusu
 * yok" anlamına gelir) — ve **FIRLATMAZ**: her `ping` başına bir yakalanmış
 * istisna, bir `console.error` ve **log'a akan bir oda kodu** demekti; oda kodu
 * bu sistemde odanın tek yetki anahtarıdır (güvenlik denetimi bulgusu).
 *
 * `now` DIŞARIDAN gelir, burada `Date.now()` OKUNMAZ: testler sahte saatle
 * deterministik koşsun (`rng` konvansiyonunun aynısı).
 */
export async function settleDeadlines(code: string, now: number): Promise<TransitionResult | null> {
  const room = await Room.findOne({ code }).lean()
  if (room === null) return null

  const due = dueSettlement(room, now)
  if (due === null) return null

  const winner: Player = due.loser === 'X' ? 'O' : 'X'
  const status = forfeitStatus(winner, due.reason)

  const updated = await casUpdateRoom({
    code,
    expectedVersion: room.version,
    extraFilter: { state: 'playing' },
    set: {
      state: 'finished',
      // Sonuç `state:'finished'` ile AYNI CAS'ta damgalanır (W1-02): iki yazma
      // arasına bir change stream olayı düşüp istemciye "kazananı olmayan
      // bitmiş oyun" göstermesin.
      result: toRoomResult(status),
      turnDeadline: null,
      disconnected: null,
    },
  })
  // Yarışı kaybettik: aynı sonucu başka bir yol (öbür yürütme, öbür instance,
  // ya da bir `resign`) zaten yazdı. HİÇBİR yazma yapılmadı, `version` artmadı.
  if (updated === null) return null

  await finishGame(updated, status)

  const events: RoomEvent[] = [
    { kind: 'settled', reason: due.reason },
    { kind: 'finished', status },
  ]
  return { ok: true, room: updated, events }
}
