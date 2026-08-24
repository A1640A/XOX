import type { TransitionResult } from './types'

/**
 * `playing → finished` (pes) — KK-054. **Tipli iskelet**: DB-002 yalnız
 * imzasını dondurur, gövdeyi `W1-02` doldurur (tasarım §3.7/§12,
 * `packages/db/src/rooms/{resign,rematch,finish}.ts`).
 *
 * Şimdiden çağrılırsa açık bir hata fırlatır — hiçbir çağıran onu sessizce
 * "uygulandı" sanamaz (`SERVER_ERROR` gibi belirsiz bir `{ok:false}` DÖNMEZ).
 */
export async function resign(code: string, userId: string): Promise<TransitionResult> {
  await Promise.resolve()
  throw new Error(
    `resign(${code}, ${userId}) henüz uygulanmadı — W1-02 doldurur (tasarım §3.7, KK-054)`,
  )
}
