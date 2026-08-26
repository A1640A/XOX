import { DEFAULT_BOARD_CONFIG, cellCount, isKnownMode } from './config'
import type { BoardConfig } from './config'
import type { Board, Cell, Player } from './types'

/**
 * Boş tahtalar modül düzeyinde tek örnektir; bu yüzden dondurulur. `readonly`
 * yalnız derleme zamanında korur: uzun ömürlü bir sunucu sürecinde tek bir
 * `emptyBoard()[0] = 'X'` yazması bundan sonraki bütün oyunları bozardı.
 *
 * Önbellek YALNIZ `BOARD_MODES`'taki altı kombinasyonu tutar (ADR-0012 §2):
 * hatalı bir çağrı uzun ömürlü bir instance'ta sonsuz büyüyen bir önbellek
 * üretmesin.
 */
const emptyBoardCache = new Map<string, Board>()

function cacheKey(config: BoardConfig): string {
  return `${String(config.size)}x${String(config.winLength)}`
}

export function emptyBoard(config: BoardConfig = DEFAULT_BOARD_CONFIG): Board {
  const key = cacheKey(config)
  const cached = emptyBoardCache.get(key)
  if (cached !== undefined) return cached

  const board = Object.freeze(Array.from({ length: cellCount(config) }, () => null)) as Board
  if (isKnownMode(config)) emptyBoardCache.set(key, board)
  return board
}

/**
 * TOTAL hücre okuması (ADR-0011 §3): aralık dışı indeks BOŞ hücre verir,
 * `undefined` vermez.
 *
 * Bu tek satır, eski `as Cell` cast'inin gizlediği en tehlikeli sınıfı kapatır:
 * yanlış konfigürasyonla taranan bir tahtada `undefined === undefined`
 * karşılaştırması HAYALET GALİBİYET üretebilirdi. `?? null` ile aralık dışı
 * okuma boş hücre olur ve hiçbir hat tamamlanmaz.
 *
 * Pakete özeldir, `index.ts` dışa aktarmaz: `game-core` dışında `Board`'u
 * indeksleyen tek bir üretim satırı yok (ADR-0011 D1), yüzey gereksiz büyümez.
 */
export function cellAt(board: Board, index: number): Cell {
  return board[index] ?? null
}

/**
 * Dışarıdan gelen diziyi tahtaya çevirir; `Board`'a giden tek yol budur.
 *
 * Hem uzunluk (KONFİGÜRASYONA göre) hem de her hücrenin değeri doğrulanır:
 * kalıcı katmandaki şema hücreleri yalnız `String` olarak tanımlar, dolayısıyla
 * `undefined` ya da `'a'` gibi bir değer buraya kadar gelebilir. Doğrulanmazsa
 * `evaluateStatus` `undefined` hücreleri kazanan hat sanar ve `Player` tipli bir
 * alana `'a'` yazılır. Uzunluk doğrulaması E-18'in ("`size:11` ama tahta 9
 * hücre") tek mekanik savunmasıdır.
 */
export function boardFromCells(
  cells: readonly Cell[],
  config: BoardConfig = DEFAULT_BOARD_CONFIG,
): Board {
  const expected = cellCount(config)
  if (cells.length !== expected) {
    throw new RangeError(`Tahta ${String(expected)} hücre olmalı, ${String(cells.length)} geldi`)
  }
  for (let index = 0; index < expected; index += 1) {
    const cell = cells[index]
    if (cell !== null && cell !== 'X' && cell !== 'O') {
      throw new RangeError(
        `Tahta hücresi ${String(index)} geçersiz: ${String(cell)} — yalnız 'X', 'O' veya null olabilir`,
      )
    }
  }
  return cells as Board
}

/**
 * `boardFromCells`'in tersini yapar: tahtayı hata ayıklama çıktısı ve testler
 * için tek satır metne çevirir. Her hücre `X`, `O` ya da boşsa `.` olur —
 * `emptyBoard()` için sonuç dokuz nokta içeren bir dizedir.
 *
 * Round-trip sözleşmesi: bu çıktı `Array.from` ile karakterlere bölünüp
 * `boardFromCells`'e geri verildiğinde aynı tahtayı üretir. Biçim 121 hücrede
 * okunaksızdır ama BİLEREK değiştirilmedi (tasarım §12.4).
 */
export function boardToString(board: Board): string {
  const chars: string[] = []
  for (const cell of board) {
    chars.push(cell ?? '.')
  }
  return chars.join('')
}

export function availableMoves(board: Board): number[] {
  const moves: number[] = []
  for (let i = 0; i < board.length; i += 1) {
    if (cellAt(board, i) === null) moves.push(i)
  }
  return moves
}

/**
 * Sırası gelen oyuncuyu taş paritesinden türetir: X başlar, oyuncular sırayla
 * oynar; taş sayısı çiftse sıra X'te, tekse O'dadır.
 *
 * Sözleşme yalnızca kurallı oyunla üretilebilen tahtalar için anlamlıdır
 * (X sayısı O sayısına eşit ya da bir fazla). Beş X ve dört boş hücreden oluşan
 * gibi hiçbir oyunda oluşamayacak bir tahtada da kendinden emin bir cevap
 * ('O') döner: girdinin geçerliliğini doğrulamak çağıranın işidir.
 *
 * Sunucu "sıra kimde?" sorusunu bununla yanıtlar; `evaluateStatus(board)`
 * oyun sürüyorsa aynı değeri `turn` alanında verir.
 */
export function nextPlayer(board: Board): Player {
  let placed = 0
  for (const cell of board) {
    if (cell !== null) placed += 1
  }
  return placed % 2 === 0 ? 'X' : 'O'
}
