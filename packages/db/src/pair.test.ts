import { describe, expect, it } from 'vitest'
import { buildPairKey, deriveParticipants } from './pair'

describe('buildPairKey', () => {
  it('küçük değeri önce yazar (alfabetik sıralı çift)', () => {
    expect(buildPairKey('b-user', 'a-user')).toBe('a-user|b-user')
    expect(buildPairKey('a-user', 'b-user')).toBe('a-user|b-user')
  })

  it('argüman sırası fark etmeksizin AYNI anahtarı üretir', () => {
    expect(buildPairKey('u1', 'u2')).toBe(buildPairKey('u2', 'u1'))
  })

  it("'|' ayracıyla iki id'yi birleştirir", () => {
    expect(buildPairKey('alice', 'bob')).toBe('alice|bob')
  })
})

describe('deriveParticipants', () => {
  it('[X.userId, O.userId] sırasını korur — koltuk sırası kaybolmaz', () => {
    expect(deriveParticipants({ X: 'x-id', O: 'o-id' })).toStrictEqual(['x-id', 'o-id'])
  })

  it('tam olarak iki elemanlı bir dizi üretir', () => {
    expect(deriveParticipants({ X: 'a', O: 'b' })).toHaveLength(2)
  })
})
