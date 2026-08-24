import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { cssVariables, themes, type Theme } from '@xox/ui-tokens'
import { generateGlobalsCss } from '@/lib/generate-globals-css'

/**
 * gotchas.md: "ESLint .css dosyalarını hiç ayrıştırmaz" — `globals.css` elle
 * yazılabilir ve token'lardan sessizce kayabilirdi (2026-08-24'te oldu). Bu
 * test kaynak metni okuyup desen ARAMAZ; diskteki dosyanın `generateGlobalsCss()`
 * çıktısıyla BİREBİR aynı olduğunu doğrular — üretilen ARTEFAKTLA karşılaştırma.
 * Biri `globals.css`'i elle değiştirirse (ör. bir hex'i kaydırırsa) bu test
 * kırmızı olur.
 */
describe('globals.css', () => {
  it('generateGlobalsCss() çıktısıyla birebir aynıdır', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const onDisk = readFileSync(join(dir, 'globals.css'), 'utf8')

    expect(onDisk).toBe(generateGlobalsCss())
  })

  it("her iki temanın TÜM renk token'larını @xox/ui-tokens ile birebir taşır (inceleme minor bulgusu)", () => {
    // İnceleme minor bulgusu: önceki sürüm yalnız `playerX`/`playerO`'yu
    // kontrol ediyordu — sekiz diğer token (ör. `--color-bg`) korumasızdı;
    // biri düşse bile bu iki test de yeşil kalır, sayfa beyaz render olurdu.
    // Not: apps/web/**'te literal hex YASAK (KK-084) — beklenti burada da
    // `@xox/ui-tokens`'tan okunur. Gerçek "elle yazılmış, tamamen bağımsız
    // hex" katmanı `packages/ui-tokens` (hex ban'dan MUAF) içindeki
    // `colors.test.ts`/`contrast.test.ts`'tedir; bu test onun ÜZERİNE,
    // üretilen dosyanın o kaynaktan SESSİZCE kaymadığını kilitler.
    const dir = dirname(fileURLToPath(import.meta.url))
    const onDisk = readFileSync(join(dir, 'globals.css'), 'utf8')

    for (const theme of Object.keys(themes) as Theme[]) {
      const vars = cssVariables(theme)
      const tokenCount = Object.keys(vars).length
      // Bağımsız listeye karşı: tek bir tema en az bu kadar token taşımalı —
      // `cssVariables`in kendisi boş bir nesne dönmeye başlarsa döngü hiç
      // iddia üretmez, bu satır o "sessizce hiçbir şey test etmeme" sınıfını
      // kapatır (gotchas.md "kendine-referanslı test silmeyi göremez").
      expect(tokenCount).toBeGreaterThanOrEqual(10)
      for (const [name, value] of Object.entries(vars)) {
        expect(onDisk).toContain(`${name}: ${value};`)
      }
    }

    expect(onDisk).toContain("[data-tema='acik']")
    expect(onDisk).toContain("[data-tema='koyu']")
    // acik ve koyu farklı değerler taşımalı — ikisinin de aynı bloğa
    // kopyalanması gibi bir kaymayı yakalar.
    expect(themes.acik).not.toStrictEqual(themes.koyu)
  })
})
