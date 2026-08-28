import { describe, expect, it } from 'vitest'
import { generateAuthState, parseAuthCallbackUrl } from './deep-link'

describe('parseAuthCallbackUrl', () => {
  it('geçerli başarı linkini { ok:true, token, refresh } olarak çözer', () => {
    const result = parseAuthCallbackUrl(
      'xox://auth?token=abc.def.ghi&refresh=jkl.mno.pqr&state=s1',
      's1',
    )
    expect(result).toStrictEqual({ ok: true, token: 'abc.def.ghi', refresh: 'jkl.mno.pqr' })
  })

  it('state EŞLEŞMİYORSA STATE_MISMATCH döner — token/refresh geçerli olsa bile', () => {
    const result = parseAuthCallbackUrl(
      'xox://auth?token=t&refresh=r&state=saldirgan-state',
      'gercek-state',
    )
    expect(result).toStrictEqual({ ok: false, code: 'STATE_MISMATCH' })
  })

  it('sunucunun ürettiği hata deep link (?error=) kodu AYNEN taşır', () => {
    const result = parseAuthCallbackUrl('xox://auth?error=SERVER_ERROR&state=s1', 's1')
    expect(result).toStrictEqual({ ok: false, code: 'SERVER_ERROR' })
  })

  it('token/refresh eksikse INVALID_MESSAGE döner', () => {
    expect(parseAuthCallbackUrl('xox://auth?state=s1', 's1')).toStrictEqual({
      ok: false,
      code: 'INVALID_MESSAGE',
    })
    expect(parseAuthCallbackUrl('xox://auth?token=t&state=s1', 's1')).toStrictEqual({
      ok: false,
      code: 'INVALID_MESSAGE',
    })
  })

  it('ayrıştırılamayan bir URL INVALID_MESSAGE döner', () => {
    expect(parseAuthCallbackUrl('boyle-bir-url-yok', 's1')).toStrictEqual({
      ok: false,
      code: 'INVALID_MESSAGE',
    })
  })

  it('state parametresi hiç yoksa boş dizeyle karşılaştırılır (beklenen boş değilse eşleşmez)', () => {
    expect(parseAuthCallbackUrl('xox://auth?token=t&refresh=r', 's1')).toStrictEqual({
      ok: false,
      code: 'STATE_MISMATCH',
    })
  })
})

describe('generateAuthState', () => {
  it('deterministik rng ile ÇIPLAK bir değer üretir (sabit)', () => {
    expect(generateAuthState(() => 0.5)).toBe('zik0zjzik0zjzik0zjzik0zj')
  })

  it('varsayılan Math.random ile her çağrıda FARKLI bir değer üretir', () => {
    const a = generateAuthState()
    const b = generateAuthState()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })
})
