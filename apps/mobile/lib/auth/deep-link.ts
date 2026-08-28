import type { ErrorCode } from '@xox/shared'

/**
 * `xox://auth?token=&refresh=&state=` (başarı) ya da
 * `xox://auth?error=<kod>&state=` (hata) — `apps/web/app/api/auth/mobile/
 * callback/route.ts`nin ürettiği deep link'in İSTEMCİ tarafı ayrıştırıcısı.
 * PLATFORMA ÖZGÜ HİÇBİR ŞEY (expo-linking/expo-web-browser) İMPORT ETMEZ —
 * saf string ayrıştırma, bu yüzden next-auth'suz test edilebilen `apps/web/
 * lib/auth/*` dosyalarıyla AYNI sınıfta: next-auth/react-native import eden
 * dosyalar Vitest'te çalışamaz, iş mantığı ayrı tutulur (conventions.md).
 */
export type ParsedAuthDeepLink =
  | { readonly ok: true; readonly token: string; readonly refresh: string }
  | { readonly ok: false; readonly code: ErrorCode | 'STATE_MISMATCH' | 'INVALID_MESSAGE' }

export function parseAuthCallbackUrl(url: string, expectedState: string): ParsedAuthDeepLink {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, code: 'INVALID_MESSAGE' }
  }

  const state = parsed.searchParams.get('state') ?? ''
  if (state !== expectedState) return { ok: false, code: 'STATE_MISMATCH' }

  const error = parsed.searchParams.get('error')
  if (error !== null) return { ok: false, code: error as ErrorCode }

  const token = parsed.searchParams.get('token')
  const refresh = parsed.searchParams.get('refresh')
  if (token === null || token.length === 0 || refresh === null || refresh.length === 0) {
    return { ok: false, code: 'INVALID_MESSAGE' }
  }

  return { ok: true, token, refresh }
}

/**
 * OAuth-benzeri `state` — CSRF/eşleştirme değeri. `rng` enjekte edilir
 * (varsayılan `Math.random`, gotchas.md desenine uyarak testte deterministik
 * olabilsin diye).
 */
export function generateAuthState(rng: () => number = Math.random): string {
  return Array.from({ length: 4 }, () => Math.floor(rng() * 0xffffffff).toString(36)).join('')
}
