import { describe, expect, it } from 'vitest'
import {
  availableMoves,
  boardFromCells,
  boardToString,
  cellAt,
  emptyBoard,
  nextPlayer,
} from './board'
import { DEFAULT_BOARD_CONFIG } from './config'
import type { Board, Cell } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** Tip sistemini aşan girdiyi taklit eder: kalıcı katmandan böyle veri gelebilir. */
const asCells = (values: readonly unknown[]): readonly Cell[] => values as readonly Cell[]

describe('emptyBoard', () => {
  it('varsayılan konfigürasyonda dokuz boş hücreden oluşur', () => {
    expect(emptyBoard()).toHaveLength(9)
    expect(emptyBoard().every((c) => c === null)).toBe(true)
  })

  it.each([
    [3, 9],
    [6, 36],
    [11, 121],
  ])('kenarı %i olan tahta %i boş hücre içerir', (size, cells) => {
    const board = emptyBoard({ size, winLength: 3 })
    expect(board).toHaveLength(cells)
    expect(board.every((c) => c === null)).toBe(true)
  })

  it('donmuştur — yazma denemesi hata atar ve tahtayı bozmaz', () => {
    const board = emptyBoard()
    expect(Object.isFrozen(board)).toBe(true)
    expect(() => {
      ;(board as unknown as Cell[])[0] = 'X'
    }).toThrow(TypeError)
    expect(cellAt(board, 0)).toBeNull()
  })

  it('KK-B10: bilinen konfigürasyon memoize edilir — aynı referans döner', () => {
    expect(emptyBoard({ size: 6, winLength: 4 })).toBe(emptyBoard({ size: 6, winLength: 4 }))
    expect(emptyBoard()).toBe(emptyBoard(DEFAULT_BOARD_CONFIG))
    expect(emptyBoard()).not.toBe(emptyBoard({ size: 11, winLength: 5 }))
  })

  it('KK-B29: BOARD_MODES dışı konfigürasyon ÖNBELLEĞE ALINMAZ — her çağrı yeni tahta', () => {
    const first = emptyBoard({ size: 4, winLength: 3 })
    const second = emptyBoard({ size: 4, winLength: 3 })
    expect(first).toHaveLength(16)
    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })
})

describe('cellAt — TOTAL (ADR-0011 §3)', () => {
  it('aralık içindeki hücreyi okur', () => {
    expect(cellAt(b('X........'), 0)).toBe('X')
    expect(cellAt(b('X........'), 8)).toBeNull()
  })

  it('aralık dışı okuma BOŞ hücre verir, undefined vermez — hayalet galibiyet yok', () => {
    const board = emptyBoard()
    expect(cellAt(board, 999)).toBeNull()
    expect(cellAt(board, 9)).not.toBeUndefined()
    expect(cellAt(board, -1)).toBeNull()
  })

  it('yanlış konfigürasyonla taranan tahtada üç aralık-dışı okuma kazanan üretemez', () => {
    // `undefined === undefined` üç kez doğru olurdu; `?? null` bu sınıfı kapatır.
    const board = emptyBoard()
    expect([9, 10, 11].map((i) => cellAt(board, i))).toEqual([null, null, null])
  })
})

