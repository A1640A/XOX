import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsTextContrast } from './contrast'
import { type ColorToken, type Theme, themes } from './colors'

const ALL_THEMES = Object.keys(themes) as Theme[]
/** Metin ya da metin büyüklüğünde vurgu olarak kullanılan token'lar — WCAG AA 4.5:1 ister. */
const TEXT_TOKENS: ColorToken[] = ['text', 'textMuted', 'accent', 'playerX', 'playerO', 'danger']

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

describe('win token — grafik/vurgu için WCAG 1.4.11 eşiği (>= 3:1)', () => {
  for (const theme of ALL_THEMES) {
    it(`${theme}.win, bg ve surface üzerinde >= 3:1`, () => {
      const palette = themes[theme]
      expect(contrastRatio(palette.win, palette.bg)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(palette.win, palette.surface)).toBeGreaterThanOrEqual(3)
    })
  }
})
