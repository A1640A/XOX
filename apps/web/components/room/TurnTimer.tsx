'use client'

import { TESTID } from '@xox/shared'
import { useEffect, useState } from 'react'
import { tr } from '@/messages/tr'

/** Sayaç bu eşiğin altına inince aciliyet metni eklenir. Çıplak sayı bilerek. */
const HURRY_THRESHOLD_SECONDS = 10

export interface TurnTimerProps {
  /** Epoch ms — sunucudan gelir (`state.turnDeadline`). Süre yoksa `null`. */
  readonly deadline: number | null
  /** `state.serverTime - Date.now()` — istemci saat sapmasını düzeltir. */
  readonly serverOffsetMs: number
  /**
   * Duvar saati okuma noktası — testte ENJEKTE edilir (`rng` konvansiyonunun
   * aynısı). Üretimde varsayılan `Date.now`; testte sahte bir saat verilerek
   * "istemci saati 3 dakika ileri" senaryosu deterministik kurulur.
   */
  readonly clock?: () => number
}

/**
 * Kalan süre sayacı — KK-073 (`sure-sayaci`).
 *
 * **İSTEMCİ SAATİ TEK BAŞINA KULLANILMAZ.** Kalan süre
 * `deadline - (Date.now() + serverOffsetMs)` ile hesaplanır; `serverOffsetMs`
 * istemcinin `state` mesajından türettiği `serverTime - Date.now()` farkıdır
 * (spec §3.10). Saati 3 dakika ileri alınmış bir cihazda ham `Date.now()`
 * kullanılsaydı sayaç anında sıfırlanır ve oyuncu hiç oynamadan süresi dolmuş
 * görünürdü — oysa sunucu hâlâ 60 saniye veriyor olurdu.
 *
 * Saniyede bir kendini tazeler. `deadline` null iken HİÇBİR ŞEY render edilmez
 * (ve zamanlayıcı da kurulmaz): saati olmayan bir oyunda sahte bir sayaç
 * göstermek yanlış bilgidir.
 */
export function TurnTimer({
  deadline,
  serverOffsetMs,
  clock = Date.now,
}: TurnTimerProps): React.ReactElement | null {
  // Yalnız yeniden çizimi tetiklemek için: değerin kendisi kullanılmaz, kalan
  // süre her render'da taze `clock()` ile hesaplanır (aksi hâlde state'teki
  // damga ile gösterilen saniye bir tik sapabilirdi).
  const [, setTick] = useState(0)

  useEffect(() => {
    if (deadline === null) return
    const handle = setInterval(() => {
      setTick((value) => value + 1)
    }, 1000)
    return () => {
      clearInterval(handle)
    }
  }, [deadline])

  if (deadline === null) return null

  const remainingMs = deadline - (clock() + serverOffsetMs)
  // Negatife düşmez: sunucu zaten sonlandıracak, ekranda "-3 sn" görünmesin.
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))

  return (
    <p data-testid={TESTID.sureSayaci} data-kalan={seconds} role="timer" aria-live="off">
      {tr.game.timeLeft.replace('{saniye}', String(seconds))}
      {seconds <= HURRY_THRESHOLD_SECONDS && <span> {tr.game.hurry}</span>}
    </p>
  )
}
