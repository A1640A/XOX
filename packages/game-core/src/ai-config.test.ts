import { describe, expect, it } from 'vitest'
import {
  AI_BUDGET_MS,
  AI_NODE_BUDGET,
  CANDIDATE_RADIUS,
  DEFENSE_BIAS,
  MAX_SEARCH_DEPTH,
  NODE_CHECK_INTERVAL,
  TERMINAL_SCORE,
  WINDOW_WEIGHT,
  weightOf,
} from './ai-config'
import { BOARD_MODES } from './config'
import { winLines } from './status'

describe('ai-config — AI-SPIKE-001 ölçümleri', () => {
  /**
   * ÇIPLAK beklenti: sayılar `AI-SPIKE-001`in ölçüm raporundan gelir, koddan
   * TÜRETİLMEZ (gotcha örüntü 2). Biri değişirse ölçüm yenilenmiş olmalıdır.
   */
  it('ölçülmüş sabitler AI-SPIKE-001 raporundaki değerlerdir', () => {
    expect({
      CANDIDATE_RADIUS,
      MAX_SEARCH_DEPTH,
      AI_NODE_BUDGET,
      AI_BUDGET_MS,
      NODE_CHECK_INTERVAL,
    }).toEqual({
      CANDIDATE_RADIUS: 2,
      MAX_SEARCH_DEPTH: 6,
      AI_NODE_BUDGET: 30_000,
      AI_BUDGET_MS: 1000,
      NODE_CHECK_INTERVAL: 1024,
    })
  })

  it('WINDOW_WEIGHT elle yazılmış, donmuş ve uzunluğu en büyük K + 1', () => {
    expect(WINDOW_WEIGHT).toEqual([0, 1, 8, 40, 200, 1000, 5000])

    // Uzunluk BOARD_MODES'tan TÜRETİLİR: yeni bir K eklenirse tablo da büyümek
    // zorunda kalsın (ADR-0013 §5 — yeni K yeni örüntü sınıfı doğurmaz).
    const maxWinLength = Math.max(...BOARD_MODES.flatMap((mode) => [...mode.winLengths]))
    expect(WINDOW_WEIGHT).toHaveLength(maxWinLength + 1)

    expect(Object.isFrozen(WINDOW_WEIGHT)).toBe(true)
    expect(() => {
      ;(WINDOW_WEIGHT as number[])[0] = 99
    }).toThrow(TypeError)
  })

  it('WINDOW_WEIGHT kesin artar — bir taş daha koymak DAİMA iyileşmedir', () => {
    for (let count = 1; count < WINDOW_WEIGHT.length; count += 1) {
      expect(weightOf(count)).toBeGreaterThan(weightOf(count - 1))
    }
    expect(weightOf(0)).toBe(0)
  })

  it('DEFENSE_BIAS 1den büyüktür — aynı şekilde savunma saldırıya tercih edilir', () => {
    expect(DEFENSE_BIAS).toBe(1.1)
    expect(DEFENSE_BIAS).toBeGreaterThan(1)
  })

  /**
   * KK-B48 (b) — `searchMove` değişmezi:
   *   TERMINAL_SCORE − MAX_SEARCH_DEPTH > MAX_HEURISTIC
   *
   * MAX_HEURISTIC ELLE YAZILMAZ, tablodan ve maksimum pencere sayısından
   * TÜRETİLİR: bir pozisyonun alabileceği en uç sezgisel puan, o
   * konfigürasyondaki BÜTÜN K-pencerelerinin en yüksek ağırlığı alması
   * (savunma tarafı için ayrıca `DEFENSE_BIAS` ile ölçeklenmesi) hâlidir.
   *
   * Derinlik sınırı tek başına yetmez: sezgisel değerlendirme geldiği için
   * sınır artık yalnız derinlik değil, DEĞERLENDİRMENİN TAVANIDIR. En geç
   * kazanç (TERMINAL_SCORE − MAX_SEARCH_DEPTH) bile mümkün olan en iyi
   * sezgisel pozisyondan yüksek puan almalıdır; almazsa AI zorla kazanmak
   * yerine "gelecek vaat eden" bir hamleyi seçer.
   */
  it('KK-B48: TERMINAL_SCORE − MAX_SEARCH_DEPTH > MAX_HEURISTIC', () => {
    const maxHeuristic = Math.max(
      ...BOARD_MODES.flatMap((mode) =>
        mode.winLengths.map((winLength) => {
          const windows = winLines({ size: mode.size, winLength }).length
          return windows * weightOf(winLength) * DEFENSE_BIAS
        }),
      ),
    )

    // Ölçülen tavan: 11×11 K6 → 204 pencere × 5000 × 1.1
    expect(maxHeuristic).toBeCloseTo(1_122_000, 6)
    expect(TERMINAL_SCORE - MAX_SEARCH_DEPTH).toBeGreaterThan(maxHeuristic)
  })
})
