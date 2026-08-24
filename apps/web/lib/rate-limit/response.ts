import type { ErrorResponse } from '@xox/shared'

export interface RateLimitedResponseParams {
  message: string
  retryAfterSeconds: number
  limit?: number
  remaining?: number
}

/**
 * `@xox/shared`'ın `errorResponseSchema`sına uyan tek gövde ({code,message})
 * + kanıt başlıkları: `retry-after` (RFC 9110 standardı, istemcinin ne zaman
 * yeniden deneyeceğini söyler) ve `x-ratelimit-limit`/`x-ratelimit-remaining`
 * (IETF taslağı `RateLimit` başlıklarının kebap-case yaygın biçimi — bu kartın
 * kabul kriteri #3 açıkça bu başlıkları rapora yapıştırmayı istiyor).
 */
export function rateLimitedResponse(params: RateLimitedResponseParams): Response {
  const body: ErrorResponse = { code: 'RATE_LIMITED', message: params.message }
  const headers = new Headers({
    'content-type': 'application/json',
    'retry-after': String(Math.max(1, Math.ceil(params.retryAfterSeconds))),
  })
  if (params.limit !== undefined) headers.set('x-ratelimit-limit', String(params.limit))
  if (params.remaining !== undefined) {
    headers.set('x-ratelimit-remaining', String(Math.max(0, params.remaining)))
  }
  return new Response(JSON.stringify(body), { status: 429, headers })
}
