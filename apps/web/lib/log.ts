import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@xox/shared'
import { hashIdentifier } from './rate-limit/hash'

/**
 * W2-04 — GÜVENLİK OLAYI (2026-08-26 gece denetimi): `settleDeadlines`
 * iskeleti her çerçevede fırlatıyordu ve çağıranlar `console.error`'a oda
 * kodunu HAM basıyordu. Vercel Runtime Logs erişimi olan HERKES canlı bir
 * oyuna katılabilirdi — **oda kodu bu sistemde odanın TEK yetki anahtarıdır**
 * (kodu bilen + boş koltuk = odaya girer, ADR yok, tasarım §4).
 *
 * Bu dosya tek sarmalayıcıdır: `console.warn`/`console.error` apps/web
 * içinde YALNIZ BURADAN çağrılır (eslint.config.mjs `no-console` override'ı
 * bunu apps/web genelinde zorunlu kılar, yalnız bu dosya muaf). Hiçbir
 * çağıran ham `console.error(msg, hassasDeğer)` YAZAMAZ — yazsa bile
 * `maskText`/`maskContext` çıktıyı burada temizler.
 *
 * `userId`/`roomCode` context alanları SİLİNMEZ, HASH'LENİR: `hashIdentifier`
 * (zaten var olan `AUTH_SECRET` tabanlı HMAC, `lib/rate-limit/hash.ts`) aynı
 * ham değer için her zaman aynı kısa etiketi üretir — iki log satırının AYNI
 * odaya/kullanıcıya ait olduğunu görebilirsin (teşhis için yeterli) ama
 * etiketten ham oda koduna dönüş HMAC anahtarı (AUTH_SECRET) olmadan
 * hesaplanamaz — Runtime Logs erişimi tek başına yetmez.
 */

export interface LogContext {
  userId?: string
  roomCode?: string
  [key: string]: unknown
}

const REDACTED = '[GİZLİ]'
const MONGODB_URI_REDACTED = '[MONGODB_URI_GİZLİ]'
const JWT_REDACTED = '[JWT_GİZLİ]'
const EMAIL_REDACTED = '[E-POSTA_GİZLİ]'
const ROOM_CODE_REDACTED = '[ODA_KODU_GİZLİ]'

/** `mongodb://` ve `mongodb+srv://` — kimlik bilgisi genelde URI'nin İÇİNDE gelir. */
const MONGODB_URI_PATTERN = /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi

