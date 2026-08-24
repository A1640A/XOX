import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `middleware.ts` gerçek `next-auth` paketini import ediyor; o paketin
 * derlenmiş çıktısı `next/server`'ı uzantısız import ettiği için Vitest'in
 * native ESM yükleyicisinde çalışma-anı testi YAPILAMAZ (bkz.
 * lib/auth/authorize.ts'teki not — gotchas.md'ye eklendi).
 *
 * Bu yüzden edge-güvenlik değişmezi burada METİN düzeyinde doğrulanır;
 * gerçek mekanik kanıt `pnpm --filter @xox/web build` — Next, middleware'i
 * kenar çalışma zamanı için derlerken `mongoose`/`@node-rs/argon2` sızarsa
 * build SERT biçimde patlar.
 */
const middlewareSource = readFileSync(join(process.cwd(), 'middleware.ts'), { encoding: 'utf8' })

describe('middleware.ts — split config kenar-güvenliği (ADR-0009 E)', () => {
  it('YALNIZ ./auth.config import eder — mongoose/argon2 barındıran ./auth ASLA', () => {
    expect(middlewareSource).toMatch(/from ['"]\.\/auth\.config['"]/)
    expect(middlewareSource).not.toMatch(/from ['"]\.\/auth['"]/)
  })

  it('mongoose / @node-rs/argon2 / @xox/db doğrudan import etmez', () => {
    const importLines = middlewareSource
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import '))
      .join('\n')
    expect(importLines).not.toContain('mongoose')
    expect(importLines).not.toContain('@node-rs/argon2')
    expect(importLines).not.toContain('@xox/db')
  })

  it('matcher kart metnindeki 6 korunan rotayı BİREBİR içerir (elle yazılmış liste)', () => {
    const KART_MATCHER = [
      '/oyna/:path*',
      '/oda/:path*',
      '/profil',
      '/siralama',
      '/gecmis',
      '/arkadaslar',
    ]
    for (const pattern of KART_MATCHER) {
      expect(middlewareSource).toContain(pattern)
    }
  })
})
