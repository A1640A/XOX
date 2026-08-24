import { TESTID } from '@xox/shared'

export interface TurnTimerProps {
  /** Epoch ms — sunucudan gelir (`state.turnDeadline`). P0'da her zaman `null` (AS-08). */
  readonly deadline: number | null
  /** `state.serverTime - Date.now()` — istemci saat sapmasını düzeltir. */
  readonly serverOffsetMs: number
}

/**
 * İSKELET (kart DONDURMA #1) — gerçek geri sayım (KK-073, `sure-sayaci`) W2-01
 * "Hamle süresi ve terk grace'i" görevinde doldurulur. P0'da `turnDeadline`
 * sunucu tarafından hiç yazılmıyor (tasarım §5.7 AS-08), bu yüzden şimdilik
 * hiçbir şey render etmemek DOĞRU davranıştır — sahte/eksik bir sayaç
 * göstermek yanlış bilgi olur.
 */
export function TurnTimer({ deadline }: TurnTimerProps): React.ReactElement | null {
  if (deadline === null) return null

  return <p data-testid={TESTID.sureSayaci} />
}
