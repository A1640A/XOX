import { describe, expect, it } from 'vitest'
import { boardConfigSummaryText } from './summary-text'

/**
 * Beklenen metin ELLE yazıldı — `tr.boardConfig.summary`den TÜRETİLMEDİ
 * (conventions.md "iki katmanlı test" kuralı): şablon değişse/silinse bu
 * test kırmızı olmalı.
 */
describe('boardConfigSummaryText', () => {
  it('3×3 için "3×3 tahta · 3 taş yan yana" üretir', () => {
    expect(boardConfigSummaryText({ size: 3, winLength: 3 })).toBe('3×3 tahta · 3 taş yan yana')
  })

  it('6×6/4 için "6×6 tahta · 4 taş yan yana" üretir', () => {
    expect(boardConfigSummaryText({ size: 6, winLength: 4 })).toBe('6×6 tahta · 4 taş yan yana')
  })

  it('11×11/5 için "11×11 tahta · 5 taş yan yana" üretir', () => {
    expect(boardConfigSummaryText({ size: 11, winLength: 5 })).toBe('11×11 tahta · 5 taş yan yana')
  })

  it('eski (size/winLength taşımayan) odanın çözülmüş hâli {3,3} olarak görünür, "undefined" sızmaz', () => {
    const metin = boardConfigSummaryText({ size: 3, winLength: 3 })
    expect(metin).not.toContain('undefined')
    expect(metin).toBe('3×3 tahta · 3 taş yan yana')
  })
})
