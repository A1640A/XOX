import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BOARD_MODES } from '@xox/game-core'
import { useBoardModes } from './use-board-modes'

/**
 * ROLLOUT-BOARD-001 · ADR-0018 §3 — "kapalı boyut istemcide hiç görünmez"
 * iddiasının SAF (DOM'suz) kanıtı. `BoardConfigPicker.test.tsx` (UI-CFG-001)
 * bunu render seviyesinde zaten kanıtlıyor; bu dosya aynı garantiyi türetme
 * fonksiyonunun kendisinde, bağımsız olarak kilitler.
 */
describe('use-board-modes', () => {
  it('tüm boyutlar açıkken BOARD_MODES ile BİREBİR aynı listeyi (aynı sırada) döner', () => {
    const { result } = renderHook(() => useBoardModes([3, 6, 11]))

    expect(result.current).toStrictEqual(BOARD_MODES)
  })

  it('yalnız 3 açıkken 6 ve 11 listede HİÇ görünmez', () => {
    const { result } = renderHook(() => useBoardModes([3]))

    expect(result.current.map((mode) => mode.size)).toStrictEqual([3])
  })

  it('kapalı bir boyut (11) listede tek başına yokken diğerleri (3, 6) korunur', () => {
    const { result } = renderHook(() => useBoardModes([3, 6]))

    expect(result.current.map((mode) => mode.size)).toStrictEqual([3, 6])
    expect(result.current.some((mode) => mode.size === 11)).toBe(false)
  })

  it('hiçbir boyut açık değilse (kill switch tamamen boş) BOŞ liste döner, ÇÖKMEZ', () => {
    const { result } = renderHook(() => useBoardModes([]))

    expect(result.current).toStrictEqual([])
  })

  it('BOARD_MODES dışı bir sayı (ör. 4) enabledSizes içinde olsa bile hiçbir moda karşılık gelmez', () => {
    const { result } = renderHook(() => useBoardModes([4]))

    expect(result.current).toStrictEqual([])
  })

  it('kural mantığını yeniden yazmaz: dönen her mod BOARD_MODES içindeki AYNI referanstır', () => {
    const { result } = renderHook(() => useBoardModes([3, 11]))

    for (const mode of result.current) {
      expect(BOARD_MODES).toContain(mode)
    }
  })
})
