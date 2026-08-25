import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsTextContrast } from './contrast'
import { type ColorToken, type Theme, themes } from './colors'

const ALL_THEMES = Object.keys(themes) as Theme[]
/**
 * Metin ya da metin büyüklüğünde vurgu olarak kullanılan token'lar — WCAG AA 4.5:1 ister.
 * `win` de burada: kazanan hattın rengi bu değeri seçmenin gerekçesiydi (bkz. UI-001 raporu,
 * eski `#16a34a` 3.13:1 ile eşiğin altındaydı) — reddedilen eski değer geri konursa bu test
 * kırmızı olmalı, `it.each` üzerinden garanti ediliyor.
 */
const TEXT_TOKENS: ColorToken[] = [
  'text',
  'textMuted',
  'accent',
  'playerX',
  'playerO',
  'danger',
  'win',
]

describe('contrastRatio', () => {
  it('aynı renk için oranı 1 döner', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('siyah/beyaz için maksimum oranı (21) döner', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('girdi sırası sonucu değiştirmez', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 10)
  })

  it('3 haneli kısaltmayı 6 haneli eşdeğeriyle özdeş işler', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(contrastRatio('#ffffff', '#000000'), 10)
  })

  it('geçersiz hex girdisinde SESSİZCE NaN dönmez, fırlatır', () => {
    expect(() => contrastRatio('mavi', '#000000')).toThrow(/geçersiz hex/i)
    expect(() => contrastRatio('#12345', '#000000')).toThrow(/geçersiz hex/i)
    expect(() => contrastRatio('#2563eb80', '#000000')).toThrow(/geçersiz hex/i)
  })
})

describe('meetsTextContrast — KK: metin/arka plan >= 4.5:1', () => {
  for (const theme of ALL_THEMES) {
    for (const token of TEXT_TOKENS) {
      it(`${theme}.${token}, hem bg hem surface üzerinde >= 4.5:1`, () => {
        expect(meetsTextContrast(theme, token)).toBe(true)
      })
    }
  }
})

/**
 * DESIGN-001a: `surfaceRaised` (Yön A hover/aktif zemini) eklendi — `border` bu yüzeyde de
 * görünür olmalı, yoksa hover durumundaki bir hücrenin kenarlığı kaybolabilir.
 */
const SURFACE_TOKENS: ColorToken[] = ['bg', 'surface', 'surfaceRaised']

describe('border — WCAG 1.4.11 anlamlı UI bileşeni eşiği (>= 3:1)', () => {
  for (const theme of ALL_THEMES) {
    it(`${theme}.border, bg/surface/surfaceRaised üzerinde >= 3:1 (tahta hücre sınırı + hover zemin görünür olmalı)`, () => {
      const palette = themes[theme]
      for (const surface of SURFACE_TOKENS) {
        expect(contrastRatio(palette.border, palette[surface])).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
