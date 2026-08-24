import { type ColorToken, type Theme, themes } from './colors'

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return [r, g, b]
}

function relativeLuminanceChannel(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return (
    0.2126 * relativeLuminanceChannel(r) +
    0.7152 * relativeLuminanceChannel(g) +
    0.0722 * relativeLuminanceChannel(b)
  )
}

/**
 * WCAG 2 kontrast oranı (1:1 - 21:1). Referans: w3.org/TR/WCAG21/#contrast-minimum.
 * Girdi sırası önemsizdir — daima açık/koyu ayrımı içeriden yapılır.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA)
  const luminanceB = relativeLuminance(hexB)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Bir temada verilen renk token'ının hem `bg` hem `surface` üzerindeki kontrastının
 * en az `minRatio` olup olmadığını doğrular. Varsayılan 4.5 — WCAG AA metin eşiği.
 */
export function meetsTextContrast(theme: Theme, token: ColorToken, minRatio = 4.5): boolean {
  const palette = themes[theme]
  const foreground = palette[token]
  return (
    contrastRatio(foreground, palette.bg) >= minRatio &&
    contrastRatio(foreground, palette.surface) >= minRatio
  )
}
