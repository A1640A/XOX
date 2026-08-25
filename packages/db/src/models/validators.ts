/**
 * Ortak Mongoose alan doğrulayıcıları — modeller arasında TEK doğruluk kaynağı.
 * `board`/`winLine`/`moves` gibi uzunluk kısıtları birden çok şemada
 * tekrarlanacaktı; kopyalanmış bir kısıt sessizce sapabilir (bkz. gotcha:
 * sabitin kopyası = sessiz sapma — aynı sınıf hata uzunluk kısıtları için de
 * geçerli).
 */

/** Değer tam olarak `length` eleman içermiyorsa reddeder (ör. tahta = 9 hücre). */
export function hasExactLength(length: number) {
  return (value: readonly unknown[]): boolean => value.length === length
}

/**
 * `null` geçer; değer varsa uzunluğu `min..max` (iki uç DAHİL) aralığında
 * olmalıdır (ör. winLine = 3..6 indeks).
 *
 * Eski `isNullOrExactLength(3)`'ün yerini alır: `WinLine` tipi `readonly
 * number[]`e genişledi (ADR-0011 §4) ve doğrulayıcı "tam 3" demeye devam
 * etseydi tutarsızlık ancak 6×6 İLK KEZ oynandığında, çalışma zamanında
 * patlardı. Şema üst sınırı odanın KENDİ `winLength`'i değildir — oda başına
 * gerçek sınırı kural motoru sağlar.
 */
export function isNullOrLengthBetween(min: number, max: number) {
  return (value: readonly unknown[] | null): boolean =>
    value === null || (value.length >= min && value.length <= max)
}

/** Değer `max` elemandan fazlaysa reddeder (ör. 3x3 tahtada en fazla 9 hamle). */
export function hasAtMostLength(max: number) {
  return (value: readonly unknown[]): boolean => value.length <= max
}
