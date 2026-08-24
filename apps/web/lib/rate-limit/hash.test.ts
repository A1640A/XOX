import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashIdentifier } from './hash'

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

describe('hashIdentifier', () => {
  beforeEach(() => {
    process.env['AUTH_SECRET'] = 'test-secret-en-az-32-karakter-uzunlugunda-olmali'
  })

  afterEach(() => {
    if (ORIGINAL_AUTH_SECRET === undefined) {
      delete process.env['AUTH_SECRET']
    } else {
      process.env['AUTH_SECRET'] = ORIGINAL_AUTH_SECRET
    }
  })

  it('AUTH_SECRET tanımlı değilse fırlatır', () => {
    delete process.env['AUTH_SECRET']
    expect(() => hashIdentifier('ns', 'deger')).toThrow('AUTH_SECRET')
  })

  it('aynı ad alanı + aynı ham değer HER ZAMAN aynı özeti üretir (deterministik)', () => {
    expect(hashIdentifier('ip-rate-limit', '1.2.3.4')).toBe(
      hashIdentifier('ip-rate-limit', '1.2.3.4'),
    )
  })

  it('farklı ad alanları AYNI ham değer için FARKLI özet üretir (çapraz-amaç çakışması yok)', () => {
    expect(hashIdentifier('ip-rate-limit', 'ayni-deger')).not.toBe(
      hashIdentifier('credential-lockout', 'ayni-deger'),
    )
  })

  it('ham değer ASLA çıktıda düz metin olarak yer almaz', () => {
    const raw = 'gizli-eposta@xox.test'
    expect(hashIdentifier('credential-lockout', raw)).not.toContain(raw)
  })
})
