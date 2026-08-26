import { describe, expect, it } from 'vitest'
import { motion, motionCssVariables } from './motion'

const MAX_ANIMATION_MS = 200

describe('motion — DEĞİŞMEZ: hiçbir süre 200ms geçmez', () => {
  it('moveDurationMs <= 200ms', () => {
    expect(motion.moveDurationMs).toBeLessThanOrEqual(MAX_ANIMATION_MS)
  })

  it('winDurationMs <= 200ms', () => {
    expect(motion.winDurationMs).toBeLessThanOrEqual(MAX_ANIMATION_MS)
  })

  it('easeOut geçerli bir CSS cubic-bezier ifadesidir (zıplama/geri tepme eğrisi DEĞİL — Yön B dili)', () => {
    expect(motion.easeOut).toMatch(/^cubic-bezier\(/)
  })
})

describe('motionCssVariables', () => {
  it('süreleri ms soneki ile, easeOut değerini soneksiz aktarır', () => {
    const vars = motionCssVariables()
    expect(vars['--xox-move-duration']).toBe('150ms')
    expect(vars['--xox-win-duration']).toBe('200ms')
    expect(vars['--xox-ease-out']).toBe(motion.easeOut)
  })

  it('tüm anahtarlar --xox- önekli CSS custom property adlarıdır', () => {
    const vars = motionCssVariables()
    for (const name of Object.keys(vars)) {
      expect(name.startsWith('--xox-')).toBe(true)
    }
  })
})
