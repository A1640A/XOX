import { describe, expect, it } from 'vitest'
import { AI_NODE_BUDGET } from './ai-config'
import { LARGE_CONFIGS, measureCorpus } from './corpus.fixture'

/**
 * KK-B68 [BİRİM] — 11×11 K4.
 *
 * Beş kombinasyonun her biri AYRI DOSYADADIR: Vitest test dosyalarını ayrı
 * işçilerde PARALEL koşar, tek dosyada toplansalardı sıralı koşup süreyi
 * beşe katlarlardı. Ölçüm MAKSİMUMDUR, ortalama değil (ADR-0013 §8).
 */
describe('KK-B68 [BİRİM] — 11×11 K4 korpusu', () => {
  it('200+ pozisyonun TAMAMINDA AI_NODE_BUDGET içinde geçerli hamle döner', () => {
    const measurement = measureCorpus(LARGE_CONFIGS.elevenFour)

    expect(measurement.positions).toBeGreaterThanOrEqual(200)
    expect(measurement.illegal).toBe(0)
    expect(measurement.maxNodes).toBeLessThanOrEqual(AI_NODE_BUDGET)
    // Bütçe GERÇEKTEN bağlayıcı: korpusun en pahalı pozisyonu tavana dayanır.
    // Dayanmasaydı bu kapı hiçbir şey ölçmüyor olurdu.
    expect(measurement.maxNodes).toBe(AI_NODE_BUDGET)
  }, 300_000)
})
