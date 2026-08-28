import { describe, expect, it } from 'vitest'
import { remainingSeconds } from './countdown'

describe('remainingSeconds', () => {
  it('turnDeadline null ise null döner', () => {
    expect(remainingSeconds(null, 0, 1000)).toBeNull()
  })

  it('saat sapması olmadan doğru saniyeyi hesaplar', () => {
    expect(remainingSeconds(10_000, 0, 5_000)).toBe(5)
  })

  it('serverOffsetMs istemci saat sapmasını düzeltir', () => {
    // İstemci saati 3 sn ileri (nowMs gerçek sunucu zamanından 3000ms fazla) —
    // offset bunu telafi eder.
    expect(remainingSeconds(10_000, -3_000, 8_000)).toBe(5)
  })

  it('süre dolmuşsa negatife DÜŞMEZ, 0 döner', () => {
    expect(remainingSeconds(1_000, 0, 5_000)).toBe(0)
  })

  it('küsuratlı saniyeyi YUKARI yuvarlar (kullanıcı 0 görmeden önce en az 1 sn görür)', () => {
    expect(remainingSeconds(1_500, 0, 1_000)).toBe(1)
  })
})
