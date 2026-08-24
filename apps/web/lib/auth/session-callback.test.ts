import { describe, expect, it } from 'vitest'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { applySessionUser } from './session-callback'

function makeSession(): Session {
  return {
    user: { id: '', name: 'Placeholder', email: null, image: null },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

describe('applySessionUser', () => {
  // İKİ FARKLI `sub` değeriyle test edilir — tek bir sabit değerle test
  // edilseydi `session.user.id = 'sabit-yonetici'` gibi bir mutasyon (her
  // kullanıcıyı aynı kimliğe bağlayan bir hesap-devralma açığı) hiçbir
  // testi kırmazdı (güvenlik denetiminin auth.static.test.ts için verdiği
  // örnekle aynı sınıf zafiyet — bkz. session-callback.ts'teki not).
  it.each([
    ['user-alpha-1', 'user-alpha-1'],
    ['user-beta-2', 'user-beta-2'],
  ])('token.sub=%s ise session.user.id AYNI değere set edilir', (sub, expected) => {
    const session = makeSession()
    const token = { sub } as JWT
    const result = applySessionUser(session, token)
    expect(result.user.id).toBe(expected)
  })

  it('token.sub tanımsızsa session.user.id DOKUNULMADAN kalır', () => {
    const session = makeSession()
    session.user.id = 'onceki-deger'
    const token = {} as JWT
    const result = applySessionUser(session, token)
    expect(result.user.id).toBe('onceki-deger')
  })

  it('aynı session referansını döner (mutasyon + return)', () => {
    const session = makeSession()
    const token = { sub: 'user-gamma-3' } as JWT
    const result = applySessionUser(session, token)
    expect(result).toBe(session)
  })
})
