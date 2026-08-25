import { WS_CLOSE, WS_ROTATE_MARGIN_MS } from '@xox/shared'

export interface RotationDeps {
  /**
   * `@vercel/functions`'ın `getDeadline()`'ı — çağıran enjekte eder.
   * `maxDuration` **koda gömülmez**: plan değişince (Hobby 300 s ↔ Pro 800 s)
   * bu dosya değişmez. Vercel çalışma zamanı dışında `undefined` döner.
   */
  getDeadline(): Date | undefined
  now(): number
  setTimer(callback: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  close(code: number, reason: string): void
  /** ADR-0007 📌: test ortamı bunu ezerek saniyeler içinde rotasyon yaptırır. */
  marginMs?: number
}

export interface ScheduledRotation {
  cancel(): void
  /** Rotasyona kaç ms kaldığı; zamanlayıcı kurulmadıysa `null`. */
  inMs(): number | null
}

/**
 * Planlı bağlantı rotasyonu (ADR-0007 / Z2).
 *
 * "WebSocket connections close when a Vercel Function reaches its maximum
 * duration." Yani bağlantı hiç kopmasa bile fonksiyon süresi dolunca kesilir.
 * Kesintiyi Vercel'e bırakırsak istemci 1006 görür, bunu ağ hatası sanar ve
 * üstel geri çekilmeye girer — kullanıcı her rotasyonda donma yaşar. Bunun
 * yerine süre dolmadan `WS_ROTATE_MARGIN_MS` önce **biz** `4499` ile kapatırız;
 * `4499` gören istemci backoff'u sıfırlayıp gecikmesiz yeniden bağlanır.
 */
export function scheduleRotation(deps: RotationDeps): ScheduledRotation {
  const deadline = deps.getDeadline()
  if (deadline === undefined) {
    // Yerel `next dev` ya da Vercel dışı çalışma: rotasyon yok, bağlantı
    // ölene kadar yaşar. Uydurma bir süre koymak yerel geliştirmeyi bozardı.
    return { cancel: () => undefined, inMs: () => null }
  }

  const margin = deps.marginMs ?? WS_ROTATE_MARGIN_MS
  const delay = Math.max(deadline.getTime() - deps.now() - margin, 0)
  let handle: unknown = deps.setTimer(() => {
    handle = null
    deps.close(WS_CLOSE.ROTATE, 'rotate')
  }, delay)

  return {
    cancel(): void {
      if (handle === null) return
      deps.clearTimer(handle)
      handle = null
    },
    inMs: () => (handle === null ? null : delay),
  }
}
