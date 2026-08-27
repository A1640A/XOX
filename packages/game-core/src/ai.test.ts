import { describe, expect, it } from 'vitest'
import { availableMoves, boardFromCells, emptyBoard } from './board'
import { applyMove } from './moves'
import { evaluateStatus } from './status'
import { bestMove, bestMoveStats, chooseMove } from './ai'
import { InvalidMoveError } from './errors'
import type { Board, Difficulty, Player } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** Sabit diziden değer üreten sahte rastgele sayı üreteci — deterministik test için. */
const seededRng = (values: readonly number[]): (() => number) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

describe('bestMove', () => {
  it('kazanma hamlesini alır', () => {
    expect(bestMove(b('XX.OO....'), 'X')).toBe(2)
  })

  it('rakibin kazanmasını engeller', () => {
    expect(bestMove(b('OO.X..X..'), 'X')).toBe(2)
  })

  it('kazanmayı engellemeye tercih eder', () => {
    // O 0-1-2'de kazanmak üzere (engelleme hücresi 2), X ise 3-4-5 ile hemen
    // kazanabilir (kazanma hücresi 5). Kazanma hücresi engelleme hücresinden
    // BÜYÜK indeksli seçildi: "önce engelle" ya da "en küçük indeksi seç"
    // davranışı bu tahtada 2 döner ve testi düşürür.
    expect(bestMove(b('OO.XX....'), 'X')).toBe(5)
  })

  it('hamle kalmamışsa InvalidMoveError atar', () => {
    expect(() => bestMove(b('XOXXOOOXX'), 'X')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('oyun kazanılmışsa boş hücre kalsa bile hamle üretmez', () => {
    expect(() => bestMove(b('XXXOO....'), 'O')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('eşit puanlı hamlelerde ilkini seçer — seçim deterministiktir', () => {
    // Boş tahtada her hamle beraberlikle biter; sunucu otoritesi için sonuç
    // yeniden üretilebilir olmalı, bu yüzden ilk en iyi hamle korunur.
    expect(bestMove(emptyBoard(), 'X')).toBe(0)
  })

  it('hemen kazanabilecekken kazancı bir tura ertelemez', () => {
    // 3 oynanırsa 3-4-5 ile hemen kazanır. 6 da kazandırır (O'yu bloklar ve
    // 2 ile 3'te çifte tehdit kurar) ama bir hamle sonra: derinlik cezası
    // olmadan AI erteleyeni seçerdi.
    expect(bestMove(b('....XX.OO'), 'X')).toBe(3)
  })

  // Seçilen hamle sunucu otoritesidir ve iki istemcide aynı çıkmalıdır; oyun
  // teorisi açısından eşdeğer başka hamleler bulunsa da SEÇİM sabittir. Bu
  // tablo hem stratejiyi hem de eşitlik bozma kuralını (en küçük indeks)
  // oyun ortasındaki tahtalarda çivi ler.
  it.each([
    ['X........', 'O', 4, 'merkez tek doğru cevaptır'],
    ['....X....', 'O', 0, 'merkez alınmışsa köşe — eşit dört köşeden ilki'],
    ['X.......O', 'X', 2, 'eşit puanlı 2 ve 6 arasından küçük indeksli'],
    ['XOX......', 'X', 4, 'eşit puanlı 4, 6 ve 8 arasından küçük indeksli'],
    ['X..O..X..', 'O', 4, 'çifte tehdidi yalnız merkez durdurur'],
    ['X.O.X...O', 'X', 5, 'beraberliği yalnız 5 kurtarır'],
    ['XX.O.O...', 'X', 2, 'kazanç hattı tamamlanır'],
  ])('%s tahtasında %s için %i seçilir (%s)', (cells, player, expected) => {
    expect(bestMove(b(cells), player as Player)).toBe(expected)
  })
})

/**
 * Alfa-beta budaması minimax DEĞERİNİ değiştirmez, yalnız ziyaret edilen düğüm
 * sayısını azaltır. "Değişmedi" iddiasının kanıtı bu blokta DEĞİL, yukarıdaki
 * `bestMove` tablosunda ve aşağıdaki 642 oyunluk tümevarımsal koşudadır — ikisi
 * de bu kartta TEK KARAKTER değişmedi.
 *
 * Bu blok yalnız İKİNCİ iddiayı ölçer: budama gerçekten çalışıyor mu?
 * Düğüm sayısı gözlenebilir olmasaydı budamayı tamamen kapatan bir değişiklik
 * (ör. pencere güncellemesini kaldırmak) bütün testleri YEŞİL bırakırdı —
 * sonuçlar aynı, yalnız yavaş. Sayaç bu yüzden dışa veriliyor.
 */
describe('bestMoveStats — alfa-beta budaması', () => {
  /**
   * BUDAMASIZ tam minimaxın boş tahtadaki düğüm sayısı. Bu kartın ÖNCESİNDEKİ
   * üretim kodundan ölçüldü ve AI-SPIKE-001'in tarayıcı ölçümünde de birebir
   * aynı çıktı ("ikisi de AYNI düğüm sayısını (549 945) geziyor"); XOX oyun
   * ağacının bilinen düğüm sayısıdır.
   *
   * Beklenti testin DIŞINDAN gelir: kodun bugünkü hâlinden türetilmez.
   */
  const FULL_MINIMAX_NODES_EMPTY = 549_945

  /**
   * TAVAN GEREKSİNİMDEN TÜRETİLDİ, implementasyondan değil.
   *
   * AI-SPIKE-001: budamasız 549 945 düğüm, CDP R=6 throttle altında gerçek
   * bundle'da 1982–2265 ms. KK-023 tavanı 1000 ms. Ölçüm R'ye doğrusal ve
   * düğüm sayısına doğrusal olduğu için 1000 ms'nin altına inmek için gereken
   * en az azaltma 2265/1000 ≈ 2.3×'tir. Burada 10× isteniyor: en kötü R=6
   * varsayımında bile ~4× pay bırakır (gerçek cihaz R'si ölçülmedi, bkz.
   * AI-SPIKE-001 (a) [MANUEL] adımı hâlâ açık).
   */
  const REQUIRED_REDUCTION = 10

  it('boş tahtada aynı hamleyi en az 10 kat daha az düğümle bulur', () => {
    const stats = bestMoveStats(emptyBoard(), 'X')

    expect(stats.move).toBe(bestMove(emptyBoard(), 'X'))
    expect(stats.nodes * REQUIRED_REDUCTION).toBeLessThanOrEqual(FULL_MINIMAX_NODES_EMPTY)
  })

  // Açılış tek darboğaz değil; ilk hamlelerden sonraki pozisyonlarda da budama
  // çalışmalı. Her satırın SON sütunu aynı pozisyonun BUDAMASIZ maliyetidir
  // (kartın öncesindeki üretim kodundan ölçüldü) — kazanç satırda okunur.
  // Düğüm sayıları ÇIPLAK yazıldı (regresyon çivisi): budamayı zayıflatan her
  // değişiklik — sonucu bozmasa bile — bu tabloyu kırar.
  it.each([
    ['.........', 'X', 0, 20_865, 549_945],
    ['X........', 'O', 4, 2_787, 59_704],
    ['....X....', 'O', 0, 2_458, 55_504],
    ['XOX......', 'X', 4, 200, 1_096],
  ])(
    '%s tahtasında %s için %i seçilir ve tam %i düğüm gezilir (budamasız %i)',
    (cells, player, move, nodes, unpruned) => {
      const stats = bestMoveStats(b(cells), player as Player)

      expect(stats).toEqual({ move, nodes })
      expect(stats.nodes).toBeLessThan(unpruned)
    },
  )

  it('sayaç çağrılar arasında sıfırlanır — gezici durum, modül durumu değil', () => {
    // Modül düzeyinde bir sayaç olsaydı ikinci çağrı birincinin üstüne toplardı;
    // Stryker `perTest` altında bu, mutantı yanlış teste yazdırırdı.
    const first = bestMoveStats(b('XOX......'), 'X').nodes
    const second = bestMoveStats(b('XOX......'), 'X').nodes

    expect(second).toBe(first)
  })

  it('biten oyunda sayaç üretmez, hata atar', () => {
    expect(() => bestMoveStats(b('XXXOO....'), 'O')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })
})

describe('unbeatable zorluk', () => {
  interface Tally {
    games: number
    losses: number
    illegal: number
  }

  /**
   * Tümevarımsal kanıt: insanın oynadığı her düğümde BÜTÜN hamleler denenir,
   * AI'nın düğümünde tek dal (motorun seçtiği hamle) izlenir. Böylece mükemmel
   * AI'nın karşılaşabileceği bütün oyunlar taranır — senaryo örneklemesi değil.
   */
  const explore = (board: Board, aiPlayer: Player, tally: Tally): void => {
    const status = evaluateStatus(board)
    if (status.kind !== 'playing') {
      tally.games += 1
      if (status.kind === 'won' && status.winner !== aiPlayer) tally.losses += 1
      return
    }
    if (status.turn === aiPlayer) {
      const move = chooseMove(board, aiPlayer, 'unbeatable')
      if (!availableMoves(board).includes(move)) {
        tally.illegal += 1
        return
      }
      explore(applyMove(board, move, aiPlayer), aiPlayer, tally)
      return
    }
    for (const move of availableMoves(board)) {
      explore(applyMove(board, move, status.turn), aiPlayer, tally)
    }
  }

  const playAll = (aiPlayer: Player): Tally => {
    const tally: Tally = { games: 0, losses: 0, illegal: 0 }
    explore(emptyBoard(), aiPlayer, tally)
    return tally
  }

  it('X olarak oynayan AI, rakibin bütün oyunlarında kaybetmez ve kural dışı hamle yapmaz', () => {
    const tally = playAll('X')
    expect({ losses: tally.losses, illegal: tally.illegal }).toEqual({ losses: 0, illegal: 0 })
    // Oyun sayısı, eşitlik bozma kuralının deterministik olduğunu da sabitler:
    // AI başka bir eşdeğer hamle seçseydi ağaç başka sayıda yaprak verirdi.
    expect(tally.games).toBe(73)
  })

  it('O olarak oynayan AI, rakibin bütün oyunlarında kaybetmez ve kural dışı hamle yapmaz', () => {
    const tally = playAll('O')
    expect({ losses: tally.losses, illegal: tally.illegal }).toEqual({ losses: 0, illegal: 0 })
    expect(tally.games).toBe(569)
  })

  it('iki mükemmel AI karşılaşırsa beraberlik olur', () => {
    let board = emptyBoard()
    let status = evaluateStatus(board)
    while (status.kind === 'playing') {
      board = applyMove(board, chooseMove(board, status.turn, 'unbeatable'), status.turn)
      status = evaluateStatus(board)
    }
    expect(status).toEqual({ kind: 'draw' })
  })
})

describe('chooseMove', () => {
  it('easy zorlukta rastgele seçer', () => {
    expect(chooseMove(emptyBoard(), 'X', 'easy', seededRng([0.5]))).toBe(4)
  })

  // Aşağıdaki tahtada en iyi hamle 2 (O'nun 0-1-2 tehdidini bloklar); boş
  // hücreler [2, 4, 5, 7, 8] olduğundan rng=0.9 rastgele seçiciyi 8'e götürür.
  // Böylece "en iyi" ile "rastgele" birbirinden ayırt edilebilir.
  const forkBoard = 'OO.X..X..'

  it('easy zorlukta en iyi hamleyi değil rastgele hamleyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'easy', seededRng([0.9]))).toBe(8)
  })

  it('easy zorlukta rng 1 dönse bile son geçerli hamleyi seçer', () => {
    expect(chooseMove(emptyBoard(), 'X', 'easy', () => 1)).toBe(8)
  })

  it('easy zorlukta rng < 0.5 olsa bile en iyi hamleye sapmaz', () => {
    // medium dalına düşen bir uygulama burada 0.3 < 0.5 diye en iyi hamleyi (2)
    // oynardı; easy her zaman rastgeledir.
    expect(chooseMove(b(forkBoard), 'X', 'easy', seededRng([0.3]))).toBe(4)
  })

  it('easy zorlukta rng negatif dönse bile ilk geçerli hamleyi seçer', () => {
    expect(chooseMove(emptyBoard(), 'X', 'easy', () => -0.1)).toBe(0)
  })

  it('easy zorlukta rng NaN dönse bile geçerli bir hamle seçer', () => {
    expect(chooseMove(emptyBoard(), 'X', 'easy', () => Number.NaN)).toBe(0)
  })

  // Aşağıdaki üç test tek değerli (sabit) bir üreteç kullanır: ternary'nin
  // koşulu kaldırılırsa `rng()` çağrısı da kaybolur, dizi tabanlı bir üreteçte
  // sıra kayar ve rastgele seçici tesadüfen en iyi hamleyi bulabilirdi. Sabit
  // üreteçte hangi dalın çalıştığı sonuçtan tek anlamlı okunur.
  it('medium zorlukta rng < 0.5 ise rastgeleyi değil en iyiyi oynar', () => {
    // 0.3 rastgele seçiciye gitseydi indeks 1, yani 4 hamlesi seçilirdi.
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.3]))).toBe(2)
  })

  it('medium zorlukta rng >= 0.5 ise en iyiyi değil rastgeleyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.9]))).toBe(8)
  })

  it('medium zorlukta rng tam 0.5 ise rastgele oynar — sınır dahil değil', () => {
    // 0.5 en iyi hamleye (2) değil, listenin ortasındaki 5'e götürür.
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.5]))).toBe(5)
  })

  it('unbeatable zorlukta rastgeleliği yok sayar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'unbeatable', seededRng([0.9]))).toBe(2)
  })

  it('geçerli bir hamle indeksi döndürür', () => {
    const move = chooseMove(emptyBoard(), 'X', 'easy')
    expect(availableMoves(emptyBoard())).toContain(move)
  })

  it('hamle kalmamışsa InvalidMoveError atar', () => {
    expect(() => chooseMove(b('XOXXOOOXX'), 'X', 'easy')).toThrow(InvalidMoveError)
    expect(() => chooseMove(b('XOXXOOOXX'), 'X', 'easy')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('oyun kazanılmışsa boş hücre kalsa bile hamle üretmez', () => {
    expect(() => chooseMove(b('XXXOO....'), 'O', 'unbeatable')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('kolay zorlukta bile biten oyunda hamle üretmez', () => {
    expect(() => chooseMove(b('XXXOO....'), 'O', 'easy', () => 0)).toThrow(InvalidMoveError)
  })

  it('tip sisteminin dışından gelen zorluğu sessizce kabul etmez', () => {
    expect(() => chooseMove(emptyBoard(), 'X', 'imkansiz' as Difficulty)).toThrow(
      new RangeError('Bilinmeyen zorluk: imkansiz'),
    )
  })
})
