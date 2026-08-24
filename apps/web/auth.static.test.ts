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
 * Bu yüzden kriter 2 ("adapter alanı YOK") burada METİN düzeyinde
 * doğrulanır. Gerçek mekanik kanıt `pnpm --filter @xox/web build`.
 */
const authSource = readFileSync(join(process.cwd(), 'auth.ts'), { encoding: 'utf8' })

describe('auth.ts — ADR-0009 A: adapter alanı yok', () => {
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
})
