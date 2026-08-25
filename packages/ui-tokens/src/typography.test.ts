import { describe, expect, it } from 'vitest'
import { fontFamily, fontSize, fontWeight, lineHeight } from './typography'

describe('fontFamily — DESIGN-001a Yön A yığınları', () => {
  it('her token virgülle ayrılmış bir yedek (fallback) yığını içerir', () => {
    for (const value of Object.values(fontFamily)) {
      expect(value).toContain(',')
    }
  })

  it('serif, sans ve mono birbirinden farklı yığınlardır', () => {
    expect(new Set(Object.values(fontFamily)).size).toBe(Object.values(fontFamily).length)
  })
})

describe('lineHeight', () => {
  it('base (gövde metni) tight (başlık) değerinden büyüktür — okunabilirlik önceliği', () => {
    expect(lineHeight.base).toBeGreaterThan(lineHeight.tight)
  })
})

describe('geriye dönük uyum — fontSize/fontWeight ölçeği değişmedi', () => {
  it('fontSize ölçeği aynı 6 basamağı korur', () => {
    expect(Object.keys(fontSize).sort()).toStrictEqual(
      ['base', 'display', 'lg', 'sm', 'xl', 'xs'].sort(),
    )
  })

  it('fontWeight ölçeği aynı 4 basamağı korur', () => {
    expect(Object.keys(fontWeight).sort()).toStrictEqual(
      ['bold', 'medium', 'regular', 'semibold'].sort(),
    )
  })
})
