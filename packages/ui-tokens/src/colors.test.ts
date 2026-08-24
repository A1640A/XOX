import { describe, expect, it } from 'vitest'
import { colors, themes } from './colors'

const HEX_COLOR = /^#[0-9a-f]{6}$/

describe('themes', () => {
  it('acik ve koyu birebir aynı anahtar kümesine sahiptir', () => {
    expect(Object.keys(themes.acik).sort()).toStrictEqual(Object.keys(themes.koyu).sort())
  })

  it('her token geçerli bir 6 haneli hex renk değeridir', () => {
    for (const palette of Object.values(themes)) {
      for (const value of Object.values(palette)) {
        expect(value).toMatch(HEX_COLOR)
      }
    }
  })

  it('acik ve koyu farklı değerler üretir (kopyala-yapıştır kayması yok)', () => {
    expect(themes.acik).not.toStrictEqual(themes.koyu)
  })
})

describe('colors (geriye dönük takma ad)', () => {
  it('light/dark, themes.acik/koyu ile birebir aynıdır — tek kaynak korunuyor', () => {
    expect(colors.light).toStrictEqual(themes.acik)
    expect(colors.dark).toStrictEqual(themes.koyu)
  })
})
