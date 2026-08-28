import { afterEach, describe, expect, it } from 'vitest'

const ORIGINAL = process.env['EXPO_PUBLIC_API_BASE_URL']

describe('env', () => {
  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env['EXPO_PUBLIC_API_BASE_URL']
    } else {
      process.env['EXPO_PUBLIC_API_BASE_URL'] = ORIGINAL
    }
  })

  it('EXPO_PUBLIC_API_BASE_URL tanımsızsa localhost:3000 varsayılanına düşer', async () => {
    delete process.env['EXPO_PUBLIC_API_BASE_URL']
    const { getApiBaseUrl } = await import('./env')
    expect(getApiBaseUrl()).toBe('http://localhost:3000')
  })

  it('sondaki eğik çizgiyi kırpar', async () => {
    process.env['EXPO_PUBLIC_API_BASE_URL'] = 'https://xox.omerdursun.com/'
    const { getApiBaseUrl } = await import('./env')
    expect(getApiBaseUrl()).toBe('https://xox.omerdursun.com')
  })

  it('getWsBaseUrl http -> ws, https -> wss çevirir', async () => {
    process.env['EXPO_PUBLIC_API_BASE_URL'] = 'https://xox.omerdursun.com'
    const { getWsBaseUrl } = await import('./env')
    expect(getWsBaseUrl()).toBe('wss://xox.omerdursun.com')

    process.env['EXPO_PUBLIC_API_BASE_URL'] = 'http://localhost:3000'
    const { getWsBaseUrl: getWsBaseUrlLocal } = await import('./env')
    expect(getWsBaseUrlLocal()).toBe('ws://localhost:3000')
  })
})
