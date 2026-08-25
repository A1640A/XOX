import { describe, expect, it, vi } from 'vitest'
import { scheduleRotation, type RotationDeps } from './rotate'

const NOW = 1_700_000_000_000

interface Spy {
  timers: { callback: () => void; ms: number }[]
  cleared: unknown[]
  closes: { code: number; reason: string }[]
  deps: RotationDeps
}

function spy(overrides: Partial<RotationDeps> = {}): Spy {
  const timers: Spy['timers'] = []
  const cleared: unknown[] = []
  const closes: Spy['closes'] = []
  return {
    timers,
    cleared,
    closes,
    deps: {
      getDeadline: () => new Date(NOW + 800_000),
      now: () => NOW,
      setTimer: (callback, ms) => {
        timers.push({ callback, ms })
        return timers.length - 1
      },
      clearTimer: (handle) => cleared.push(handle),
      close: (code, reason) => closes.push({ code, reason }),
      ...overrides,
    },
  }
}

describe('scheduleRotation (ADR-0007)', () => {
  it('deadline yoksa zamanlayıcı KURULMAZ (yerel geliştirme)', () => {
    const s = spy({ getDeadline: () => undefined })
    const rotation = scheduleRotation(s.deps)
    expect(s.timers).toHaveLength(0)
    expect(rotation.inMs()).toBeNull()
  })

  it('deadline`dan 10 saniye önceye kurulur — Pro planında 800 sn → 790_000 ms', () => {
    const s = spy()
    expect(scheduleRotation(s.deps).inMs()).toBe(790_000)
    expect(s.timers[0]?.ms).toBe(790_000)
  })

  it('Hobby planı (300 sn) için aynı kod 290_000 ms verir — süre KODA GÖMÜLÜ DEĞİL', () => {
    const s = spy({ getDeadline: () => new Date(NOW + 300_000) })
    expect(scheduleRotation(s.deps).inMs()).toBe(290_000)
  })

  it('deadline paydan yakınsa gecikme 0 olur, negatife düşmez', () => {
    const s = spy({ getDeadline: () => new Date(NOW + 3_000) })
    expect(scheduleRotation(s.deps).inMs()).toBe(0)
  })

  it('deadline geçmişte kalsa bile gecikme 0 olur', () => {
    const s = spy({ getDeadline: () => new Date(NOW - 60_000) })
    expect(scheduleRotation(s.deps).inMs()).toBe(0)
  })

  it('süre dolunca 4499 ile kapatır', () => {
    const s = spy()
    scheduleRotation(s.deps)
    s.timers[0]?.callback()
    expect(s.closes).toStrictEqual([{ code: 4499, reason: 'rotate' }])
  })

  it('marginMs ezilebilir — 5 saniyede rotasyon (ADR-0007 ölçüm notu)', () => {
    const s = spy({ getDeadline: () => new Date(NOW + 6_000), marginMs: 1_000 })
    expect(scheduleRotation(s.deps).inMs()).toBe(5_000)
  })

  it('cancel zamanlayıcıyı temizler ve ikinci kez temizlemez', () => {
    const s = spy()
    const rotation = scheduleRotation(s.deps)
    rotation.cancel()
    rotation.cancel()
    expect(s.cleared).toStrictEqual([0])
    expect(rotation.inMs()).toBeNull()
  })

  it('iptal edilmiş rotasyon artık kapatmaz', () => {
    const s = spy()
    const rotation = scheduleRotation(s.deps)
    rotation.cancel()
    expect(s.closes).toStrictEqual([])
  })

  it('getDeadline YALNIZ bir kez okunur — kurulum anında', () => {
    const getDeadline = vi.fn(() => new Date(NOW + 800_000))
    const s = spy({ getDeadline })
    scheduleRotation(s.deps)
    expect(getDeadline).toHaveBeenCalledTimes(1)
  })
})
