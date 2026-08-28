'use client'

import { opponentLeftVisible } from '@xox/shared'
import { useEffect, useRef, useState } from 'react'
import { tr } from '@/messages/tr'

export interface OpponentLeftBannerProps {
  /** `state.graceEndsAt` — epoch ms, rakip bağlıyken `null`. */
  readonly graceEndsAt: number | null
  /** `state.serverOffsetMs` — istemci saat sapmasını düzeltmek için. */
  readonly serverOffsetMs: number
  /**
   * `state.status.kind !== 'playing'` — UI-005/E2E-DIAG: `graceEndsAt`in
   * `null`'a düşmesi TEK BAŞINA "rakip geri döndü" anlamına gelmez.
   * `packages/db/src/rooms/settle.ts` grace süresi DOLUP terk galibiyetiyle
   * sonuçlandığında da `disconnected`i (dolayısıyla `graceEndsAt`i)
   * KOŞULSUZ temizler — aynı `state` mesajında oyun biter (`status.kind`
   * `'playing'` olmaktan çıkar). Bu bayrak olmadan kazanan oyuncu aynı anda
   * hem doğru "rakip terk etti, kazandın" sonucunu hem de yanlış "Rakip
   * geri döndü." banner'ını görür. Ayrım burada, `graceEndsAt`in null'a
   * düştüğü RENDER'daki `status.kind` üzerinden yapılır — gerçek yeniden
   * bağlanmada oyun `'playing'` kalmaya devam ettiği için bu bayrak `false`
   * olur ve KK-071 metni değişmeden çıkar.
   */
  readonly gameEnded?: boolean
  /**
   * Duvar saati okuma noktası — `TurnTimer` ile aynı enjeksiyon konvansiyonu
   * (`rng` deseninin zaman karşılığı). Üretimde varsayılan `Date.now`; testte
   * sahte bir saat verilerek saat sapması senaryoları deterministik kurulur.
   */
  readonly clock?: () => number
}

/** "Rakip geri döndü." mesajının ekranda kaldığı süre — KK-071. */
const RETURNED_VISIBLE_MS = 5_000

/**
 * Rakip kopma/dönüş bildirimi — KK-070/071 (`tr.connection.
 * opponentDisconnected` / `opponentReturned`).
 *
 * Görünürlük kararı `@xox/shared`'ın `opponentLeftVisible(state, now)` saf
 * yardımcısından gelir — eşik (2 sn gösterim gecikmesi, ADR-0007) burada
 * YENİDEN türetilmez, yalnız TÜKETİLİR.
 *
 * `graceEndsAt` bir SUNUCU damgasıdır; `clock()` ile okunan ham istemci
 * saati tek başına kullanılmaz, `serverOffsetMs` uygulanır (bkz. `TurnTimer`
 * — aynı desen, aynı gerekçe: cihaz saati kaymışsa banner ya çok erken ya
 * hiç görünmez).
 *
 * "Rakip geri döndü." geçici bir mesajdır: `graceEndsAt` `null`'a düşünce
 * (rakip döndü ya da oyun bitti) `RETURNED_VISIBLE_MS` boyunca gösterilip
 * kendiliğinden kaybolur — kalıcı bir banner rakip zaten normal oynarken
 * ekranda asılı kalırdı.
 */
export function OpponentLeftBanner({
  graceEndsAt,
  serverOffsetMs,
  gameEnded = false,
  clock = Date.now,
}: OpponentLeftBannerProps): React.ReactElement | null {
  // Yalnız geri sayımı tazelemek için: değerin kendisi kullanılmaz, kalan
  // süre her render'da taze `clock()` ile hesaplanır (bkz. `TurnTimer`).
  const [, setTick] = useState(0)
  const previousGraceEndsAtRef = useRef(graceEndsAt)
  // "Gizlenmiş olan damga" tutulur, "görünen" değil (`EmojiTray` ile aynı
  // desen) — ters kurgu efektin gövdesinde senkron `setState` gerektirirdi.
  const [returnedAt, setReturnedAt] = useState<number | null>(null)
  const [hiddenReturnedAt, setHiddenReturnedAt] = useState<number | null>(null)

  useEffect(() => {
    // `gameEnded`, `graceEndsAt`in null'a düştüğü AYNI render'daki değeridir
    // (server tek bir `state` mesajında ikisini birden değiştirir — bkz.
    // `settle.ts`). Oyun bittiyse bu geçiş terk galibiyetidir, gerçek dönüş
    // değil: "Rakip geri döndü." üretilmez (UI-005/E2E-DIAG).
    if (previousGraceEndsAtRef.current !== null && graceEndsAt === null && !gameEnded) {
      setReturnedAt(clock())
    }
    previousGraceEndsAtRef.current = graceEndsAt
  }, [graceEndsAt, gameEnded, clock])

  useEffect(() => {
    if (graceEndsAt === null) return undefined
    const handle = setInterval(() => {
      setTick((value) => value + 1)
    }, 1_000)
    return () => {
      clearInterval(handle)
    }
  }, [graceEndsAt])

  useEffect(() => {
    if (returnedAt === null) return undefined
    const handle = setTimeout(() => {
      setHiddenReturnedAt(returnedAt)
    }, RETURNED_VISIBLE_MS)
    return () => {
      clearTimeout(handle)
    }
  }, [returnedAt])

  const now = clock()
  const disconnected = opponentLeftVisible({ graceEndsAt, serverOffsetMs }, now)
  const returnedVisible = returnedAt !== null && hiddenReturnedAt !== returnedAt

  if (disconnected && graceEndsAt !== null) {
    const remainingMs = graceEndsAt - (now + serverOffsetMs)
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1_000))
    return (
      <p
        role="status"
        aria-live="polite"
        className="border-danger text-danger rounded-[6px] border px-3 py-2 text-sm font-medium"
      >
        {tr.connection.opponentDisconnected.replace('{saniye}', String(remainingSeconds))}
      </p>
    )
  }

  if (returnedVisible) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="border-win text-win rounded-[6px] border px-3 py-2 text-sm font-medium"
      >
        {tr.connection.opponentReturned}
      </p>
    )
  }

  return null
}
