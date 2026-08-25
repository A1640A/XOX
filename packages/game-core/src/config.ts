/**
 * Tahta konfigürasyonu — TEK KAYNAK (ADR-0010).
 *
 * `size` DAİMA kenar uzunluğudur, `cellCount(config)` DAİMA hücre sayısıdır.
 * Eski `BOARD_SIZE` adı repodan silindi: aynı ad üç dosyada iki farklı birimi
 * (9 hücre / 3 kenar) taşıyordu ve N sabitken hata üretmiyordu — N değişken
 * olunca karıştırma sessiz kalırdı.
 *
 * Katman yönü: config -> board -> status -> moves. Bu dosya hiçbir şey import
 * etmez, dolayısıyla zincirin başıdır.
 */

export interface BoardConfig {
  /** KENAR uzunluğu. 3 | 6 | 11. Tahta `size × size`dır. */
  readonly size: number
  /** Kazanmak için yan yana gereken taş sayısı (K). */
  readonly winLength: number
}

export interface BoardMode {
  readonly size: number
  readonly winLengths: readonly number[]
  readonly defaultWinLength: number
}

/**
 * ELLE YAZILMIŞ, DONMUŞ tablo — formülden TÜRETİLMEZ (ADR-0010 §2).
 *
 * Spec §2.2'nin dört sınırı (K ≥ 3 · N > 3'te K ≥ 4 · N > 3'te K ≤ N−1 · K ≤ 6)
 * bu tabloya GEREKÇEDİR, koda kural olarak yazılmaz. `winLengths`'i
 * `[4..min(6, size-1)]` diye türetseydik tablodan bir satır silindiğinde hiçbir
 * test kırılmazdı (gotcha örüntü 2); elle yazılmış tablo + elle yazılmış
 * beklenti = silmeyi gören iki katman.
 *
 * Donma gerekçesi `emptyBoard`/`winLines` ile aynı: uzun ömürlü bir sunucu
 * sürecinde tek bir yazma sonraki bütün oyunları bozar.
 */
export const BOARD_MODES: readonly BoardMode[] = Object.freeze([
  Object.freeze({ size: 3, winLengths: Object.freeze([3]), defaultWinLength: 3 }),
  Object.freeze({ size: 6, winLengths: Object.freeze([4, 5]), defaultWinLength: 4 }),
  Object.freeze({ size: 11, winLengths: Object.freeze([4, 5, 6]), defaultWinLength: 5 }),
])

export const DEFAULT_BOARD_CONFIG: BoardConfig = Object.freeze({ size: 3, winLength: 3 })

/** HÜCRE sayısı = size². Tek türetme noktası. */
export function cellCount(config: BoardConfig): number {
  return config.size * config.size
}

/** 0 tabanlı satır. Erişilebilirlik metinleri 1 ekler, bileşende değil `tr`'de. */
export function rowOf(index: number, config: BoardConfig): number {
  return Math.floor(index / config.size)
}

/** 0 tabanlı sütun. */
export function colOf(index: number, config: BoardConfig): number {
  return index % config.size
}

/**
 * Konfigürasyon `BOARD_MODES`'un izin verdiği altı kombinasyondan biri mi?
 *
 * Pakete özeldir (`index.ts` dışa aktarmaz): tek tüketicisi `emptyBoard` ve
 * `winLines`'ın önbellek kapısıdır. Uzun ömürlü bir Vercel instance'ında
 * hatalı bir çağrı sonsuz büyüyen bir önbellek üretmesin diye yalnız bu altı
 * kombinasyon saklanır (ADR-0012 §2).
 */
export function isKnownMode(config: BoardConfig): boolean {
  return BOARD_MODES.some(
    (mode) => mode.size === config.size && mode.winLengths.includes(config.winLength),
  )
}

export type BoardConfigRejection =
  | 'not-an-object'
  | 'size-not-integer'
  | 'unknown-size'
  | 'win-length-not-integer'
  | 'win-length-not-allowed'

export type BoardConfigParse =
  | { readonly ok: true; readonly config: BoardConfig }
  | { readonly ok: false; readonly reason: BoardConfigRejection }

function accept(config: BoardConfig): BoardConfigParse {
  return Object.freeze({ ok: true as const, config })
}

function reject(reason: BoardConfigRejection): BoardConfigParse {
  return Object.freeze({ ok: false as const, reason })
}

/** Tam sayı ise sayıyı, değilse `null` döner — daraltma tek noktada. */
function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/**
 * Tek doğrulama kapısı. İSTİSNA FIRLATMAZ (ADR-0010 §3): iki çağıran da
 * (HTTP route, `resolveBoardConfig`) hatayı veriye çevirmek zorunda.
 *
 * Boş girdi HATA DEĞİLDİR — `undefined`/`null`/`{}` `DEFAULT_BOARD_CONFIG`'e
 * düşer, böylece konfigürasyonu bilmeyen eski istemci kırılmaz (KK-B14/B15).
 * Kısmi girdi (`{size: 11}`) o boyutun `defaultWinLength`'ine düşer.
 */
export function parseBoardConfig(input: unknown): BoardConfigParse {
  if (input === undefined || input === null) return accept(DEFAULT_BOARD_CONFIG)
  if (typeof input !== 'object' || Array.isArray(input)) return reject('not-an-object')

  const record = input as { readonly size?: unknown; readonly winLength?: unknown }

  const rawSize = record.size
  const size = rawSize === undefined ? DEFAULT_BOARD_CONFIG.size : asInteger(rawSize)
  if (size === null) return reject('size-not-integer')

  const mode = BOARD_MODES.find((candidate) => candidate.size === size)
  if (mode === undefined) return reject('unknown-size')

  const rawWinLength = record.winLength
  if (rawWinLength === undefined) {
    return accept(Object.freeze({ size, winLength: mode.defaultWinLength }))
  }

  const winLength = asInteger(rawWinLength)
  if (winLength === null) return reject('win-length-not-integer')
  if (!mode.winLengths.includes(winLength)) return reject('win-length-not-allowed')

  return accept(Object.freeze({ size, winLength }))
}
