import type { TransitionResult } from './types'

/**
 * `finished` içinde rövanş teklifi — KK-055…057. **Tipli iskelet**: `W1-02`
 * doldurur (tasarım §3.7/§12).
 */
export async function offerRematch(code: string, userId: string): Promise<TransitionResult> {
  await Promise.resolve()
  throw new Error(
    `offerRematch(${code}, ${userId}) henüz uygulanmadı — W1-02 doldurur (tasarım §3.7, KK-055)`,
  )
}

/**
 * `finished → playing` — koltuklar TAKAS edilir, tahta/hamleler sıfırlanır,
 * yeni `gameId` açılır, `state←playing`, `version+1` (SIFIRLANMAZ — KK-058).
 * **Tipli iskelet**: `W1-02` doldurur.
 */
export async function acceptRematch(code: string, userId: string): Promise<TransitionResult> {
  await Promise.resolve()
  throw new Error(
    `acceptRematch(${code}, ${userId}) henüz uygulanmadı — W1-02 doldurur (tasarım §3.7, KK-056/058)`,
  )
}
