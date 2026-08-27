import { describe, expect, it } from 'vitest'
import type { GameStatus } from '@xox/game-core'
import { tr } from '@/messages/tr'
import { COMPUTER, HUMAN } from './game-engine'
import { statusText } from './status-text'

const PLAYING_HUMAN: GameStatus = { kind: 'playing', turn: HUMAN }
const PLAYING_COMPUTER: GameStatus = { kind: 'playing', turn: COMPUTER }
const DRAW: GameStatus = { kind: 'draw' }
const WON_HUMAN: GameStatus = { kind: 'won', winner: HUMAN, line: [0, 1, 2] }
const WON_COMPUTER: GameStatus = { kind: 'won', winner: COMPUTER, line: [0, 1, 2] }

describe('statusText', () => {
  it('insanın sırasında boyuttan BAĞIMSIZ olarak tr.game.yourTurn döner', () => {
    expect(statusText(PLAYING_HUMAN, 3)).toBe(tr.game.yourTurn)
    expect(statusText(PLAYING_HUMAN, 11)).toBe(tr.game.yourTurn)
  })

  it('UI-COMP-001: bilgisayarın sırasında size === 3 iken tr.computer.thinking döner', () => {
    expect(statusText(PLAYING_COMPUTER, 3)).toBe(tr.computer.thinking)
  })

  it.each([6, 11])(
    'UI-COMP-001: bilgisayarın sırasında size === %i iken tr.computer.thinkingBig döner (dürüstlük — searchMove bütçeli aramaya gider)',
    (size) => {
      expect(statusText(PLAYING_COMPUTER, size)).toBe(tr.computer.thinkingBig)
    },
  )

  it('berabere ve galibiyet/mağlubiyet metinleri boyuttan ETKİLENMEZ', () => {
    expect(statusText(DRAW, 3)).toBe(tr.game.draw)
    expect(statusText(DRAW, 11)).toBe(tr.game.draw)
    expect(statusText(WON_HUMAN, 3)).toBe(tr.game.youWon)
    expect(statusText(WON_HUMAN, 11)).toBe(tr.game.youWon)
    expect(statusText(WON_COMPUTER, 3)).toBe(tr.game.youLost)
    expect(statusText(WON_COMPUTER, 11)).toBe(tr.game.youLost)
  })
})
