import { describe, expect, it } from 'vitest'
import { extractEmailFromBody, hasSessionCookie } from './credential-request'

describe('extractEmailFromBody', () => {
  it('application/x-www-form-urlencoded gövdeden email alanını okur (Auth.js signIn varsayılanı)', () => {
    const body = new URLSearchParams({
      email: 'ayse@xox.test',
      password: 'sifre',
      csrfToken: 'x',
    }).toString()
    expect(extractEmailFromBody(body, 'application/x-www-form-urlencoded')).toBe('ayse@xox.test')
  })

  it('application/json gövdeden email alanını okur', () => {
    const body = JSON.stringify({ email: 'ayse@xox.test', password: 'sifre' })
    expect(extractEmailFromBody(body, 'application/json')).toBe('ayse@xox.test')
  })

  it('email alanı yoksa null döner', () => {
    const body = new URLSearchParams({ password: 'sifre' }).toString()
    expect(extractEmailFromBody(body, 'application/x-www-form-urlencoded')).toBeNull()
  })

  it('bozuk JSON gövdesi fırlatmaz, null döner', () => {
    expect(extractEmailFromBody('{bozuk', 'application/json')).toBeNull()
  })

  it('content-type null İSE form-urlencoded olarak ayrıştırmayı dener', () => {
    const body = new URLSearchParams({ email: 'ayse@xox.test' }).toString()
    expect(extractEmailFromBody(body, null)).toBe('ayse@xox.test')
  })
})

describe('hasSessionCookie', () => {
  it('authjs.session-token çerezi VARSA true döner (başarılı giriş sinyali)', () => {
    const response = new Response(null, {
      headers: { 'set-cookie': 'authjs.session-token=abc; Path=/; HttpOnly' },
    })
    expect(hasSessionCookie(response)).toBe(true)
  })

  it('__Secure- önekli oturum çerezini de tanır (HTTPS/production)', () => {
    const response = new Response(null, {
      headers: { 'set-cookie': '__Secure-authjs.session-token=abc; Path=/; Secure; HttpOnly' },
    })
    expect(hasSessionCookie(response)).toBe(true)
  })

  it('set-cookie başlığı YOKSA (başarısız giriş) false döner', () => {
    const response = new Response(null)
    expect(hasSessionCookie(response)).toBe(false)
  })

  it('BAŞKA bir çerez (ör. csrf-token) VARKEN oturum çerezi YOKSA false döner', () => {
    const response = new Response(null, {
      headers: { 'set-cookie': 'authjs.csrf-token=xyz; Path=/; HttpOnly' },
    })
    expect(hasSessionCookie(response)).toBe(false)
  })

  it('BİRDEN FAZLA set-cookie başlığı olduğunda (örn. csrf + session) doğru ayırt eder', () => {
    const headers = new Headers()
    headers.append('set-cookie', 'authjs.csrf-token=xyz; Path=/')
    headers.append('set-cookie', 'authjs.session-token=abc; Path=/; HttpOnly')
    const response = new Response(null, { headers })
    expect(hasSessionCookie(response)).toBe(true)
  })
})
