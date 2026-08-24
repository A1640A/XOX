import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { authConfig, PROTECTED_ROUTE_PREFIXES } from './auth.config'

function requestFor(pathname: string, search = ''): NextRequest {
  return new NextRequest(`https://xox.test${pathname}${search}`)
}

describe('auth.config — split config kenar-güvenliği', () => {
  it('yalnız pages + callbacks.authorized (+ boş providers) içerir', () => {
    expect(Object.keys(authConfig).sort()).toStrictEqual(['callbacks', 'pages', 'providers'].sort())
    expect(authConfig.providers).toStrictEqual([])
    expect(authConfig.pages).toStrictEqual({ signIn: '/giris' })
  })
})

describe('authorized callback — KK-007 korunan rota yönlendirmesi', () => {
  // Kart metninden ELLE kopyalanmıştır — middleware.ts'in matcher'ından
  // TÜRETİLMEZ (gotchas.md "kendine-referanslı test").
  const PROTECTED_PATHS_FROM_KART = [
    '/oyna/oda-1',
    '/oda/ABC234',
    '/profil',
    '/siralama',
    '/gecmis',
    '/arkadaslar',
  ]

  it.each(PROTECTED_PATHS_FROM_KART)(
    'oturumsuz istek %s için 307 /giris?donus=... döner',
    (pathname) => {
      const request = requestFor(pathname, '?x=1')
      const result = authConfig.callbacks.authorized({ request, auth: null })
      expect(result).toBeInstanceOf(Response)
      const response = result as Response
      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toBe(`https://xox.test/giris?donus=${encodeURIComponent(`${pathname}?x=1`)}`)
    },
  )

  it.each(PROTECTED_PATHS_FROM_KART)('oturumlu istek %s için true döner (geçer)', (pathname) => {
    const request = requestFor(pathname)
    const result = authConfig.callbacks.authorized({
      request,
      auth: { user: { id: 'u1' }, expires: new Date(Date.now() + 60_000).toISOString() },
    })
    expect(result).toBe(true)
  })

  it('korunmayan bir rota (ör. /) her zaman true döner', () => {
    const request = requestFor('/')
    const result = authConfig.callbacks.authorized({ request, auth: null })
    expect(result).toBe(true)
  })

  it('/davet/:kod KORUNMAZ (KK-121) — listede yok, true döner', () => {
    expect(PROTECTED_ROUTE_PREFIXES).not.toContain('/davet')
  })

  it('PROTECTED_ROUTE_PREFIXES kart metniyle BİREBİR aynıdır (6 öge)', () => {
    // Bu da elle yazılmıştır — sabitin kendisiyle karşılaştırmak "özdeşlik
    // iddiası" olurdu (gotchas.md); burada bağımsız bir liste kopyalanmıştır.
    expect([...PROTECTED_ROUTE_PREFIXES].sort()).toStrictEqual(
      ['/oyna', '/oda', '/profil', '/siralama', '/gecmis', '/arkadaslar'].sort(),
    )
  })
})
