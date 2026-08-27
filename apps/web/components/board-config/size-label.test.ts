import { describe, expect, it } from 'vitest'
import { sizeLabel } from './size-label'

describe('sizeLabel', () => {
  it.each([
    [3, '3×3'],
    [6, '6×6'],
    [11, '11×11'],
  ])('boyut %i için "%s" döner', (size, beklenen) => {
    expect(sizeLabel(size)).toBe(beklenen)
  })

  it('bilinmeyen boyutta ÇÖKMEZ, sayısal bir geri dönüş üretir (savunmacı sınır)', () => {
    expect(sizeLabel(9)).toBe('9×9')
  })
})
