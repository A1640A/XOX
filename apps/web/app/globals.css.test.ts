import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { themes } from '@xox/ui-tokens'
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

  it('her iki temanın player renklerini @xox/ui-tokens themes ile birebir taşır', () => {
    // Not: apps/web/**'te literal hex YASAK (KK-084, kök eslint no-restricted-syntax) —
    // bu yüzden beklenti burada da `@xox/ui-tokens`'tan okunur. Gerçek "elle yazılmış,
    // tamamen bağımsız hex" katmanı `packages/ui-tokens` (hex ban'dan MUAF) içindeki
    // `colors.test.ts`/`contrast.test.ts`'tedir; bu test onun ÜZERİNE, üretilen dosyanın
    // o kaynaktan SESSİZCE kaymadığını (yanlış anahtar, yanlış tema eşleşmesi vb.) kilitler.
    const dir = dirname(fileURLToPath(import.meta.url))
    const onDisk = readFileSync(join(dir, 'globals.css'), 'utf8')

    expect(onDisk).toContain("[data-tema='acik']")
    expect(onDisk).toContain(`--color-player-x: ${themes.acik.playerX};`)
    expect(onDisk).toContain(`--color-player-o: ${themes.acik.playerO};`)
    expect(onDisk).toContain("[data-tema='koyu']")
    expect(onDisk).toContain(`--color-player-x: ${themes.koyu.playerX};`)
    expect(onDisk).toContain(`--color-player-o: ${themes.koyu.playerO};`)
    // acik ve koyu farklı değerler taşımalı — ikisinin de aynı bloğa
    // kopyalanması gibi bir kaymayı yakalar.
    expect(themes.acik.playerX).not.toBe(themes.koyu.playerX)
  })
})
