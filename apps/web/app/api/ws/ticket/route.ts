import type { ErrorResponse, WsTicketResponse } from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { signToken } from '@/lib/auth/tokens'

export const dynamic = 'force-dynamic'

/**
 * KK-010 / ADR-0006 — bilet (1) Bearer ya da (2) Auth.js çerezi ile
 * kimliklenir; `resolveIdentity` üçüncü kaynağı (`?ticket=`) da kontrol eder
 * ama bu istekte hiçbir zaman gelmez, o yüzden zararsızdır. Tek çözücüden
 * geçmek, bu uç noktanın kimlik kararını WS route'uyla AYNI kod yolundan
 * almasını garanti eder.
 */
export async function POST(req: Request): Promise<Response> {
  const identity = await resolveIdentity(req)
  if (identity === null) {
    return Response.json(
      { code: 'UNAUTHENTICATED', message: 'Oturum bulunamadı.' } satisfies ErrorResponse,
      { status: 401 },
    )
  }

  const { token, expiresIn } = await signToken('ws-ticket', identity.userId, {
    name: identity.name,
  })

  return Response.json({ ticket: token, expiresIn } satisfies WsTicketResponse)
}
