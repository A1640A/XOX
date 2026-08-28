import { ELO_FLOOR, ELO_K } from '@xox/shared'

/** Bir oyunun sonucu — kazanma/kaybetme/beraberlik, ELO formülünün "skor"u. */
export type EloOutcome = 1 | 0.5 | 0

/**
 * ELO puan değişimi — SAF fonksiyon (KK-110). `Date.now()` YOK, rastgelelik
 * YOK: aynı üçlü girdi her zaman aynı çıktıyı verir. `finishGame` bu
 * fonksiyonu HER iki taraf için ayrı ayrı, kendi bakış açısından çağırır
 * (`eloDelta(ra, rb, sonuçA)` ve `eloDelta(rb, ra, sonuçB)`), formülün
 * kendisi simetriktir.
 *
 * Beklenen skor: `1 / (1 + 10^((rb-ra)/400))` (standart ELO beklentisi).
 * Yeni puan: `round(ra + ELO_K × (sonuç - beklenen))`, `ELO_FLOOR`in ALTINA
 * İNMEZ (KK-110 sınır testi). Dönen değer YENİ puan değil, DELTA'dır — çağıran
 * `ra + delta` yazar; taban kırpması yüzünden `delta`, ham `ELO_K ×
 * (sonuç-beklenen)`den daha küçük (mutlak değerce) olabilir.
 */
export function eloDelta(ra: number, rb: number, result: EloOutcome): number {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400))
  const rawNewRating = Math.round(ra + ELO_K * (result - expected))
  const flooredNewRating = Math.max(rawNewRating, ELO_FLOOR)
  return flooredNewRating - ra
}
