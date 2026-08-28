import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `auth.ts` gerçek `next-auth` paketini import ediyor; o paket derlenmiş
 * çıktısında `next/server`'ı uzantısız import ettiği için (kendi kodundaki
 * "@ts-expect-error Next.js does not yet correctly use the package.json#exports
 * field" yorumuyla bunu kabul ediyor) Vitest'in native ESM yükleyicisinde
 * çalışma-anı testi YAPILAMAZ — `Cannot find module '.../next/server'`.
 * Bu, gerçek `next-auth` paketini import eden HER modül (`./auth`,
 * `./middleware`) için geçerli; gotchas.md'ye kayıt düşüldü.
 *
 * ÖNEMLİ SINIR (güvenlik denetimi bulgusu): bu dosyadaki testler `auth.ts`'i
 * ÇALIŞTIRMAZ, yalnız kaynak METNİNİ tarar. Bu, kendi başına GÜVENİLİR bir
 * davranış kanıtı DEĞİLDİR — `auth.ts` içine gömülü herhangi bir mantık
 * (örn. eskiden burada duran `jwt`/`session` callback gövdeleri) bu şekilde
 * test edilemez; bir mutasyon (`token.sub = 'sabit-yonetici'` gibi) hiçbir
 * testi kırmadan buradan geçer. Bu yüzden `auth.ts`'in TÜM gerçek mantığı
 * (`authorizeCredentials`, `applySessionUser`) `next-auth`'a bağımlı OLMAYAN
 * ayrı dosyalara taşındı ve ORADA gerçek, çalıştırılan testlerle kilitlendi
 * (`lib/auth/authorize.test.ts`, `lib/auth/session-callback.test.ts`).
 * Bu dosyada kalan tek şey "auth.ts satır içi mantık İÇERMİYOR, hep dışarıya
 * DELEGE EDİYOR" iddiasıdır — mekanik kanıt yine `pnpm --filter @xox/web build`.
 */
const authSource = readFileSync(join(process.cwd(), 'auth.ts'), { encoding: 'utf8' })

describe('auth.ts — ADR-0009 A: adapter alanı yok, mantık DIŞARIYA delege edilir', () => {
  it('"adapter" anahtarı HİÇBİR yerde geçmez', () => {
    expect(authSource).not.toMatch(/\badapter\s*:/)
    expect(authSource).not.toContain('MongoDBAdapter')
    expect(authSource).not.toContain('@auth/mongodb-adapter')
  })

  it('Credentials sağlayıcısını authorizeCredentials ile kurar', () => {
    expect(authSource).toMatch(/Credentials\(\s*\{\s*authorize:\s*authorizeCredentials\s*\}\s*\)/)
  })

  it("session stratejisi açıkça 'jwt' olarak ayarlanır (varsayılana güvenilmez)", () => {
    expect(authSource).toMatch(/session:\s*\{\s*strategy:\s*['"]jwt['"]\s*\}/)
  })

  it('iş mantığı (authorizeCredentials) ayrı, test edilebilir bir dosyadan gelir', () => {
    expect(authSource).toMatch(/from ['"]\.\/lib\/auth\/authorize['"]/)
  })

  it('session callback mantığı ayrı, test edilebilir bir dosyadan gelir (applySessionUser)', () => {
    expect(authSource).toMatch(/from ['"]\.\/lib\/auth\/session-callback['"]/)
    expect(authSource).toMatch(/applySessionUser\(session,\s*token\)/)
  })

  it(
    "'jwt' callback'i TANIMLANMAZ — @auth/core oturum okumasında `user` " +
      'anahtarı OLMADAN çağırır, bir zamanlar burada duran ' +
      '`user.id !== undefined` satırı her oturum okumasında TypeError ' +
      'fırlatıp çerezi siliyordu (güvenlik denetimi BLOCKER-1)',
    () => {
      expect(authSource).not.toMatch(/\bjwt\s*\(/)
    },
  )

  it(
    'SEC-005: events.signOut kancası tanımlıdır ve revokeTicketsOnSignOut ' +
      'ile DIŞARIYA delege eder — mantık burada satır içi YAZILMAZ',
    () => {
      expect(authSource).toMatch(/from ['"]\.\/lib\/auth\/signout-cleanup['"]/)
      expect(authSource).toMatch(/events:\s*\{/)
      expect(authSource).toMatch(/async signOut\(message\)/)
      expect(authSource).toMatch(/revokeTicketsOnSignOut\(token\?\.sub\)/)
    },
  )
})
