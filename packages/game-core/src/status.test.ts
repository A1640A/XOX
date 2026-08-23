import { describe, expect, it } from 'vitest'
import { boardFromCells } from './board'
import { WIN_LINES, evaluateStatus } from './status'
import type { Board } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

describe('WIN_LINES', () => {
  it('sekiz kazanma hattı içerir', () => {
    expect(WIN_LINES).toHaveLength(8)
  })
})

describe('evaluateStatus', () => {
  it('boş tahtada X sırası ile playing döner', () => {
    expect(evaluateStatus(b('.........'))).toEqual({ kind: 'playing', turn: 'X' })
  })

  it('tek hamle sonrası O sırası ile playing döner', () => {
    expect(evaluateStatus(b('X........'))).toEqual({ kind: 'playing', turn: 'O' })
  })

  it.each([
    ['üst yatay', 'XXXOO....', [0, 1, 2]],
    ['orta yatay', 'OO.XXX...', [3, 4, 5]],
    ['alt yatay', 'OO....XXX', [6, 7, 8]],
    ['sol dikey', 'XOOX..X..', [0, 3, 6]],
    ['orta dikey', 'OX.OX..X.', [1, 4, 7]],
    ['sağ dikey', 'OOX..X..X', [2, 5, 8]],
    ['ana çapraz', 'XO.OX...X', [0, 4, 8]],
    ['ters çapraz', 'OOX.X.X..', [2, 4, 6]],
  ])('%s hattında X kazanır', (_ad, cells, line) => {
    expect(evaluateStatus(b(cells))).toEqual({ kind: 'won', winner: 'X', line })
  })

  it('O kazandığında kazananı O olarak bildirir', () => {
    expect(evaluateStatus(b('OOOXX.X..'))).toEqual({ kind: 'won', winner: 'O', line: [0, 1, 2] })
  })

  it('tahta dolu ve kazanan yoksa draw döner', () => {
    expect(evaluateStatus(b('XXOOOXXOX'))).toEqual({ kind: 'draw' })
  })

  it('tahta dolu ama kazanan varsa won döner (draw değil)', () => {
    expect(evaluateStatus(b('XXXOOXOXO')).kind).toBe('won')
  })
})
