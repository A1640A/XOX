import { describe, expect, it } from 'vitest'
import {
  WS_CLOSE,
  isPermanentCloseCode,
  isReconnectableCloseCode,
  requiresReauth,
} from './ws-close'

describe('WS_CLOSE (tasarım §2.6)', () => {
  it('tam yedi kapanış kodu tanımlar', () => {
    expect(Object.keys(WS_CLOSE)).toHaveLength(7)
  })

  it('kodlar sözleşmedeki değerlerdir', () => {
    expect(WS_CLOSE).toEqual({
      PROTOCOL_VIOLATION: 4400,
      UNAUTHENTICATED: 4401,
      FORBIDDEN: 4403,
      NOT_FOUND: 4404,
      IDLE_TIMEOUT: 4408,
      SESSION_TAKEOVER: 4409,
      ROTATE: 4499,
    })
  })

  it('tüm kodlar uygulamaya özel 4000-4999 aralığındadır', () => {
    for (const code of Object.values(WS_CLOSE)) {
      expect(code).toBeGreaterThanOrEqual(4000)
      expect(code).toBeLessThanOrEqual(4999)
    }
  })
})

describe('isPermanentCloseCode — tekrar denemek düzeltmez', () => {
  it.each([
    ['PROTOCOL_VIOLATION', WS_CLOSE.PROTOCOL_VIOLATION],
    ['FORBIDDEN', WS_CLOSE.FORBIDDEN],
    ['NOT_FOUND', WS_CLOSE.NOT_FOUND],
    ['SESSION_TAKEOVER', WS_CLOSE.SESSION_TAKEOVER],
  ])('%s kalıcıdır', (_ad, code) => {
    expect(isPermanentCloseCode(code)).toBe(true)
  })

  it.each([
    ['UNAUTHENTICATED', WS_CLOSE.UNAUTHENTICATED],
    ['IDLE_TIMEOUT', WS_CLOSE.IDLE_TIMEOUT],
    ['ROTATE', WS_CLOSE.ROTATE],
  ])('%s kalıcı DEĞİLDİR', (_ad, code) => {
    expect(isPermanentCloseCode(code)).toBe(false)
  })

  it('sınıflandırılmamış kod kalıcı sayılmaz', () => {
    expect(isPermanentCloseCode(1006)).toBe(false)
  })
})

describe('requiresReauth — kör backoff değil, önce yeni bilet', () => {
  it('yalnız 4401 yeniden kimlik ister', () => {
    expect(requiresReauth(WS_CLOSE.UNAUTHENTICATED)).toBe(true)
    expect(requiresReauth(WS_CLOSE.IDLE_TIMEOUT)).toBe(false)
    expect(requiresReauth(WS_CLOSE.SESSION_TAKEOVER)).toBe(false)
    expect(requiresReauth(1006)).toBe(false)
  })
})

describe('isReconnectableCloseCode', () => {
  it('protokol ihlali (4400) sonrası yeniden bağlanılmaz — bağlan/kopar döngüsü olmasın', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.PROTOCOL_VIOLATION)).toBe(false)
  })

  it.each([
    ['FORBIDDEN', WS_CLOSE.FORBIDDEN],
    ['NOT_FOUND', WS_CLOSE.NOT_FOUND],
    ['SESSION_TAKEOVER', WS_CLOSE.SESSION_TAKEOVER],
  ])('%s sonrası yeniden bağlanılmaz', (_ad, code) => {
    expect(isReconnectableCloseCode(code)).toBe(false)
  })

  it('yeniden kimlik gereken kapanış (4401) yine de bağlanılabilirdir', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.UNAUTHENTICATED)).toBe(true)
  })

  it('planlı rotasyon (4499) sonrası yeniden bağlanılır', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.ROTATE)).toBe(true)
  })

  it('geçici ve sınıflandırılmamış kapanışlarda yeniden bağlanılır', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.IDLE_TIMEOUT)).toBe(true)
    expect(isReconnectableCloseCode(1006)).toBe(true)
  })
})

describe('sınıflandırma bütünlüğü', () => {
  it('her kod tam olarak bir davranış sınıfına düşer', () => {
    for (const code of Object.values(WS_CLOSE)) {
      const kalici = isPermanentCloseCode(code)
      expect(isReconnectableCloseCode(code)).toBe(!kalici)
      if (requiresReauth(code)) expect(kalici).toBe(false)
    }
  })
})
