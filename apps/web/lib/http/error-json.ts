import type { ErrorCode, ErrorResponse } from '@xox/shared'

/**
 * DRY-002 — `apps/web/app/api/**` altındaki route'ların tamamı bu gövdeyi
 * ({code,message} + HTTP durumu) elle kopyalıyordu (altı yerde aynı 3
 * satır). Tek kaynak: davranış BİREBİR korunur — yalnız `Response.json`
 * sarmalayıcısı taşındı, hiçbir route'un ürettiği gövde/durum/kod değişmedi.
 */
export function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}
