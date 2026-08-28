import { nextDeadlineAt } from '@xox/db'
import type { DeadlineFields } from '@xox/db'

export interface SettlementTimerDeps {
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  now(): number
  /** Süre dolunca çağrılır — çağıran `settleDeadlines`i koşturur. */
  onDue(): void
}

export interface SettlementTimer {
  /** Odanın güncel hâline göre zamanlayıcıyı yeniden kurar (idempotent). */
  schedule(room: DeadlineFields): void
  cancel(): void
  /** Kurulu bir zamanlayıcı var mı — kablolamayı testte gözlemlemek için. */
  isArmed(): boolean
}

/** Saat kayması ya da geçmişte kalmış bir deadline negatif gecikme üretmesin. */
function delayUntil(target: number, now: number): number {
  return Math.max(target - now, 0)
}

/**
 * ADR-0004'ün "çift yürütme"sinin **BİRİNCİ** yolu (§5.7): bağlı bir instance
 * `min(turnDeadline, graceEndsAt)` için bir zamanlayıcı kurar, dolunca
 * `settleDeadlines` çağrılır. İkinci yol (tembel kontrol) `session.ts`te canlı:
 * `settleDeadlines` gelen her geçerli mesajdan (bir `ping` dahil) önce çağrılır.
 *
 * Neden İKİSİ birden: bu yol tek başına yetmez — Vercel Fluid instance'ı ölürse
 * zamanlayıcı da onunla ölür ve oyun sonsuza kadar askıda kalır. Tembel yol da
 * tek başına yetmez — kimse temas etmezse oyun hiç bitmez ve karşı taraf
 * bekler. İkisi AYNI ANDA koşabilir; idempotanslık `settleDeadlines`in
 * `casUpdateRoom({ code, version, state:'playing' })` koşulundan gelir:
 * **tam olarak biri** yazar.
 *
 * **Burada KARAR ve YAZMA yok.** "Ne zaman bakmalıyım" sorusunun cevabı bile
 * burada hesaplanmaz: `nextDeadlineAt` `@xox/db`den gelir, `dueSettlement` ile
 * aynı dosyadan. Kural iki yerde yaşasaydı (ör. odaya üçüncü bir son tarih
 * eklenince) zamanlayıcı hiç kurulmaz ama tembel yol yine sonlandırırdı —
 * çift yürütme sessizce TEK yürütmeye düşer ve bunu hiçbir kapı görmez.
 */
export function createSettlementTimer(deps: SettlementTimerDeps): SettlementTimer {
  let handle: unknown = null

  function cancel(): void {
    if (handle === null) return
    deps.clearTimer(handle)
    handle = null
  }

  return {
    schedule(room: DeadlineFields): void {
      cancel()
      const dueAt = nextDeadlineAt(room)
      if (dueAt === null) return

      handle = deps.setTimer(
        () => {
          handle = null
          deps.onDue()
        },
        delayUntil(dueAt, deps.now()),
      )
    },
    cancel,
    isArmed: () => handle !== null,
  }
}
