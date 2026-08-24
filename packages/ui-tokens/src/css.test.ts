import { describe, expect, it } from 'vitest'
import { cssVariables, cssVariableTokenNames, nativeColors, themeCss, themeCssBlock } from './css'
import { type Theme, themes } from './colors'

const ALL_THEMES = Object.keys(themes) as Theme[]

describe('cssVariables', () => {
  it.each(ALL_THEMES)('%s için --color- önekli CSS custom property üretir', (theme) => {
    const vars = cssVariables(theme)
    expect(Object.keys(vars).length).toBeGreaterThan(0)
    for (const name of Object.keys(vars)) {
      expect(name.startsWith('--color-')).toBe(true)
    }
  })

  it.each(ALL_THEMES)('%s teması için değerler themes kaynağıyla birebir aynıdır', (theme) => {
    const vars = cssVariables(theme)
    expect(vars['--color-bg']).toBe(themes[theme].bg)
    expect(vars['--color-text-muted']).toBe(themes[theme].textMuted)
    expect(vars['--color-player-x']).toBe(themes[theme].playerX)
    expect(vars['--color-player-o']).toBe(themes[theme].playerO)
  })
})

describe('nativeColors', () => {
  it.each(ALL_THEMES)('%s için aynı kaynaktan düz bir RN renk nesnesi üretir', (theme) => {
    expect(nativeColors(theme)).toStrictEqual(themes[theme])
  })
})

describe('web (cssVariables) ve mobil (nativeColors) anahtar paritesi', () => {
  it.each(ALL_THEMES)('%s: iki çıktının token anahtarları eşittir, kayma yok', (theme) => {
    const cssTokenNames = cssVariableTokenNames(theme).sort()
    const nativeTokenNames = Object.keys(nativeColors(theme)).sort()
    expect(cssTokenNames).toStrictEqual(nativeTokenNames)
  })
})

describe('themeCssBlock', () => {
  it("acik teması için [data-tema='acik'] seçicisi üretir", () => {
    const block = themeCssBlock('acik')
    expect(block).toContain("[data-tema='acik'] {")
    expect(block).toContain(`--color-bg: ${themes.acik.bg};`)
    expect(block.endsWith('}')).toBe(true)
  })

  it("koyu teması için [data-tema='koyu'] seçicisi üretir", () => {
    const block = themeCssBlock('koyu')
    expect(block).toContain("[data-tema='koyu'] {")
    expect(block).toContain(`--color-bg: ${themes.koyu.bg};`)
    expect(block.endsWith('}')).toBe(true)
  })

  it('iki temanın blokları farklı seçici ve farklı değerler içerir', () => {
    expect(themeCssBlock('acik')).not.toBe(themeCssBlock('koyu'))
  })
})

describe('themeCss', () => {
  it('her iki tema seçicisini de tek bir çıktıda birleştirir', () => {
    const css = themeCss()
    expect(css).toContain("[data-tema='acik']")
    expect(css).toContain("[data-tema='koyu']")
  })
})
