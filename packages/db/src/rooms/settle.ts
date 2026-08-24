import type { TransitionResult } from './types'

/**
 * Tembel süre aşımı/terk kontrolü — KK-074/075/077, çift yürütme (ADR-0004,
 * tasarım §5.7). Her gelen WS mesajının işlenmesinden ÖNCE çağrılır; ölü bir
 * instance'ın zamanlayıcısı kaybolsa bile sonuç bir sonraki temasta
 * kesinleşir. Uygulanacak bir şey yoksa `null` döner (istisna değil, "bu
 * çağrının konusu yok" anlamına gelir).
 *
 * **Tipli iskelet**: `W2-01` doldurur (`packages/db/src/rooms/settle.ts`,
 * tasarım §12). Saf karar fonksiyonu `dueSettlement` `apps/web/lib/game/
 * deadlines.ts`'te ayrıca yazılır — bu fonksiyon onu çağırıp CAS'ı uygular.
 */
export async function settleDeadlines(code: string, now: number): Promise<TransitionResult | null> {
  await Promise.resolve()
  throw new Error(
    `settleDeadlines(${code}, ${String(now)}) henüz uygulanmadı — W2-01 doldurur (tasarım §5.7)`,
  )
}
