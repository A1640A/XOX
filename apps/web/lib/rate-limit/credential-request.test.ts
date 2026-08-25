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

  it(
    'GÜVENLİK DENETİMİ — BLOCKER-1 (parametre kirliliği): ÇOKLU `email` alanı içeren ' +
      "gövdede Auth.js'in KENDİSİYLE (@auth/core@0.41.3 lib/utils/web.js:14-15, " +
      'Object.fromEntries(new URLSearchParams(...))) AYNI algoritmayı kullanır — SONUNCU ' +
      'değeri alır. Beklenti HARDCODE değil, AYNI algoritmadan bağımsızca türetiliyor.',
    () => {
      const poisoned =
        'email=cop%2B1@attacker.test&password=guess&email=kurban@xox.test&csrfToken=x'
      const authJsParsed: Record<string, string> = Object.fromEntries(new URLSearchParams(poisoned))
      expect(extractEmailFromBody(poisoned, 'application/x-www-form-urlencoded')).toBe(
        authJsParsed['email'],
      )
      expect(extractEmailFromBody(poisoned, 'application/x-www-form-urlencoded')).toBe(
        'kurban@xox.test',
      )
    },
  )

  it(
    'BLOCKER-1 REGRESYON — ÖNCESİ/SONRASI: eski `URLSearchParams.get()` yaklaşımı bu ' +
      'AYNI gövdede FARKLI (yanlış) bir e-posta okurdu; get() İLKİNİ, Object.fromEntries ' +
      'SONUNCUYU alır — split-brain KANITI budur',
    () => {
      const poisoned =
        'email=cop%2B1@attacker.test&password=guess&email=kurban@xox.test&csrfToken=x'
      const oncekiDavranis = new URLSearchParams(poisoned).get('email') // ESKİ (hatalı) kod
      const simdikiDavranis = extractEmailFromBody(poisoned, 'application/x-www-form-urlencoded')
      expect(oncekiDavranis).toBe('cop+1@attacker.test')
      expect(simdikiDavranis).toBe('kurban@xox.test')
      expect(oncekiDavranis).not.toBe(simdikiDavranis)
    },
  )

  it('ters yön: birinci alan kurban, ikinci alan çöpse yine SONUNCUYU (çöpü) alır — kurban artık etkilenmez', () => {
    const poisoned = 'email=kurban@xox.test&password=guess&email=cop%2B1@attacker.test'
    expect(extractEmailFromBody(poisoned, 'application/x-www-form-urlencoded')).toBe(
      'cop+1@attacker.test',
    )
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

  /**
   * GÜVENLİK DENETİMİ — HIGH-1 (bölünmüş oturum çerezi). Aşağıdaki
   * yardımcı, `@auth/core@0.41.3` `lib/utils/cookie.js:118-186`teki
   * `SessionStore` sınıfının ÖZEL `#chunk` metodunun BİREBİR PORTUDUR
   * (sabitler dahil: `ALLOWED_COOKIE_SIZE=4096`,
   * `ESTIMATED_EMPTY_COOKIE_SIZE=160` → `CHUNK_SIZE=3936`). Paket bu iç
   * yolu `exports` haritasında dışa VERMEDİĞİ için doğrudan import
   * edilemez — bu yüzden algoritma burada TEKRARLANIYOR, amaç yalnız
   * gerçek Auth.js çıktısıyla BİREBİR aynı şekilde adlandırılmış bir test
   * fixture'ı üretmek. Üretim kodu (`hasSessionCookie`) bu porta hiçbir
   * BAĞIMLILIK duymuyor — yalnız test, gerçek algoritmayı doğrulamak için
   * kullanıyor.
   */
  const AUTH_CORE_CHUNK_SIZE = 4096 - 160

  function chunkLikeAuthCore(cookieName: string, value: string): { name: string; value: string }[] {
    const chunkCount = Math.ceil(value.length / AUTH_CORE_CHUNK_SIZE)
    if (chunkCount === 1) return [{ name: cookieName, value }]
    const chunks: { name: string; value: string }[] = []
    for (let i = 0; i < chunkCount; i++) {
      const start = i * AUTH_CORE_CHUNK_SIZE
      chunks.push({
        name: `${cookieName}.${String(i)}`,
        value: value.slice(start, start + AUTH_CORE_CHUNK_SIZE),
      })
    }
    return chunks
  }

  it(
    "HIGH-1: @auth/core@0.41.3 SessionStore'un GERÇEK parçalama algoritmasıyla üretilen " +
      'çok-parçalı çerez adlarını (`.0`, `.1`, …) tanır',
    () => {
      const bigToken = 'a'.repeat(5000) // CHUNK_SIZE(3936)'ı aşar → 2 parçaya bölünmeli
      const chunks = chunkLikeAuthCore('__Secure-authjs.session-token', bigToken)
      expect(chunks).toHaveLength(2)
      expect(chunks[0]?.name).toBe('__Secure-authjs.session-token.0')
      expect(chunks[1]?.name).toBe('__Secure-authjs.session-token.1')

      const headers = new Headers()
      for (const chunk of chunks) {
        headers.append('set-cookie', `${chunk.name}=${chunk.value}; Path=/; Secure; HttpOnly`)
      }
      const response = new Response(null, { headers })
      expect(hasSessionCookie(response)).toBe(true)
    },
  )

  it(
    'HIGH-1 REGRESYON — ÖNCESİ/SONRASI: eski tek-parça-varsayan regex bölünmüş çerezi ' +
      'KAÇIRIRDI (başarılı giriş "başarısız" sayılırdı); yeni regex yakalıyor',
    () => {
      const eskiRegex = /(^|;\s*)(__Secure-)?authjs\.session-token=/
      const parcaliCerez = '__Secure-authjs.session-token.0=parcali-deger; Path=/'
      expect(eskiRegex.test(parcaliCerez)).toBe(false) // ESKİ davranış: kaçırıyordu
      expect(
        hasSessionCookie(new Response(null, { headers: { 'set-cookie': parcaliCerez } })),
      ).toBe(true) // YENİ davranış: yakalıyor
    },
  )

  it('3+ parçalı bir çerezde SADECE son parça (`.2`) tek başına gelirse de tanır (sıra bağımsız)', () => {
    const headers = new Headers()
    headers.append('set-cookie', 'authjs.session-token.2=son-parca; Path=/')
    const response = new Response(null, { headers })
    expect(hasSessionCookie(response)).toBe(true)
  })
})
