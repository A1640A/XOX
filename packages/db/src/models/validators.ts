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

/** `null` geçer; değer varsa tam olarak `length` eleman içermelidir (ör. winLine). */
export function isNullOrExactLength(length: number) {
  return (value: readonly unknown[] | null): boolean => value === null || value.length === length
}

/** Değer `max` elemandan fazlaysa reddeder (ör. 3x3 tahtada en fazla 9 hamle). */
export function hasAtMostLength(max: number) {
  return (value: readonly unknown[]): boolean => value.length <= max
}
