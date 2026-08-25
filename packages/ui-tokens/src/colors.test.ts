import { describe, expect, it } from 'vitest'
import { themes } from './colors'

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

  it("surfaceRaised, surface ve bg'den farklı bir değerdir (DESIGN-001a hover/aktif zemini, kopyala-yapıştır kayması yok)", () => {
    for (const palette of Object.values(themes)) {
      expect(palette.surfaceRaised).not.toBe(palette.surface)
      expect(palette.surfaceRaised).not.toBe(palette.bg)
    }
  })
})

// `colors.light`/`colors.dark` (geriye dönük takma ad) burada kasıtlı olarak test EDİLMİYOR:
// gövdesi `{ light: themes.acik, dark: themes.koyu }` — kendisiyle karşılaştıran bir test
// tanım gereği asla kırılamaz (reviewer bulgusu, bkz. docs/board/reports/UI-001.md). Modül
// yüklendiğinde nesne literali zaten çalıştığı için satır kapsamı bundan etkilenmiyor.
