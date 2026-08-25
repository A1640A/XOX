import { describe, expect, it } from 'vitest'
import { board, boardCssVariables } from './board'

describe('board — ADR-0017 kilitleri', () => {
  it('gridLine tek sabit 2px değeridir (ADR-0017 §2 — boyuta göre ikinci değer YOK)', () => {
    expect(board.gridLine).toBe(2)
  })

  it('winningOutlineWidth >= 3px (ADR-0017 §8c, WCAG 1.4.1 renkten bağımsız sinyal)', () => {
    expect(board.winningOutlineWidth).toBeGreaterThanOrEqual(3)
  })

  it('fadedOpacity, kazanan olmayan hücrede >= %40 opaklık düşüşü sağlar (ADR-0017 §8b)', () => {
    expect(1 - board.fadedOpacity).toBeGreaterThanOrEqual(0.4)
  })

  it('markStrokeX, markStrokeO değerinden kalındır (renk körlüğünde de ayırt edilebilirlik — yalnız renge güvenilmez)', () => {
    expect(board.markStrokeX).toBeGreaterThan(board.markStrokeO)
  })

  it('hiçbir token için alt sınır (min hücre boyutu) TANIMLANMAZ — CSS taşmasının tek önleyicisi budur', () => {
    expect(Object.keys(board)).not.toContain('minCellSize')
    expect(Object.keys(board)).not.toContain('cellSize')
  })
})

describe('boardCssVariables', () => {
  it('tüm anahtarlar --xox- önekli CSS custom property adlarıdır', () => {
    const vars = boardCssVariables()
    expect(Object.keys(vars).length).toBe(Object.keys(board).length)
    for (const name of Object.keys(vars)) {
      expect(name.startsWith('--xox-')).toBe(true)
    }
  })

  it('bilinen isimlerle beklenen birimde değer üretir', () => {
    const vars = boardCssVariables()
    expect(vars['--xox-grid-line']).toBe('2px')
    expect(vars['--xox-board-max']).toBe('480px')
    expect(vars['--xox-focus-ring-width']).toBe('2px')
    expect(vars['--xox-focus-ring-offset']).toBe('2px')
    expect(vars['--xox-winning-outline-width']).toBe('3px')
    expect(vars['--xox-mark-stroke-x']).toBe('3px')
    expect(vars['--xox-mark-stroke-o']).toBe('2px')
  })

  it('fadedOpacity SONEKSİZ (birimsiz CSS opacity değeri) aktarılır', () => {
    const vars = boardCssVariables()
    expect(vars['--xox-faded-opacity']).toBe('0.55')
  })
})
