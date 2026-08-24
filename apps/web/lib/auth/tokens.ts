import {
  MOBILE_ACCESS_TTL_SECONDS,
  MOBILE_REFRESH_TTL_SECONDS,
  WS_TICKET_TTL_SECONDS,
} from '@xox/shared'
import { jwtVerify, SignJWT } from 'jose'

/**
 * Üç kullanım tipi, üç ayrı `aud` (izleyici) — birinin diğeri yerine kabul
 * edilmesi kriptografik olarak imkânsız (kart AUTH-001 kriter 7). Spec §6.2
 * mobil access/refresh için TEK `aud` ('xox-mobile') + `typ` claim'i öneriyor;
 * burada bilinçli olarak ayrıştırıldı — `typ` unutulursa bile audience
 * kontrolü tek başına çapraz kabulü engeller.
 */
export type TokenKind = 'mobile-access' | 'mobile-refresh' | 'ws-ticket'

const AUDIENCE: Record<TokenKind, string> = {
  'mobile-access': 'xox-mobile-access',
  'mobile-refresh': 'xox-mobile-refresh',
  'ws-ticket': 'xox-ws',
}

const TTL_SECONDS: Record<TokenKind, number> = {
  'mobile-access': MOBILE_ACCESS_TTL_SECONDS,
  'mobile-refresh': MOBILE_REFRESH_TTL_SECONDS,
  'ws-ticket': WS_TICKET_TTL_SECONDS,
}

export interface SignedToken {
  token: string
  /** Saniye — imzalandığı andan itibaren kalan ömür. */
  expiresIn: number
}

export interface VerifiedToken {
  userId: string
  kind: TokenKind
  /** İmzalama sırasında gömülen ek iddialar (örn. görünen ad). */
  claims: Record<string, unknown>
}

function getSecretKey(): Uint8Array {
  const secret = process.env['AUTH_SECRET']
  if (secret === undefined || secret === '') {
    throw new Error('AUTH_SECRET tanımlı değil. .env.local veya Vercel ortamını kontrol et.')
  }
  return new TextEncoder().encode(secret)
}

/** `AUTH_SECRET`'ten türetilen anahtarla HS256 imzalar (ADR-0006, ADR-0005). */
export async function signToken(
  kind: TokenKind,
  userId: string,
  extraClaims: Record<string, unknown> = {},
): Promise<SignedToken> {
  const ttl = TTL_SECONDS[kind]
  const expiresAt = Math.floor(Date.now() / 1000) + ttl
  const token = await new SignJWT(extraClaims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience(AUDIENCE[kind])
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey())
  return { token, expiresIn: ttl }
}

/**
 * `kind` ile eşleşen `aud` dışında hiçbir token kabul edilmez — jose'nin
 * `audience` seçeneği bunu doğrular, uyumsuzlukta fırlatılan hata burada
 * yutulup `null` olarak dönülür (çağıran taraf 401/UNAUTHENTICATED üretir).
 */
export async function verifyToken(token: string, kind: TokenKind): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { audience: AUDIENCE[kind] })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    // `payload` kayıtlı iddiaları (sub/aud/iat/exp) da içerir; sorun değil —
    // çağıran taraf yalnız bilerek eklediği ek alanları (örn. `name`) okur.
    return { userId: payload.sub, kind, claims: payload }
  } catch {
    return null
  }
}
