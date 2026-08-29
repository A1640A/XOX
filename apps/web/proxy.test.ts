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
 * fonksiyonunu derlerken `Route segment config is not allowed in Proxy
 * file` (elle `runtime` ihracı) ya da bozuk bir `matcher` varsa SERT
 * biçimde patlar. `matcher`'a `.slice(...)` gibi hesaplanmış bir ifade
 * sarılırsa da build SERT reddediyor ("matcher needs to be a static string
 * or array of static strings" — canlı doğrulandı), yani bu dosyadaki
 * `matcher` HER ZAMAN saf bir literal dizi olmak zorunda.
 *
 * PERF-008: `proxy.ts` (Auth.js middleware sarmalayıcısı) artık DB (tema
 * çerezi) okuyor. Bunun DB'ye giden dalı `resolveThemeCookieValue`
 * (`lib/theme.ts`, next-auth'tan TAMAMEN bağımsız) içinde yaşıyor ve
 * `theme.test.ts`te GERÇEK bir davranış testiyle (DB-çağrısı casusu)
 * kilitleniyor — bu dosyadaki testler yalnız `proxy.ts`in o fonksiyonu
 * NASIL BAĞLADIĞINI (hangi importlar, hangi çerez adı) doğrular.
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

describe('proxy.ts — split config kenar-güvenliği (ADR-0009 E, OPS-004, PERF-008)', () => {
  it('YALNIZ ./auth.config import eder — Credentials/argon2 barındıran ./auth ASLA', () => {
    expect(proxySource).toMatch(/from ['"]\.\/auth\.config['"]/)
    expect(proxySource).not.toMatch(/from ['"]\.\/auth['"]/)
  })

  it('@node-rs/argon2 / next-auth/providers/credentials doğrudan import etmez', () => {
    const importLines = proxySource
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import '))
      .join('\n')
    expect(importLines).not.toContain('@node-rs/argon2')
    expect(importLines).not.toContain('next-auth/providers/credentials')
  })

  /**
   * PERF-008 öncesi bu test "@xox/db doğrudan import etmez" iddia ediyordu —
   * o dönem `middleware.ts` kenar (edge) çalışma zamanındaydı ve mongoose
   * orada ÇALIŞMAZDI. OPS-004 ile `proxy.ts`'e taşınan dosya artık HER ZAMAN
   * Node.js çalışma zamanındadır (canlı `pnpm build` kanıtı: aşağıdaki test,
   * kaynağın buna göre `runtime` ihracı YAPMADIĞINI kilitler — Next.js proxy
   * dosyalarında elle bir `runtime` ihracını SERT reddeder, "Route segment
   * config is not allowed in Proxy file"). Yani `./lib/theme` üzerinden
   * DOLAYLI `@xox/db` bağımlılığı artık GÜVENLİ ve KASITLI — bu test onu
   * yasaklamaz, yalnız DOĞRUDAN (kendi import satırında) `mongoose` YAZILI
   * OLMADIĞINI (yani mongoose'un tek giriş kapısının hâlâ `lib/theme.ts`
   * olduğunu, proxy.ts'in onu ATLAYIP kendi mongoose sorgusunu yazmadığını)
   * doğrular.
   */
  it('mongoose paketini DOĞRUDAN import etmez — tek DB giriş kapısı ./lib/theme', () => {
    const importLines = proxySource
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import '))
      .join('\n')
    expect(importLines).not.toContain("from 'mongoose'")
    expect(proxySource).toMatch(/from ['"]\.\/lib\/theme['"]/)
  })

  it('matcher literal DİZİSİ auth.config.ts’teki MIDDLEWARE_MATCHER ile TAM eşit', () => {
    const parsed = parseMatcherLiteral(proxySource)
    expect(parsed).toStrictEqual([...MIDDLEWARE_MATCHER])
  })

  /**
   * PERF-008 — Next.js proxy dosyaları `export const runtime = ...` gibi bir
   * route-segment config'i KABUL ETMEZ ("Proxy always runs on Node.js
   * runtime" — canlı `pnpm build` kaynağıyla doğrulandı,
   * `next/dist/build/analysis/get-page-static-info.js`). Biri "acaba
   * Node.js'e daha açık geçelim" diye elle bir `runtime` ihracı eklerse
   * `pnpm build` production modunda SERT hata fırlatır (dev modunda yalnız
   * log basar ve dosyayı yok sayar) — bu test o regresyonu Vitest'te,
   * gerçek bir build koşmadan yakalar.
   */
  it("'export const runtime' İHRAÇ ETMEZ — Proxy dosyaları bunu build-time'da reddeder", () => {
    // Yorum satırlarını ele (gotchas.md "kaynak metni okuyan test" dersi):
    // bu dosyanın KENDİ dokümantasyonu `export const runtime` metnini
    // örnek/açıklama olarak barındırıyor — yalnız YORUM DIŞI kod satırları
    // taranır.
    const codeLines = proxySource
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n')
    expect(codeLines).not.toMatch(/export const runtime/)
  })
})
