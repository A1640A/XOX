import { describe, expect, it } from 'vitest'
import { cssVariables, cssVariableTokenNames, nativeColors, themeCss, themeCssBlock } from './css'
import { type ColorToken, type Theme, themes } from './colors'

const ALL_THEMES = Object.keys(themes) as Theme[]

/**
 * `ColorToken` birleşiminin TAMAMINI, FAZLASIZ listeler. `Record<ColorToken, true>` tipine
 * atanan bir nesne literali hem eksik hem fazla anahtarda DERLEME HATASI verir (TS'in fazla
 * özellik denetimi) — yani bu liste `themes`'ten bağımsız, derleme zamanında kilitli bir
 * referans noktasıdır. Aşağıdaki testler `cssVariables`/`nativeColors` çıktısını BİRBİRİYLE
 * değil, bu bağımsız listeyle karşılaştırır; `nativeColors(theme) === themes[theme]` gibi bir
 * özdeşlik iddiası hiçbir gerçek riski sınamaz (tanım gereği asla kırılamaz).
 */
const EXPECTED_COLOR_TOKENS_RECORD: Record<ColorToken, true> = {
  bg: true,
  surface: true,
  border: true,
  text: true,
  textMuted: true,
  accent: true,
  playerX: true,
  playerO: true,
  win: true,
  danger: true,
}
const EXPECTED_COLOR_TOKENS = Object.keys(EXPECTED_COLOR_TOKENS_RECORD).sort()

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

  it.each(ALL_THEMES)(
    '%s: anahtar kümesi ColorToken birleşiminin TAMAMINI kapsar (bağımsız listeye karşı)',
    (theme) => {
      expect(cssVariableTokenNames(theme).sort()).toStrictEqual(EXPECTED_COLOR_TOKENS)
    },
  )
})

describe('nativeColors', () => {
  it.each(ALL_THEMES)('%s için aynı kaynaktan düz bir RN renk nesnesi üretir', (theme) => {
    const colors = nativeColors(theme)
    expect(colors.bg).toBe(themes[theme].bg)
    expect(colors.playerO).toBe(themes[theme].playerO)
  })

  it.each(ALL_THEMES)(
    '%s: anahtar kümesi ColorToken birleşiminin TAMAMINI kapsar (bağımsız listeye karşı)',
    (theme) => {
      expect(Object.keys(nativeColors(theme)).sort()).toStrictEqual(EXPECTED_COLOR_TOKENS)
    },
  )
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
