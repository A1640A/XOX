import { auth } from '@/auth'
import { verifyToken } from './tokens'

/**
 * Üç kaynağın da çözüldüğü TEK kimlik biçimi (KK-010, ADR-0006, tasarım §6.3).
 * `name` yalnız görüntüleme amaçlıdır; yetki kararları hep `userId` üzerinden alınır.
 */
export interface Identity {
  userId: string
  name: string
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (header === null) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? null
}

function extractTicket(req: Request): string | null {
  const ticket = new URL(req.url).searchParams.get('ticket')
  return ticket !== null && ticket.length > 0 ? ticket : null
}

function readClaimName(claims: Record<string, unknown>): string {
  return typeof claims['name'] === 'string' ? claims['name'] : ''
}

/**
 * Kimliği SABİT sırayla üç kaynaktan çözer (ADR-0006):
 * 1. `Authorization: Bearer` — native mobil (aud `xox-mobile-access`)
 * 2. Auth.js oturum çerezi — web tarayıcı
 * 3. `?ticket=` — react-native-web (özel başlık gönderemeyen istemciler), aud `xox-ws`
 *
 * Üç yol da AYNI `{ userId, name }` biçimini döner; sıra sabittir ve hiçbir
 * çağıran bu sırayı kendi başına yeniden uygulamaz (tek çözücü ilkesi).
 */
export async function resolveIdentity(req: Request): Promise<Identity | null> {
  const bearer = extractBearerToken(req)
  if (bearer !== null) {
    const verified = await verifyToken(bearer, 'mobile-access')
    if (verified === null) return null
    return { userId: verified.userId, name: readClaimName(verified.claims) }
  }

  const session = await auth()
  const sessionUserId = session?.user.id
  if (sessionUserId !== undefined && sessionUserId.length > 0) {
    return { userId: sessionUserId, name: session?.user.name ?? '' }
  }

  const ticket = extractTicket(req)
  if (ticket !== null) {
    const verified = await verifyToken(ticket, 'ws-ticket')
    if (verified === null) return null
    return { userId: verified.userId, name: readClaimName(verified.claims) }
  }

  return null
}
