import { describe, expect, it } from 'vitest'
import { ELO_FLOOR, ELO_K } from '@xox/shared'
import { eloDelta } from './elo'

describe('eloDelta — SAF fonksiyon (KK-110/111)', () => {
  it('çıplak sayı: eşit puanlı iki oyuncuda GALİP +12 alır (K=24, beklenen=0.5)', () => {
    // round(1200 + 24 × (1 - 0.5)) - 1200 = round(1212) - 1200 = 12
    expect(eloDelta(1200, 1200, 1)).toBe(12)
  })

  it('çıplak sayı: eşit puanlı iki oyuncuda MAĞLUP -12 alır', () => {
    expect(eloDelta(1200, 1200, 0)).toBe(-12)
  })

  it('KK-111: eşit puanlı BERABERLİKTE delta TAM 0 — sabitten türetilmez', () => {
    expect(eloDelta(1200, 1200, 0.5)).toBe(0)
    // Farklı bir taban puanda da aynı: nötr sonuç nötr delta üretir.
    expect(eloDelta(1800, 1800, 0.5)).toBe(0)
  })

  it('güçlü favori kazanınca KÜÇÜK kazanır (ra=1400, rb=1000, K ve fark sıfır DEĞİL)', () => {
    // beklenen = 1/(1+10^(-400/400)) = 1/1.1 ≈ 0.90909
    // round(1400 + 24×(1-0.90909)) - 1400 = round(1402.1818) - 1400 = 2
    expect(eloDelta(1400, 1000, 1)).toBe(2)
  })

  it('zayıf taraf (1000) favoriyi (1400) yenince BÜYÜK kazanır', () => {
    // beklenen = 1/(1+10^(400/400)) = 1/11 ≈ 0.090909
    // round(1000 + 24×(1-0.090909)) - 1000 = round(1021.818) - 1000 = 22
    expect(eloDelta(1000, 1400, 1)).toBe(22)
  })

  it('kazananın ve kaybedenin deltası SIFIR TOPLAMA yakın (taban kırpması olmadığında)', () => {
    // Aynı maçın iki tarafı, HER BİRİ KENDİ bakış açısından hesaplanır:
    // favori (1400) kazanınca az kazanır (+2), aynı favori kaybedince de
    // KENDİ beklentisinden dolayı az kaybeder (-2) — asimetrik büyüklük
    // yalnız "kim kazandı" değişkeninde, rol değişse iki taraf da ~2 alır.
    const favoriteWins = eloDelta(1400, 1000, 1)
    const favoriteLoses = eloDelta(1400, 1000, 0)
    expect(favoriteWins).toBe(2)
    expect(favoriteLoses).toBe(-22)
  })

  it('KK-110 SINIR TESTİ: puan ELO_FLOOR (100) altına İNMEZ — ham hesap -24 olsa bile', () => {
    // ra=110 çok düşük, rb=-1000 karşısında beklenen ≈ 0.998 (ra kesin favori).
    // Kaybedince ham değişim ≈ 24×(0-0.998) ≈ -23.96, yani ham yeni puan
    // ≈ 86.04 (110-23.96) — FLOOR olmasaydı delta ≈ -24 olurdu.
    // Taban devreye girip yeni puanı 100'e SABİTLER: delta = 100 - 110 = -10.
    const delta = eloDelta(110, -1000, 0)
    expect(delta).toBe(-10)
    expect(110 + delta).toBe(ELO_FLOOR)
    // Taban olmasaydı delta -24'e yakın olurdu — kırpmanın GERÇEKTEN
    // devrede olduğunu göstermek için ham değerden belirgin şekilde farklı.
    expect(delta).not.toBe(-24)
  })

  it('zaten taban puandaki oyuncu daha da kaybedince delta yine 0 (taban altına inmez)', () => {
    expect(eloDelta(ELO_FLOOR, 2000, 0)).toBe(0)
  })

  it('SAFLIK: aynı üç girdi HER ZAMAN aynı çıktıyı verir (Date.now()/rastgelelik yok)', () => {
    const calls = Array.from({ length: 5 }, () => eloDelta(1250, 1180, 1))
    expect(new Set(calls).size).toBe(1)
  })

  it('ELO_K değişse davranış aynı formülü izler — sabitten türetilmiş ikinci kanıt', () => {
    const expected = 1 / (1 + 10 ** ((1300 - 1250) / 400))
    const raw = Math.round(1250 + ELO_K * (1 - expected)) - 1250
    expect(eloDelta(1250, 1300, 1)).toBe(raw)
  })
})
