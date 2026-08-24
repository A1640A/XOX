import { describe, expect, it } from 'vitest'
import { rateLimitedResponse } from './response'

describe('rateLimitedResponse', () => {
  it('429 döner, gövde @xox/shared ErrorResponse sözleşmesine (code/message) uyar', async () => {
    const response = rateLimitedResponse({ message: 'çok fazla istek', retryAfterSeconds: 30 })
    expect(response.status).toBe(429)
    const json = await response.json()
    expect(json).toStrictEqual({ code: 'RATE_LIMITED', message: 'çok fazla istek' })
  })

  it('retry-after başlığını saniye cinsinden, tamsayıya YUVARLANMIŞ set eder', () => {
    const response = rateLimitedResponse({ message: 'x', retryAfterSeconds: 12.4 })
    expect(response.headers.get('retry-after')).toBe('13')
  })

  it('retry-after ASLA 0 ya da negatif OLMAZ — en az 1', () => {
    const response = rateLimitedResponse({ message: 'x', retryAfterSeconds: 0 })
    expect(response.headers.get('retry-after')).toBe('1')
  })

  it('limit/remaining verildiğinde x-ratelimit-* başlıklarını set eder', () => {
    const response = rateLimitedResponse({
      message: 'x',
      retryAfterSeconds: 5,
      limit: 20,
      remaining: 0,
    })
    expect(response.headers.get('x-ratelimit-limit')).toBe('20')
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0')
  })

  it('limit/remaining verilmediğinde x-ratelimit-* başlıkları HİÇ EKLENMEZ', () => {
    const response = rateLimitedResponse({ message: 'x', retryAfterSeconds: 5 })
    expect(response.headers.has('x-ratelimit-limit')).toBe(false)
    expect(response.headers.has('x-ratelimit-remaining')).toBe(false)
  })
})
