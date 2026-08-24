import { auth } from '@/auth'
import { verifyToken } from './tokens'

/**
 * Üç kaynağın da çözüldüğü TEK kimlik biçimi (KK-010, ADR-0006, tasarım §6.3).
 * `name` yalnız görüntüleme amaçlıdır; yetki kararları hep `userId` üzerinden alınır.
 * `room` yalnız `?ticket=` kaynağında dolar (bilet belirli bir odaya bağlıysa) —
 * WS-001'in upgrade handler'ı bunu URL'deki oda koduyla KARŞILAŞTIRMAK
 * ZORUNDADIR; aksi halde A odası için kesilmiş bir bilet B odasında
 * "aynı kullanıcı" olarak kabul edilir (yatay yetki sızıntısı).
 */
export interface Identity {
  userId: string
  name: string
  room?: string
}

export interface ResolveIdentityOptions {
  /**
   * `?ticket=` kaynağını etkinleştirir. VARSAYILAN `false` — bilet yalnız
   * WS upgrade route'unun kendisi tarafından, AÇIKÇA `true` geçilerek
   * kullanılabilir (spec §6.3 "yalnız WS upgrade'inde", ADR-0006 "başka
   * hiçbir uçta kabul edilmeyen bir bilet"). `allowTicket` unutulursa
   * `?ticket=` HİÇBİR yerde kabul edilmez — güvenli varsayılan budur.
   *
   * Önceki sürüm bunu HER çağıranda (örn. `POST /api/ws/ticket`'ın kendisi)
   * kabul ediyordu: saldırgan bir bileti `?ticket=`e ekleyip
   * `/api/ws/ticket`e tekrar POST ederek yenisini alabiliyor, 25 sn'de bir
   * tekrarla 30 saniyelik sızıntıyı SÜRESİZ hesap devralmaya çeviriyordu.
   */
  allowTicket?: boolean
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

function readClaimRoom(claims: Record<string, unknown>): string | undefined {
  return typeof claims['room'] === 'string' ? claims['room'] : undefined
}

/**
 * Kimliği SABİT sırayla en fazla üç kaynaktan çözer (ADR-0006):
 * 1. `Authorization: Bearer` — native mobil (aud `xox-mobile-access`)
 * 2. Auth.js oturum çerezi — web tarayıcı
 * 3. `?ticket=` — YALNIZ `options.allowTicket === true` iken, react-native-web
 *    (özel başlık gönderemeyen istemciler), aud `xox-ws`
 *
 * Kabul edilen her yol AYNI `{ userId, name }` biçimini döner; sıra sabittir
 * ve hiçbir çağıran bu sırayı kendi başına yeniden uygulamaz (tek çözücü
 * ilkesi).
 */
export async function resolveIdentity(
  req: Request,
  options: ResolveIdentityOptions = {},
): Promise<Identity | null> {
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

  if (options.allowTicket === true) {
    const ticket = extractTicket(req)
    if (ticket !== null) {
      const verified = await verifyToken(ticket, 'ws-ticket')
      if (verified === null) return null
      const room = readClaimRoom(verified.claims)
      return {
        userId: verified.userId,
        name: readClaimName(verified.claims),
        ...(room !== undefined ? { room } : {}),
      }
    }
  }

  return null
}