/** Ortam değişkeni dökümü kalıbı: `MONGODB_URI=...`, `AUTH_SECRET: "..."` vb. */
const SECRET_ENV_ASSIGNMENT_PATTERN =
  /\b(MONGODB_URI|AUTH_SECRET|MIGRATION_SECRET)\b\s*[:=]\s*["'`]?[^\s"'`,;]+/gi

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

/** `?ticket=<jose JWT>` — WS upgrade bileti, oda odaklı olabilir (ADR-0006). */
const TICKET_QUERY_PATTERN = /([?&]ticket=)[^\s&"'`]+/gi

/** Üç noktalı base64url dizisi — jose/JWT'nin genel biçimi (bilet + mobil token'lar). */
const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g

/** Bilinen oturum/csrf çerez adları — Auth.js v5 varsayılan adlandırması. */
const NAMED_COOKIE_PATTERN = /((?:__Secure-|__Host-)?(?:authjs|next-auth)\.[a-z-]+)=([^;\s"'`]+)/gi

/** `Cookie:`/`Set-Cookie:` başlığının TAMAMI — hangi çerez olursa olsun değeri maskelenir. */
const COOKIE_HEADER_PATTERN = /((?:cookie|set-cookie)\s*:\s*)([^\n\r]+)/gi

/**
 * Oda kodu alfabesinden türetilmiş 6 karakterlik jeton — `ROOM_CODE_ALPHABET`
 * TEK KAYNAK (elle yazılmaz, primitives.ts'in kendisiyle aynı alfabe).
 * BİLİNÇLİ TERCİH: bu geniş bir kalıptır (rastgele 6 karakterlik büyük
 * harf/rakam dizisi de eşleşebilir) — yanlış pozitif riski var ama burada
 * göze alınıyor: bir oda kodunun KAÇIRILMASI (yanlış negatif) canlı bir
 * oyunun ele geçirilmesi anlamına gelir, gereksiz bir kelimenin maskelenmesi
 * (yanlış pozitif) yalnızca okunabilirliği azaltır.
 */
const ROOM_CODE_PATTERN = new RegExp(
  `\\b[${ROOM_CODE_ALPHABET}]{${String(ROOM_CODE_LENGTH)}}\\b`,
  'g',
)

function maskCookieHeader(text: string): string {
  return text.replace(COOKIE_HEADER_PATTERN, (_match, prefix: string, rest: string) => {
    const maskedPairs = rest
      .split(';')
      .map((pair) => {
        const eq = pair.indexOf('=')
        if (eq === -1) return pair
        return `${pair.slice(0, eq)}=${REDACTED}`
      })
      .join(';')
    return `${prefix}${maskedPairs}`
  })
}

/** Sırayla uygulanan maskeleme geçitleri — her biri TEK bir sınıfı hedefler. */
function maskText(input: string): string {
  let masked = input
  masked = masked.replace(MONGODB_URI_PATTERN, MONGODB_URI_REDACTED)
  masked = masked.replace(
    SECRET_ENV_ASSIGNMENT_PATTERN,
    (_match, name: string) => `${name}=${REDACTED}`,
  )
  masked = masked.replace(TICKET_QUERY_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED}`)
  masked = masked.replace(JWT_PATTERN, JWT_REDACTED)
  masked = masked.replace(EMAIL_PATTERN, EMAIL_REDACTED)
  masked = maskCookieHeader(masked)
  masked = masked.replace(NAMED_COOKIE_PATTERN, (_match, name: string) => `${name}=${REDACTED}`)
  masked = masked.replace(ROOM_CODE_PATTERN, ROOM_CODE_REDACTED)
  return masked
}

/**
 * `userId`/`roomCode` HASH'LENİR (silinmez): `tag#<10 hex>` biçiminde,
 * `AUTH_SECRET` yoksa (ör. secret'sız bir betik ortamı) sessizce `[GİZLİ]`'ye
 * düşer — hiçbir koşulda ham değer sızmaz.
 */
function tagIdentifier(namespace: 'user' | 'room', raw: string): string {
  try {
    return `${namespace}#${hashIdentifier(`log-${namespace}`, raw).slice(0, 10)}`
  } catch {
    return `${namespace}#${REDACTED}`
  }
}

function isUserIdKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return normalized === 'userid' || normalized === 'user_id'
}

function isRoomCodeKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return normalized === 'roomcode' || normalized === 'room_code'
}

function maskValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (isUserIdKey(key)) return tagIdentifier('user', value)
    if (isRoomCodeKey(key)) return tagIdentifier('room', value)
    return maskText(value)
  }
  if (Array.isArray(value)) return value.map((entry) => maskValue(key, entry))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskValue(k, v)]),
    )
  }
  return value
}

function maskContext(context: LogContext): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, maskValue(key, value)]),
  )
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack !== undefined ? `\n${error.stack}` : ''}`
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function emit(level: 'warn' | 'error', message: string, context: LogContext, error: unknown): void {
  const args: unknown[] = [maskText(message)]
  const maskedContext = maskContext(context)
  if (Object.keys(maskedContext).length > 0) args.push(maskedContext)
  if (error !== undefined) args.push(maskText(serializeError(error)))
  console[level](...args)
}

/**
 * `console.error`'un TEK yetkili yolu. `context.userId`/`context.roomCode`
 * hash'lenerek etiketlenir (bkz. dosya başlığı); `message` ve `error` içindeki
 * e-posta/JWT/bilet/çerez/`MONGODB_URI` içerikleri maskelenir.
 */
export function logError(message: string, context: LogContext = {}, error?: unknown): void {
  emit('error', message, context, error)
}

/** `console.warn`'ın TEK yetkili yolu — bkz. `logError`. */
export function logWarn(message: string, context: LogContext = {}, error?: unknown): void {
  emit('warn', message, context, error)
}
