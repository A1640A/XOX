import { describe, expect, it } from 'vitest'
import { decodeJwtPayload, getJwtExpiryMs, identityFromAccessToken, isExpiringSoon } from './jwt'

/** Testte gerçek `jose` imzalamadan kaçınmak için elle base64url JWT üretir. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  return `${header}.${body}.imza-onemli-degil`
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return Buffer.from(binary, 'binary')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

describe('decodeJwtPayload', () => {
  it('geçerli bir JWT gövdesini çözer (Türkçe karakterler dahil)', () => {
    const token = fakeJwt({ sub: 'user-1', name: 'Ömer Dursun', exp: 1_800_000_000 })
    expect(decodeJwtPayload(token)).toStrictEqual({
      sub: 'user-1',
      name: 'Ömer Dursun',
      exp: 1_800_000_000,
    })
  })

  it('üç parçalı olmayan bir dizeyi null döner', () => {
    expect(decodeJwtPayload('tek-parca')).toBeNull()
    expect(decodeJwtPayload('iki.parca')).toBeNull()
  })

  it('bozuk base64/JSON içeriği null döner', () => {
    expect(decodeJwtPayload('kafa.####.imza')).toBeNull()
  })

  it('boş gövde parçası null döner', () => {
    expect(decodeJwtPayload('kafa..imza')).toBeNull()
  })
})

describe('getJwtExpiryMs', () => {
  it('exp saniyeyi milisaniyeye çevirir', () => {
    const token = fakeJwt({ sub: 'x', exp: 1000 })
    expect(getJwtExpiryMs(token)).toBe(1_000_000)
  })

  it('exp yoksa/sayı değilse null döner', () => {
    expect(getJwtExpiryMs(fakeJwt({ sub: 'x' }))).toBeNull()
    expect(getJwtExpiryMs('bozuk')).toBeNull()
  })
})

describe('isExpiringSoon', () => {
  it('süre bitimine marj kadar veya daha az kaldıysa true döner', () => {
    const token = fakeJwt({ exp: 1000 }) // 1_000_000 ms
    expect(isExpiringSoon(token, 999_000, 5_000)).toBe(true) // 1000ms kaldı <= 5000
    expect(isExpiringSoon(token, 990_000, 5_000)).toBe(false) // 10000ms kaldı > 5000
  })

  it('çözülemeyen token FAIL-CLOSED true döner (yenilenmeli sayılır)', () => {
    expect(isExpiringSoon('bozuk-token', 0, 5_000)).toBe(true)
  })
})

describe('identityFromAccessToken', () => {
  it('sub + name claim`lerini { userId, name } olarak döner', () => {
    const token = fakeJwt({ sub: 'user-42', name: 'Zeynep' })
    expect(identityFromAccessToken(token)).toStrictEqual({ userId: 'user-42', name: 'Zeynep' })
  })

  it('name yoksa boş dizeye düşer', () => {
    const token = fakeJwt({ sub: 'user-42' })
    expect(identityFromAccessToken(token)).toStrictEqual({ userId: 'user-42', name: '' })
  })

  it('sub yoksa/boşsa null döner', () => {
    expect(identityFromAccessToken(fakeJwt({ name: 'Ayşe' }))).toBeNull()
    expect(identityFromAccessToken(fakeJwt({ sub: '' }))).toBeNull()
  })

  it('çözülemeyen token null döner', () => {
    expect(identityFromAccessToken('bozuk')).toBeNull()
  })
})
