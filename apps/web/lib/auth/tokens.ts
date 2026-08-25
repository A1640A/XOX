import {
  MOBILE_ACCESS_TTL_SECONDS,
  MOBILE_REFRESH_TTL_SECONDS,
  WS_TICKET_TTL_SECONDS,
  roomCodeSchema,
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

/**
 * Aynı sır Auth.js oturum JWT'sini de imzalıyor (ADR-0009 ⚠️) — kısa/tahmin
 * edilebilir bir `AUTH_SECRET` tüm kimlik katmanını çökertir. 32 karakter
 * HS256 için asgari önerilen anahtar uzunluğudur (256 bit); güvenlik
 * denetimi `AUTH_SECRET='x'` ile imzalama+doğrulamanın KABUL EDİLDİĞİNİ
 * kanıtladı — kısa bir sır saniyeler içinde `hashcat -m 16500` ile kırılıp
 * istenen `userId` için sahte token üretilebilir.
 */
const MIN_SECRET_LENGTH = 32

function getSecretKey(): Uint8Array {
  const secret = process.env['AUTH_SECRET']
  if (secret === undefined || secret === '') {
    throw new Error('AUTH_SECRET tanımlı değil. .env.local veya Vercel ortamını kontrol et.')
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET en az ${String(MIN_SECRET_LENGTH)} karakter olmalı (HS256 için asgari 256 bit).`,
    )
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
 * WS bileti KAPSAM TAŞIMAK ZORUNDA (`room` claim'i, geçerli bir oda kodu).
 *
 * Koruma önceden "iddia VARSA karşılaştır" biçimindeydi: `room` claim'i
 * olmayan bir `xox-ws` bileti üretecek ikinci bir yol eklendiği an o bilet
 * HER odada geçerli olurdu ve hiçbir test kırılmazdı (fail-open). Burada
 * zorunlu kılınca eksiklik bir **doğrulama hatası** oluyor, yetki bypass'ı
 * değil — yani yanlış yöne düşüyor.
 *
 * Kapsam kontrolünün KENDİSİ hâlâ WS route'unda (`identity.room` ile URL'deki
 * oda kodu karşılaştırması); burada yalnız claim'in VARLIĞI ve BİÇİMİ
 * garantileniyor.
 */
function hasValidRoomScope(payload: Record<string, unknown>): boolean {
  return roomCodeSchema.safeParse(payload['room']).success
}

/**
 * `kind` ile eşleşen `aud` dışında hiçbir token kabul edilmez — jose'nin
 * `audience` seçeneği bunu doğrular, uyumsuzlukta fırlatılan hata burada
 * yutulup `null` olarak dönülür (çağıran taraf 401/UNAUTHENTICATED üretir).
 */
export async function verifyToken(token: string, kind: TokenKind): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      audience: AUDIENCE[kind],
      // Anahtar bugün ham `Uint8Array` olduğu için jose zaten yalnız HS*
      // kabul ediyor; `algorithms` açık allowlist'i anahtar tipi ileride
      // `KeyObject`/asimetrik bir şeye dönerse "alg confusion" kapısını
      // baştan kapatır (küçük bulgu, savunma derinliği).
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    if (kind === 'ws-ticket' && !hasValidRoomScope(payload)) return null
    // `payload` kayıtlı iddiaları (sub/aud/iat/exp) da içerir; sorun değil —
    // çağıran taraf yalnız bilerek eklediği ek alanları (örn. `name`) okur.
    return { userId: payload.sub, kind, claims: payload }
  } catch {
    return null
  }
}
