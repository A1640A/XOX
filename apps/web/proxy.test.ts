import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIDDLEWARE_MATCHER } from './auth.config'

/**
 * `proxy.ts` (OPS-004 öncesi adıyla `middleware.ts`) gerçek `next-auth`
 * paketini import ediyor; o paketin derlenmiş çıktısı `next/server`'ı
 * uzantısız import ettiği için Vitest'in native ESM yükleyicisinde
 * çalışma-anı testi YAPILAMAZ (bkz. lib/auth/authorize.ts'teki not —
 * gotchas.md'ye eklendi).
 *
 * Bu yüzden edge-güvenlik değişmezi burada METİN düzeyinde doğrulanır;
 * gerçek mekanik kanıt `pnpm --filter @xox/web build` — Next, proxy
 * fonksiyonunu kenar çalışma zamanı için derlerken `mongoose`/`@node-rs/argon2`
 * sızarsa build SERT biçimde patlar. AYRICA: `matcher`'a `.slice(...)` gibi
 * hesaplanmış bir ifade sarılırsa da build SERT reddediyor ("matcher needs
 * to be a static string or array of static strings" — canlı doğrulandı),
 * yani bu dosyadaki `matcher` HER ZAMAN saf bir literal dizi olmak zorunda.
 */
const proxySource = readFileSync(join(process.cwd(), 'proxy.ts'), { encoding: 'utf8' })

/**
 * `matcher: [...]` literalini ayrıştırır. Güvenlik denetimi
 * bu dosyanın önceki sürümünü (`toContain` ile alt-dize arama)
 * `matcher.slice(0, 1)`e eşdeğer bir çalışma-zamanı kısaltmasıyla kırdı:
 * kaynak metinde tüm 6 rota hâlâ görünür kalıyordu (`toContain` hepsini
 * buluyordu) ama gerçek dizi yalnız ilk girdiyi taşıyordu. `toStrictEqual`
 * ile TAM DİZİ eşitliği istemek bu sınıfı (fazladan/eksik/yeniden sıralı
 * girdi) yakalar; saf `.slice()` sarmalaması ise zaten `pnpm build`
 * tarafından reddediliyor (yukarıdaki not).
 */
function parseMatcherLiteral(source: string): string[] {
  // Yorumlarda geçen örnek `matcher: [...]` metinleriyle karışmasın diye
  // yalnız GERÇEK export'tan sonrasında arar.
  const configIndex = source.indexOf('export const config')
  if (configIndex === -1) {
    throw new Error("proxy.ts içinde 'export const config' bulunamadı")
  }
  const configSource = source.slice(configIndex)
  const match = /matcher:\s*\[([^\]]*)\]/.exec(configSource)
  if (match?.[1] === undefined) {
    throw new Error("proxy.ts içindeki config export'unda 'matcher: [...]' bulunamadı")
  }
  return match[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const quoted = /^['"](.*)['"]$/.exec(entry)
      if (quoted?.[1] === undefined) {
        throw new Error(`matcher girdisi tırnaksız/literal değil: ${entry}`)
      }
      return quoted[1]
    })
}

describe('proxy.ts — split config kenar-güvenliği (ADR-0009 E, OPS-004)', () => {
  it('YALNIZ ./auth.config import eder — mongoose/argon2 barındıran ./auth ASLA', () => {
    expect(proxySource).toMatch(/from ['"]\.\/auth\.config['"]/)
    expect(proxySource).not.toMatch(/from ['"]\.\/auth['"]/)
  })

  it('mongoose / @node-rs/argon2 / @xox/db doğrudan import etmez', () => {
    const importLines = proxySource
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import '))
      .join('\n')
    expect(importLines).not.toContain('mongoose')
    expect(importLines).not.toContain('@node-rs/argon2')
    expect(importLines).not.toContain('@xox/db')
  })

  it('matcher literal DİZİSİ auth.config.ts’teki MIDDLEWARE_MATCHER ile TAM eşit', () => {
    const parsed = parseMatcherLiteral(proxySource)
    expect(parsed).toStrictEqual([...MIDDLEWARE_MATCHER])
  })
})
