import { describe, expect, it } from 'vitest'
import { WS_CLOSE, isReconnectableCloseCode } from './ws-close'

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

describe('isReconnectableCloseCode', () => {
  it('takeover (4409) sonrası yeniden bağlanılmaz', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.SESSION_TAKEOVER)).toBe(false)
  })

  it('planlı rotasyon (4499) sonrası yeniden bağlanılır', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.ROTATE)).toBe(true)
  })

  it('diğer kapanışlarda yeniden bağlanılır', () => {
    expect(isReconnectableCloseCode(WS_CLOSE.IDLE_TIMEOUT)).toBe(true)
    expect(isReconnectableCloseCode(1006)).toBe(true)
  })
})
