import type { SettlementInput } from '@/lib/game/deadlines'

export interface SettlementTimerDeps {
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  now(): number
  /** Süre dolunca çağrılır — çağıran `settleDeadlines`i koşturur. */
  onDue(): void
}

export interface SettlementTimer {
  /** Odanın güncel hâline göre zamanlayıcıyı yeniden kurar (idempotent). */
  schedule(room: SettlementInput): void
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
 * `settleDeadlines` çağrılır. İkinci yol (tembel kontrol) `session.ts`te zaten
 * canlı: `settleDeadlines` gelen her geçerli mesajdan önce çağrılıyor.
 *
 * **Burada KARAR ve YAZMA yok.** `dueSettlement`in kuralları da, CAS yazması da
 * W2-01'in işi (`packages/db/src/rooms/settle.ts`). Bu modülün tek sorumluluğu
 * ZAMANLAMA: "şu ana kadar kimse temas etmezse yine de bir kez bak."
 *
 * Neden gövde bugün boş DEĞİL: bir önceki sürüm tam no-op'tu ve `onDue`
 * kablosu %0 kapsamdaydı — yani "kablolama kilitlendi" iddiası yalnız çağrı
 * SAYISI için geçerliydi. W2-01 kabloyu yanlış bağlarsa ADR-0004'ün çift
 * yürütmesi sessizce TEK yürütmeye düşerdi ve bunu hiçbir kapı görmezdi.
 *
 * P0'da pratik etkisi sınırlı: `turnDeadline` daima `null` yazılıyor (AS-08),
 * yani yalnız `detachConnection`ın damgaladığı `graceEndsAt` bir zamanlayıcı
 * kurdurur ve dolduğunda `settleDeadlines` bugün `null` döner.
 */
export function createSettlementTimer(deps: SettlementTimerDeps): SettlementTimer {
  let handle: unknown = null

  function cancel(): void {
    if (handle === null) return
    deps.clearTimer(handle)
    handle = null
  }

  return {
    schedule(room: SettlementInput): void {
      cancel()
      if (room.state !== 'playing') return

      const candidates: number[] = []
      if (room.turnDeadline !== null) candidates.push(room.turnDeadline.getTime())
      if (room.disconnected !== null) candidates.push(room.disconnected.graceEndsAt.getTime())
      if (candidates.length === 0) return

      const dueAt = Math.min(...candidates)
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
