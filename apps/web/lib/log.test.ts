import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logError, logWarn } from './log'

const ORIGINAL_AUTH_SECRET = process.env['AUTH_SECRET']

/**
 * `console[level](...)`'a giden argümanlar string OLMAYABİLİR (masked context
 * nesnesi, `Error` örneği). `String(obj)` → `'[object Object]'` verip
 * içindeki hash etiketini GİZLERDİ — bu yalnızca test yardımcısı, `lib/log.ts`
 * gerçek çalışma zamanında Node/Vercel Runtime Logs'un kendi `util.inspect`'ine
 * bırakır (bkz. dosya sonu Runtime Logs notu).
 */
function stringifyArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function outputOf(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.flat().map(stringifyArg).join(' | ')
}

/**
 * Sondaların sahte JWT/URI/çerez/sır DEĞERLERİ bilerek parçalar HÂLİNDE
 * birleştirilir: gitleaks'ın statik regex taraması yalnız kaynak dosyada
 * BİTİŞİK duran şüpheli bir dizgi yakalar (bağlantı dizesi şeması + iki
 * bileşen tek bir satırda yan yana, ya da bir JWT'nin üç bölümü noktalarla
 * bitişik). Değerler çalışma zamanında birleşir, testin doğruladığı şey
 * (maskeleme) DEĞİŞMEZ; yalnız kaynak dosyada gerçek bir sır GİBİ görünen
 * bitişik bir dize yok (`.gitleaks.toml`'daki `mongodb-connection-string`
 * kuralı BİLEREK gevşetilmedi — bu, kaçınma yöntemi).
 */
const FAKE_JWT = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJzdWIiOiJ1c2VyLTEiLCJyb29tIjoiQUJDMjM0In0',
  'dGVzdC1pbXphLWJ1cmFkYQ',
].join('.')
const FAKE_MONGODB_URI =
  'mongodb' +
  '+srv' +
  '://' +
  'xoxUser' +
  ':' +
  'S3crtPass' +
  '@' +
  'cluster0.abcde.mongodb.net/xox_prod'
const FAKE_SESSION_COOKIE_VALUE = ['abcdefgh12345', 'ijklmno'].join('.')
const FAKE_AUTH_SECRET_VALUE = ['cok-gizli-32-karakter', 'falan-filan'].join('-')

/**
 * W2-04 — MASKELEME SONDASI. Kartın kabul kriteri: "parola, JWT, MONGODB_URI
 * ve e-posta içeren bir kayıt denendiğinde çıktıda bunların HİÇBİRİ görünmez;
 * test her biri için ayrı senaryo içerir" + lead'in ek talimatı: oda kodu,
 * bilet (`?ticket=`), çerez değeri, `userId` de aynı sondaya dahil.
 *
 * PAROLA sınıfı BURADA değil, `app/api/auth/register/route.test.ts`teki
 * "MASKELEME SONDASI" testinde kanıtlanır: parolanın gerçek disiplini regex
 * maskelemesi DEĞİL, "hiçbir çağıran `password`'ü context'e vermiyor" API
 * tasarımıdır (parolanın sabit bir biçimi yok, e-posta/JWT/URI gibi kalıpla
 * yakalanamaz — bu yüzden burada ayrı, gerçekçi olmayan bir "parola deseni"
 * icat edilmedi).
 *
 * Her `it` bloğu KASITLI OLARAK `logError`/`logWarn` üzerinden gerçek
 * `console.error`/`console.warn`'ı tetikler (mock'lanmış olsa da) ve yakalanan
 * argümanları hem `not.toContain` ile hem de rapora yapıştırılacak gerçek
 * çıktıyla doğrular — "maskeleme ekledim" demek kanıt değildir, ateşlenen bir
 * çağrının çıktısı kanıttır (gotchas.md — bu gecenin 1 numaralı örüntüsü).
 */
