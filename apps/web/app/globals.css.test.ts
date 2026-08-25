import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  boardCssVariables,
  cssVariables,
  motionCssVariables,
  themes,
  type Theme,
} from '@xox/ui-tokens'
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
      // DESIGN-001a: surfaceRaised eklendi (10 -> 11 token).
      expect(tokenCount).toBeGreaterThanOrEqual(11)
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

  it('--xox- tahta/hareket sabitlerini @xox/ui-tokens ile birebir taşır (DESIGN-001a — grid-line/board-max/odak/kazanan/hareket)', () => {
    // Yukarıdaki testle AYNI mantık, renk yerine tahta+hareket sabitleri için: `onDisk`'i
    // GENERATE ÇIKTISIYLA değil, `@xox/ui-tokens`'ın KENDİ üreticileriyle karşılaştırır —
    // biri `globals.css`'i elle değiştirip bir `--xox-*` değerini kaydırırsa (ör.
    // `--xox-grid-line`i 1px yaparsa, ADR-0017 §2 ihlali) bu test kırmızı olur.
    const dir = dirname(fileURLToPath(import.meta.url))
    const onDisk = readFileSync(join(dir, 'globals.css'), 'utf8')

    const auxVars = { ...boardCssVariables(), ...motionCssVariables() }
    const auxVarCount = Object.keys(auxVars).length
    // Bağımsız listeye karşı: `boardCssVariables`/`motionCssVariables` sessizce boş nesne
    // dönmeye başlarsa bu döngü hiç iddia üretmez — bu satır o sınıfı kapatır.
    expect(auxVarCount).toBeGreaterThanOrEqual(11)
    for (const [name, value] of Object.entries(auxVars)) {
      expect(onDisk).toContain(`${name}: ${value};`)
    }

    // ADR-0017 §2 — gerçek değeri de burada, kaynaktan bağımsız bir sabitle kilitle:
    // `boardCssVariables` bir gün yanlışlıkla 2'den başka bir değer dönerse (ör. boyuta
    // göre dallanan bir "ikinci gap" eklenirse) yukarıdaki döngü onu da onDisk'te bulur
    // ve testi YEŞİL tutar — bu satır o senaryoyu YAKALAR.
    expect(auxVars['--xox-grid-line']).toBe('2px')
  })
})
