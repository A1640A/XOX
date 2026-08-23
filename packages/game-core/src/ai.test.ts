import { describe, expect, it } from 'vitest'
import { EMPTY_BOARD, applyMove, availableMoves, boardFromCells } from './board'
import { evaluateStatus } from './status'
import { bestMove, chooseMove } from './ai'
import { InvalidMoveError } from './errors'
import type { Board, Player } from './types'

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
    // X hem 2'de kazanabilir hem O 3-4-5'te kazanmak üzere — kazanmayı seçmeli
    expect(bestMove(b('XX.OO....'), 'X')).toBe(2)
  })

  it('hamle kalmamışsa InvalidMoveError atar', () => {
    expect(() => bestMove(b('XOXXOOOXX'), 'X')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('eşit puanlı hamlelerde ilkini seçer — seçim deterministiktir', () => {
    // Boş tahtada her hamle beraberlikle biter; sunucu otoritesi için sonuç
    // yeniden üretilebilir olmalı, bu yüzden ilk en iyi hamle korunur.
    expect(bestMove(EMPTY_BOARD, 'X')).toBe(0)
  })

  it('hemen kazanabilecekken kazancı bir tura ertelemez', () => {
    // 3 oynanırsa 3-4-5 ile hemen kazanır. 6 da kazandırır (O'yu bloklar ve
    // 2 ile 3'te çifte tehdit kurar) ama bir hamle sonra: derinlik cezası
    // olmadan AI erteleyeni seçerdi.
    expect(bestMove(b('....XX.OO'), 'X')).toBe(3)
  })
})

describe('unbeatable zorluk', () => {
  const playFullGame = (aiPlayer: Player, humanPicks: (board: Board) => number): Board => {
    let board = EMPTY_BOARD
    while (evaluateStatus(board).kind === 'playing') {
      const status = evaluateStatus(board)
      if (status.kind !== 'playing') break
      const move =
        status.turn === aiPlayer ? chooseMove(board, aiPlayer, 'unbeatable') : humanPicks(board)
      board = applyMove(board, move, status.turn)
    }
    return board
  }

  it('ilk sırayı alan mükemmel AI asla kaybetmez (rakip ilk boşluğu oynar)', () => {
    const final = playFullGame('X', (board) => availableMoves(board)[0] ?? 0)
    const status = evaluateStatus(final)
    expect(status.kind === 'draw' || (status.kind === 'won' && status.winner === 'X')).toBe(true)
  })

  it('ikinci oynayan mükemmel AI asla kaybetmez (rakip son boşluğu oynar)', () => {
    const final = playFullGame('O', (board) => {
      const moves = availableMoves(board)
      return moves[moves.length - 1] ?? 0
    })
    const status = evaluateStatus(final)
    expect(status.kind === 'draw' || (status.kind === 'won' && status.winner === 'O')).toBe(true)
  })

  it('ikinci oynayan mükemmel AI, ilk boşluğu oynayan rakibe karşı da kaybetmez', () => {
    const final = playFullGame('O', (board) => availableMoves(board)[0] ?? 0)
    const status = evaluateStatus(final)
    expect(status.kind === 'draw' || (status.kind === 'won' && status.winner === 'O')).toBe(true)
  })

  it('iki mükemmel AI karşılaşırsa beraberlik olur', () => {
    let board = EMPTY_BOARD
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
    expect(chooseMove(EMPTY_BOARD, 'X', 'easy', seededRng([0.5]))).toBe(4)
  })

  it('medium zorlukta rng < 0.5 ise en iyi hamleyi oynar', () => {
    expect(chooseMove(b('XX.OO....'), 'X', 'medium', seededRng([0.1]))).toBe(2)
  })

  it('medium zorlukta rng >= 0.5 ise rastgele oynar', () => {
    expect(chooseMove(b('XX.OO....'), 'X', 'medium', seededRng([0.9, 0]))).toBe(2)
  })

  // Aşağıdaki tahtada en iyi hamle 2 (O'nun 0-1-2 tehdidini bloklar); boş
  // hücreler [2, 4, 5, 7, 8] olduğundan rng=0.9 rastgele seçiciyi 8'e götürür.
  // Böylece "en iyi" ile "rastgele" birbirinden ayırt edilebilir.
  const forkBoard = 'OO.X..X..'

  it('easy zorlukta en iyi hamleyi değil rastgele hamleyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'easy', seededRng([0.9, 0]))).toBe(8)
  })

  it('easy zorlukta rng 1 dönse bile son geçerli hamleyi seçer', () => {
    expect(chooseMove(EMPTY_BOARD, 'X', 'easy', () => 1)).toBe(8)
  })

  it('medium zorlukta rng < 0.5 ise rastgeleyi değil en iyiyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.1, 0.9]))).toBe(2)
  })

  it('medium zorlukta rng >= 0.5 ise en iyiyi değil rastgeleyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.9, 0.9]))).toBe(8)
  })

  it('medium zorlukta rng tam 0.5 ise rastgele oynar — sınır dahil değil', () => {
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.5, 0.9]))).toBe(8)
  })

  it('unbeatable zorlukta rastgeleliği yok sayar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'unbeatable', seededRng([0.9, 0.9]))).toBe(2)
  })

  it('geçerli bir hamle indeksi döndürür', () => {
    const move = chooseMove(EMPTY_BOARD, 'X', 'easy')
    expect(availableMoves(EMPTY_BOARD)).toContain(move)
  })

  it('hamle kalmamışsa InvalidMoveError atar', () => {
    expect(() => chooseMove(b('XOXXOOOXX'), 'X', 'easy')).toThrow(InvalidMoveError)
    expect(() => chooseMove(b('XOXXOOOXX'), 'X', 'easy')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })
})
