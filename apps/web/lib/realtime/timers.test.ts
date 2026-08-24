import type { SettlementInput } from '@/lib/game/deadlines'
import { describe, expect, it, vi } from 'vitest'
import { createSettlementTimer } from './timers'

const ROOM: SettlementInput = {
  state: 'playing',
  board: [null, null, null, null, null, null, null, null, null],
  turnDeadline: null,
  disconnected: null,
}

describe('createSettlementTimer · NO-OP iskelet (W2-01)', () => {
  it('P0`da hiçbir zamanlayıcı kurulmaz — turnDeadline yazılmıyor (AS-08)', () => {
    const setTimer = vi.fn(() => 1)
    const timer = createSettlementTimer({
      setTimer,
      clearTimer: vi.fn(),
      now: () => 0,
      onDue: vi.fn(),
    })
    timer.schedule(ROOM)
    expect(setTimer).not.toHaveBeenCalled()
    expect(timer.isArmed()).toBe(false)
  })

  it('schedule tekrar tekrar çağrılabilir, cancel kurulu değilken patlamaz', () => {
    const clearTimer = vi.fn()
    const timer = createSettlementTimer({
      setTimer: vi.fn(() => 1),
      clearTimer,
      now: () => 0,
      onDue: vi.fn(),
    })
    timer.schedule(ROOM)
    timer.schedule(ROOM)
    timer.cancel()
    expect(clearTimer).not.toHaveBeenCalled()
  })

  it('süresi dolmuş bir oda için bile P0`da onDue çağrılmaz', () => {
    const onDue = vi.fn()
    const timer = createSettlementTimer({
      setTimer: vi.fn(() => 1),
      clearTimer: vi.fn(),
      now: () => 1_000,
      onDue,
    })
    timer.schedule({ ...ROOM, turnDeadline: new Date(0) })
    expect(onDue).not.toHaveBeenCalled()
  })
})