describe('boardFromCells', () => {
  it('dokuz hücreyi tahtaya çevirir', () => {
    expect(cellAt(b('X........'), 0)).toBe('X')
  })

  it('dokuz olmayan uzunlukta hata atar', () => {
    expect(() => boardFromCells([null, null])).toThrow(RangeError)
  })

  it('hata mesajı beklenen ve gelen hücre sayısını bildirir', () => {
    expect(() => boardFromCells([null, null])).toThrow('Tahta 9 hücre olmalı, 2 geldi')
  })

  it('uzunluğu KONFİGÜRASYONA göre doğrular — 36 hücre 6x6 tahtada geçerlidir', () => {
    expect(
      boardFromCells(asCells(Array.from({ length: 36 }, () => null)), {
        size: 6,
        winLength: 4,
      }),
    ).toHaveLength(36)
  })

  it('E-18: size 11 ama 9 hücre gelirse reddedilir', () => {
    expect(() =>
      boardFromCells(asCells(Array.from({ length: 9 }, () => null)), { size: 11, winLength: 5 }),
    ).toThrow('Tahta 121 hücre olmalı, 9 geldi')
  })

  it('X, O ve null dolu tahtayı kabul eder', () => {
    expect(boardFromCells(asCells(['X', 'O', null, 'O', 'X', null, null, 'X', 'O']))).toHaveLength(
      9,
    )
  })

  it('tanımsız hücre içeren diziyi reddeder — boş sanılan tahta kazanmış görünmesin', () => {
    expect(() => boardFromCells(asCells(Array.from({ length: 9 })))).toThrow(RangeError)
  })

  it('oyuncu olmayan hücre değerini reddeder', () => {
    expect(() => boardFromCells(asCells(['a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g']))).toThrow(
      RangeError,
    )
  })

  it('hata mesajı bozuk hücrenin sırasını ve değerini bildirir', () => {
    expect(() =>
      boardFromCells(asCells([null, 'X', 'O', 'x', null, null, null, null, null])),
    ).toThrow("Tahta hücresi 3 geçersiz: x — yalnız 'X', 'O' veya null olabilir")
  })

  it('küçük harf oyuncu simgesini reddeder', () => {
    expect(() =>
      boardFromCells(asCells(['o', null, null, null, null, null, null, null, null])),
    ).toThrow(RangeError)
  })

  it('son hücredeki bozuk değeri de yakalar', () => {
    expect(() =>
      boardFromCells(asCells([null, null, null, null, null, null, null, null, 0])),
    ).toThrow('Tahta hücresi 8 geçersiz')
  })

  it('büyük tahtada da her hücre değeri doğrulanır', () => {
    const cells = Array.from({ length: 36 }, () => null) as unknown[]
    cells[35] = 'z'
    expect(() => boardFromCells(asCells(cells), { size: 6, winLength: 4 })).toThrow(
      'Tahta hücresi 35 geçersiz',
    )
  })
})

describe('boardToString', () => {
  it('boş tahtayı dokuz nokta olarak döndürür', () => {
    expect(boardToString(emptyBoard())).toBe('.........')
  })

  it('her hücreyi X, O ya da nokta olarak yazar', () => {
    expect(boardToString(b('XO.XO.XO.'))).toBe('XO.XO.XO.')
  })

  it('gidiş-dönüş: metne çevrilip boardFromCells ile geri okunan tahta birebir eşittir', () => {
    const board = b('XXO.O.X..')
    expect(b(boardToString(board))).toEqual(board)
  })

  it('büyük tahtada uzunluk tahtanın kendisinden gelir — 36 karakter', () => {
    expect(boardToString(emptyBoard({ size: 6, winLength: 4 }))).toBe('.'.repeat(36))
  })
})

describe('availableMoves', () => {
  it('boş tahtada dokuz hamle döner', () => {
    expect(availableMoves(emptyBoard())).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('dolu hücreleri atlar', () => {
    expect(availableMoves(b('XO.......'))).toEqual([2, 3, 4, 5, 6, 7, 8])
  })

  it('dolu tahtada boş dizi döner', () => {
    expect(availableMoves(b('XOXOXOXOX'))).toEqual([])
  })

  it('11x11 boş tahtada 121 hamle döner — son indeks 120', () => {
    const moves = availableMoves(emptyBoard({ size: 11, winLength: 5 }))
    expect(moves).toHaveLength(121)
    expect(moves.at(-1)).toBe(120)
  })
})

describe('nextPlayer', () => {
  it('boş tahtada X ile başlar', () => {
    expect(nextPlayer(emptyBoard())).toBe('X')
  })

  it('X oynadıktan sonra O sırası', () => {
    expect(nextPlayer(b('X........'))).toBe('O')
  })

  it('eşit sayıda taş varsa X sırası', () => {
    expect(nextPlayer(b('XO.......'))).toBe('X')
  })
})
