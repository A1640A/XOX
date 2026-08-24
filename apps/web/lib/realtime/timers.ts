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

/**
 * **NO-OP İSKELET (W2-01 doldurur)** — ADR-0004'ün "çift yürütme"sinin
 * BİRİNCİ yolu: bağlı bir instance `min(turnDeadline, graceEndsAt)` için
 * `setTimeout` kurar, dolunca `settleDeadlines` çağırır (§5.7).
 *
 * P0'da gövde bilerek boştur: `turnDeadline` daima `null` yazılıyor (AS-08) ve
 * terk koruması P1'e ait — kurulacak bir zamanlayıcı YOK. Buna rağmen dosya
 * ŞİMDİ var ve bağlantı yaşam döngüsünden ŞİMDİ çağrılıyor. Sebep, bu repoda
 * pahalıya öğrenilmiş bir kusur sınıfı: "mekanizma var ama kimse çağırmıyor".
 * Kablolama sonradan eklenirse unutulur; W2-01'in tek işi bu gövdeyi
 * doldurmak olmalı, çağrı yerlerini aramak değil.
 *
 * İkinci yürütme yolu (tembel kontrol) zaten canlı: `settleDeadlines` gelen
 * HER mesajdan önce çağrılıyor (`session.ts`), yani P0'da doğruluk bu
 * zamanlayıcıya bağlı değil.
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
      // W2-01: dueAt = min(turnDeadline, disconnected.graceEndsAt); dolduğunda
      // `deps.onDue()`. P0'da her iki alan da yazılmıyor, bu yüzden kurulacak
      // bir zamanlayıcı yok — `room` bilerek okunmuyor.
      void room
      void deps.now
      void deps.onDue
    },
    cancel,
    isArmed: () => handle !== null,
  }
}
