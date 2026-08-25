import type { SettlementInput } from '@/lib/game/deadlines'
import { describe, expect, it } from 'vitest'
import { createSettlementTimer, type SettlementTimerDeps } from './timers'

const NOW = 1_700_000_000_000

const ROOM: SettlementInput = {
  state: 'playing',
  board: [null, null, null, null, null, null, null, null, null],
  turnDeadline: null,
  disconnected: null,
}

interface Spy {
  timers: { callback: () => void; ms: number }[]
  cleared: unknown[]
  due: number
  deps: SettlementTimerDeps
}

function spy(): Spy {
  const state: Spy = {
    timers: [],
    cleared: [],
    due: 0,
    deps: {
      setTimer: (callback, ms) => {
        state.timers.push({ callback, ms })
        return state.timers.length - 1
      },
      clearTimer: (handle) => state.cleared.push(handle),
      now: () => NOW,
      onDue: () => {
        state.due += 1
      },
    },
  }
  return state
}

describe('createSettlementTimer (ADR-0004 · birinci yürütme yolu)', () => {
  it('deadline YOKSA zamanlayıcı kurulmaz — P0`da turnDeadline daima null (AS-08)', () => {
    const s = spy()
    const timer = createSettlementTimer(s.deps)
    timer.schedule(ROOM)
    expect(s.timers).toHaveLength(0)
    expect(timer.isArmed()).toBe(false)
  })

  it('oyun sürmüyorsa zamanlayıcı kurulmaz', () => {
    const s = spy()
    createSettlementTimer(s.deps).schedule({
      ...ROOM,
      state: 'finished',
      turnDeadline: new Date(NOW + 60_000),
    })
    expect(s.timers).toHaveLength(0)
  })

  it('turnDeadline için tam kalan süreye kurulur', () => {
    const s = spy()
    const timer = createSettlementTimer(s.deps)
    timer.schedule({ ...ROOM, turnDeadline: new Date(NOW + 60_000) })
    expect(s.timers[0]?.ms).toBe(60_000)
    expect(timer.isArmed()).toBe(true)
  })

  it('grace için kurulur', () => {
    const s = spy()
    createSettlementTimer(s.deps).schedule({
      ...ROOM,
      disconnected: { seat: 'O', at: new Date(NOW), graceEndsAt: new Date(NOW + 30_000) },
    })
    expect(s.timers[0]?.ms).toBe(30_000)
  })

  it('ikisi de varsa ÖNCE dolan seçilir', () => {
    const s = spy()
    createSettlementTimer(s.deps).schedule({
      ...ROOM,
      turnDeadline: new Date(NOW + 45_000),
      disconnected: { seat: 'X', at: new Date(NOW), graceEndsAt: new Date(NOW + 12_000) },
    })
    expect(s.timers[0]?.ms).toBe(12_000)
  })

  it('geçmişte kalmış deadline 0 ms ile kurulur, negatife düşmez', () => {
    const s = spy()
    createSettlementTimer(s.deps).schedule({ ...ROOM, turnDeadline: new Date(NOW - 90_000) })
    expect(s.timers[0]?.ms).toBe(0)
  })

  it('süre dolunca onDue TAM BİR KEZ çağrılır ve zamanlayıcı boşalır', () => {
    const s = spy()
    const timer = createSettlementTimer(s.deps)
    timer.schedule({ ...ROOM, turnDeadline: new Date(NOW + 5_000) })
    s.timers[0]?.callback()
    expect(s.due).toBe(1)
    expect(timer.isArmed()).toBe(false)
  })

  it('yeniden schedule öncekini İPTAL eder (iki zamanlayıcı birikmez)', () => {
    const s = spy()
    const timer = createSettlementTimer(s.deps)
    timer.schedule({ ...ROOM, turnDeadline: new Date(NOW + 5_000) })
    timer.schedule({ ...ROOM, turnDeadline: new Date(NOW + 9_000) })
    expect(s.cleared).toStrictEqual([0])
    expect(s.timers.map((t) => t.ms)).toStrictEqual([5_000, 9_000])
  })

  it('cancel kurulu değilken patlamaz ve iki kez temizlemez', () => {
    const s = spy()
    const timer = createSettlementTimer(s.deps)
    timer.cancel()
    timer.schedule({ ...ROOM, turnDeadline: new Date(NOW + 5_000) })
    timer.cancel()
    timer.cancel()
    expect(s.cleared).toStrictEqual([0])
  })

  it('iptal edilmiş zamanlayıcı onDue çağırmaz', () => {
    const s = spy()
    const timer = createSettlementTimer(s.deps)
    timer.schedule({ ...ROOM, turnDeadline: new Date(NOW + 5_000) })
    timer.cancel()
    expect(s.due).toBe(0)
    expect(timer.isArmed()).toBe(false)
  })
})
