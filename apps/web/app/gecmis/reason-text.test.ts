import { describe, expect, it } from 'vitest'
import { tr } from '@/messages/tr'
import { matchReasonText } from './reason-text'

describe('matchReasonText — KK-116 bitiş sebebi', () => {
  it('beraberlik: endReason=null iken sonuç ne olursa olsun tr.game.draw döner', () => {
    expect(matchReasonText('draw', null)).toBe(tr.game.draw)
  })

  it('çizgiyle galibiyet/mağlubiyet', () => {
    expect(matchReasonText('win', 'line')).toBe(tr.game.youWon)
    expect(matchReasonText('loss', 'line')).toBe(tr.game.youLost)
  })

  it('pes etme ile galibiyet/mağlubiyet', () => {
    expect(matchReasonText('win', 'resign')).toBe(tr.game.wonByResign)
    expect(matchReasonText('loss', 'resign')).toBe(tr.game.lostByResign)
  })

  it('süre doldu ile galibiyet/mağlubiyet — KK-074/W2-01 regresyonu', () => {
    expect(matchReasonText('win', 'timeout')).toBe(tr.game.wonByTimeout)
    expect(matchReasonText('loss', 'timeout')).toBe(tr.game.lostByTimeout)
  })

  it('terk (abandon) ile galibiyet — KK-072/W2-01 regresyonu', () => {
    expect(matchReasonText('win', 'abandon')).toBe(tr.game.wonByAbandon)
  })

  it('terk (abandon) ile mağlubiyet: ayrı metin tanımlı değil, genel kaybetme metnine düşer', () => {
    expect(matchReasonText('loss', 'abandon')).toBe(tr.game.youLost)
  })

  it('sonuç "win" olsa bile endReason null ise (beklenmeyen veri) draw metnine düşer, istisna atmaz', () => {
    expect(matchReasonText('win', null)).toBe(tr.game.draw)
  })
})
