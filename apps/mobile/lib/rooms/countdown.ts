/**
 * `sure-sayaci` (KK-073/074) için saf hesap. `turnDeadline` sunucu epoch
 * ms'idir; istemci saat sapması `serverOffsetMs` (`state.serverTime - now`,
 * `@xox/shared/room-client.ts`) ile düzeltilir — ham `Date.now()` karşısında
 * saat kayıksa geri sayım anında sıfırlanır/negatife düşer.
 */
export function remainingSeconds(
  turnDeadline: number | null,
  serverOffsetMs: number,
  nowMs: number,
): number | null {
  if (turnDeadline === null) return null
  const serverNow = nowMs + serverOffsetMs
  return Math.max(0, Math.ceil((turnDeadline - serverNow) / 1000))
}
