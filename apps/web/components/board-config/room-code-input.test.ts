import { describe, expect, it } from 'vitest'
import { normalizeRoomCodeInput } from './room-code-input'

describe('normalizeRoomCodeInput', () => {
  it('küçük harfi büyütür, baştaki/sondaki boşluğu yutar', () => {
    expect(normalizeRoomCodeInput(' abc234 ')).toBe('ABC234')
  })

  it('ROOM_CODE_ALPHABET dışı karakterleri (I, O, 0, 1) yutar', () => {
    expect(normalizeRoomCodeInput('IO01')).toBe('')
  })

  it('6 karakterden fazlasını SÜZÜLMÜŞ metin üzerinde keser (W1-05 sıra düzeltmesi)', () => {
    // Ham: 12 karakter, alfabe dışı (I,O,1,0) YUTULDUKTAN sonra 'ABC2D3E4'
    // kalır (8), SONRA 6'ya kırpılır → 'ABC2D3'. Sıra [süz → kırp]dır.
    expect(normalizeRoomCodeInput('IAO1B0C2D3E4')).toBe('ABC2D3')
  })

  it('boşlukla başlayan girdide sondaki karakter KAYBOLMAZ (W1-05 regresyonu)', () => {
    expect(normalizeRoomCodeInput(' abc234 ')).toBe('ABC234')
  })
})
