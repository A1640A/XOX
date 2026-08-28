const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Elle base64 çözücü — `atob` KULLANILMAZ: Hermes (React Native'in JS motoru)
 * `atob`/`btoa`'yı global olarak SAĞLAMAZ, yalnız web hedefinde (tarayıcı) ve
 * Node'da (test) vardır. Aynı kod hem native hem web hem Vitest'te aynı
 * sonucu üretmeli — bu yüzden platforma özgü hiçbir global'e dayanmıyor.
 */
function base64UrlDecode(input: string): string {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
  let bits = ''
  for (const char of normalized) {
    const index = BASE64_ALPHABET.indexOf(char)
    if (index === -1) continue
    bits += index.toString(2).padStart(6, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  }
  return bytes.map((byte) => String.fromCharCode(byte)).join('')
}

function decodeUtf8(binaryString: string): string {
  const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * JWT gövdesini İMZA DOĞRULAMADAN okur — istemci tarafında yalnız `exp`
 * (süre bitimi) bilgisini erkenden görmek için kullanılır. Gerçek doğrulama
 * her zaman SUNUCUDADIR (`apps/web/lib/auth/tokens.ts` `verifyToken`); bu
 * dosya bir güvenlik sınırı DEĞİLDİR, yalnız "erişim jetonu yakında dolacak
 * mı, önceden mi yenileyeyim" sorusuna yanıt verir.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const payloadPart = parts[1]
  if (payloadPart === undefined || payloadPart.length === 0) return null
  try {
    const json = decodeUtf8(base64UrlDecode(payloadPart))
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** `exp` epoch SANİYE cinsindendir (JWT standardı) — milisaniyeye çevrilir. */
export function getJwtExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token)
  const exp = payload?.['exp']
  return typeof exp === 'number' ? exp * 1000 : null
}

/**
 * `marginMs` kadar önce "yakında dolacak" sayılır — tam sınırda bir isteğin
 * ortasında token'ın dolmasını önlemek için (WS bağlantısı kurulurken TTL
 * bitmesi gibi). Süresi çözülemeyen (bozuk/eksik `exp`) bir token GÜVENLİ
 * VARSAYILANLA "yenilenmeli" sayılır — fail-closed.
 */
export function isExpiringSoon(token: string, nowMs: number, marginMs: number): boolean {
  const expiryMs = getJwtExpiryMs(token)
  if (expiryMs === null) return true
  return expiryMs - nowMs <= marginMs
}

export interface JwtIdentity {
  readonly userId: string
  readonly name: string
}

/**
 * Erişim jetonundan GÖRÜNTÜLEME amaçlı kimlik çıkarır (`sub`/`name`
 * claim'leri, `apps/web/lib/auth/tokens.ts`teki `signToken('mobile-access',
 * userId, {name})` ile aynı biçim). İmza doğrulanmaz (bkz. dosya başlığı) —
 * yalnız arayüzde "Hoş geldin, {ad}" göstermek için kullanılır, yetki kararı
 * DEĞİLDİR (yetki her zaman sunucuda, token'ın kendisiyle).
 */
export function identityFromAccessToken(token: string): JwtIdentity | null {
  const payload = decodeJwtPayload(token)
  const sub = payload?.['sub']
  if (typeof sub !== 'string' || sub.length === 0) return null
  const name = typeof payload?.['name'] === 'string' ? payload['name'] : ''
  return { userId: sub, name }
}