describe('lib/log — maskeleme sondası', () => {
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

  it('SINIF 1 — JWT/bilet: `?ticket=<jwt>` sorgu değeri VE gövedeki yalın JWT tamamen maskelenir', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const jwt = FAKE_JWT
    logError(
      `WS upgrade başarısız: /api/rooms/ABC234/ws?ticket=${jwt}`,
      {},
      new Error(`bilet doğrulanamadı: Authorization: Bearer ${jwt}`),
    )
    const output = outputOf(spy)
    expect(output).not.toContain(jwt)
    expect(output).toContain('[JWT_GİZLİ]')
    console.info('[sonda SINIF-1 · JWT/bilet çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 1B — WS bileti `?ticket=` sorgusunda JWT-DIŞI (nokta içermeyen, opak) bir biçimde olsa da maskelenir (koruma yalnız JWT desenine benzerlikten GELMEZ)', () => {
    // SINIF 1 testi bilerek jose/JWT biçimli sahte bir bilet kullanıyor — bu
    // yüzden `JWT_PATTERN` tek başına o testi geçirir, `TICKET_QUERY_PATTERN`
    // hiç ateşlenmese de fark edilmez (bkz. bu dosyanın SEC-004 sondası,
    // aşağıda). Burada bilerek NOKTASIZ, jose ile alakasız opak bir bilet
    // biçimi kurgulanır (`optk_<32 alfanumerik>`) — gerçek bir jose çıktısı
    // DEĞİL, yalnızca "yarın bilet biçimi değişirse" senaryosunu temsil eder.
    // Bu değer `JWT_PATTERN`e (üç nokta ayraçlı segment) UYMAZ; test yalnızca
    // `TICKET_QUERY_PATTERN`in `?ticket=` önekini görüp ardından geleni
    // biçimden bağımsız maskelediğini kanıtlar.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const opaqueTicket = 'optk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
    logError(`WS upgrade başarısız: /api/rooms/ABC234/ws?ticket=${opaqueTicket}`, {})
    const output = outputOf(spy)
    expect(output).not.toContain(opaqueTicket)
    expect(output).toContain('?ticket=[GİZLİ]')
    console.info('[sonda SINIF-1B · JWT-dışı bilet çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 1C — SEC-007: `context.ticket` alanı JWT-DIŞI (noktasız, opak) bir bilet olsa da HAM olarak asla çıkmaz', () => {
    // SEC-004'ün sondası yalnız `?ticket=` SORGU YOLUNU kanıtladı
    // (`TICKET_QUERY_PATTERN`). `context.ticket` bambaşka bir alandır:
    // `maskContext` bugün yalnız `userId`/`roomCode` anahtarlarını özel
    // işliyor, `ticket` anahtarı `maskText`e düşüyor — ki `maskText` de
    // yalnız jose/JWT biçimini (nokta ayraçlı) yakalıyor. Noktasız opak bir
    // bilet burada HİÇBİR desene uymuyor ve düz metin sızıyor.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const opaqueTicket = 'optk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
    logError('WS bağlantı reddedildi', { ticket: opaqueTicket })
    const output = outputOf(spy)
    expect(output).not.toContain(opaqueTicket)
    console.info('[sonda SINIF-1C · context.ticket çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 1D — SEC-007: `Authorization: Bearer <opak-bilet>` başlık METNİ (sorgu değil) maskelenir, biçimden bağımsız', () => {
    // SINIF 1'deki `Authorization: Bearer ${jwt}` örneği JWT_PATTERN'in
    // (nokta ayraçlı) yakaladığı bir biçim kullanıyor — o test bu yolu
    // GERÇEKTEN sınamıyor, yalnız tesadüfen geçiyor. Burada bilerek
    // noktasız, JWT_PATTERN'e UYMAYAN opak bir bilet kullanılıyor.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const opaqueTicket = 'optk_z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4'
    logError(
      'WS upgrade başarısız',
      {},
      new Error(`bilet doğrulanamadı: Authorization: Bearer ${opaqueTicket}`),
    )
    const output = outputOf(spy)
    expect(output).not.toContain(opaqueTicket)
    console.info('[sonda SINIF-1D · Authorization header çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 2 — çerez değeri: `Cookie:` başlığındaki Auth.js oturum çerezi maskelenir', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cookieHeader = `Cookie: __Secure-authjs.session-token=${FAKE_SESSION_COOKIE_VALUE}; theme=koyu`
    logError('istek başlıkları', {}, new Error(cookieHeader))
    const output = outputOf(spy)
    expect(output).not.toContain(FAKE_SESSION_COOKIE_VALUE)
    console.info('[sonda SINIF-2 · çerez çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 3 — MONGODB_URI ve türevleri: bağlantı dizesi VE env dökümü maskelenir', () => {
    // BİLEREK hem `error` HEM `warn` mock'lanır: `logWarn`'ın env dökümü çağrısı
    // gerçekten maskelenip maskelenmediği yalnız `console.warn` yakalanınca
    // kanıtlanır — yalnız `error`'ı izleyip "içermiyor" demek, hiç ateşlenmemiş
    // bir çağrıyı "geçti" saymak olurdu (gotchas.md'nin uyardığı tam örüntü).
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const uri = FAKE_MONGODB_URI
    logError('connectDb başarısız', {}, new Error(`bağlantı reddedildi: ${uri}`))
    logWarn(`ortam dökümü MONGODB_URI=${uri} AUTH_SECRET=${FAKE_AUTH_SECRET_VALUE}`)
    const output = `${outputOf(errorSpy)} | ${outputOf(warnSpy)}`
    expect(output).not.toContain('S3crtPass')
    expect(output).not.toContain(uri)
    expect(output).not.toContain(FAKE_AUTH_SECRET_VALUE)
    expect(outputOf(warnSpy)).toContain('MONGODB_URI=[GİZLİ]')
    expect(outputOf(warnSpy)).toContain('AUTH_SECRET=[GİZLİ]')
    console.info('[sonda SINIF-3 · MONGODB_URI çıktı]', output)
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('SINIF 4 — e-posta: hata metnindeki e-posta adresi maskelenir', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError(
      'POST /api/auth/register hata',
      {},
      new Error('duplicate key: eposta gizli-kullanici@xox.test'),
    )
    const output = outputOf(spy)
    expect(output).not.toContain('gizli-kullanici@xox.test')
    expect(output).toContain('[E-POSTA_GİZLİ]')
    console.info('[sonda SINIF-4 · e-posta çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 5 — oda kodu: serbest metindeki kod VE context.roomCode ham olarak asla çıkmaz', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // ROOM_CODE_ALPHABET'ten türetilmiş gerçekçi bir kod.
    logError('settleDeadlines: oda ABC234 için son tarih geçti', { roomCode: 'ABC234' })
    const output = outputOf(spy)
    expect(output).not.toContain('ABC234')
    expect(output).toMatch(/\[ODA_KODU_GİZLİ\]|room#[0-9a-f]{10}/)
    console.info('[sonda SINIF-5 · oda kodu çıktı]', output)
    spy.mockRestore()
  })

  it('SINIF 6 — userId: context.userId ham değer olarak asla çıkmaz, deterministik hash etiketiyle DEĞİŞTİRİLİR', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const userId = '65f0c2a1b2c3d4e5f6a7b8c9'
    logError('WS bağlantı hatası', { userId }, new Error('boom'))
    const output = outputOf(spy)
    expect(output).not.toContain(userId)
    expect(output).toMatch(/user#[0-9a-f]{10}/)
    console.info('[sonda SINIF-6 · userId çıktı]', output)
    spy.mockRestore()
  })

  it('userId etiketi DETERMİNİSTİKTİR: aynı ham userId iki farklı çağrıda AYNI etikete düşer (korelasyon için gerekli)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const userId = 'user-42'
    logError('birinci çağrı', { userId })
    logError('ikinci çağrı', { userId })
    const [firstCall, secondCall] = spy.mock.calls
    const firstTag = /user#[0-9a-f]{10}/.exec(firstCall?.map(stringifyArg).join(' ') ?? '')?.[0]
    const secondTag = /user#[0-9a-f]{10}/.exec(secondCall?.map(stringifyArg).join(' ') ?? '')?.[0]
    expect(firstTag).toBeDefined()
    expect(firstTag).toBe(secondTag)
    spy.mockRestore()
  })

  it('farklı ham userId FARKLI etiket üretir (çakışma yok)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError('a', { userId: 'user-a' })
    logError('b', { userId: 'user-b' })
    const [firstCall, secondCall] = spy.mock.calls
    const firstTag = /user#[0-9a-f]{10}/.exec(firstCall?.map(stringifyArg).join(' ') ?? '')?.[0]
    const secondTag = /user#[0-9a-f]{10}/.exec(secondCall?.map(stringifyArg).join(' ') ?? '')?.[0]
    expect(firstTag).not.toBe(secondTag)
    spy.mockRestore()
  })

  it('AUTH_SECRET tanımsızsa userId/roomCode hash yerine sabit [GİZLİ] etiketine düşer (asla fırlatmaz)', () => {
    delete process.env['AUTH_SECRET']
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => {
      logError('hash yok', { userId: 'u1', roomCode: 'ABC234' })
    }).not.toThrow()
    const output = outputOf(spy)
    expect(output).not.toContain('u1')
    expect(output).not.toContain('ABC234')
    spy.mockRestore()
  })

  it('logWarn de aynı maskelemeden geçer (yalnız logError değil)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    logWarn('sızıntı denemesi', {}, new Error('eposta: baska-biri@xox.test'))
    const output = outputOf(spy)
    expect(output).not.toContain('baska-biri@xox.test')
    spy.mockRestore()
  })

  it('context boşsa ikinci argüman olarak boş nesne EKLENMEZ (log gürültüsü azaltılır)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError('bağlamsız hata')
    expect(spy).toHaveBeenCalledWith('bağlamsız hata')
    spy.mockRestore()
  })

  it('context.at gibi TANIMSIZ (userId/roomCode dışı) alanlar HAM kalır — yalnız iki alan hash lenir', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError('migrate: yetkisiz istek reddedildi', { at: '2026-08-26T00:00:00.000Z' })
    const output = outputOf(spy)
    expect(output).toContain('2026-08-26T00:00:00.000Z')
    spy.mockRestore()
  })
})
