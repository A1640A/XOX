import type { Player, TransportStatus } from '@xox/shared'
import { describe, expect, it } from 'vitest'
import { statusText, turnAttr } from './status-text'

/**
 * Beklenti tablosu **elle** yazıldı — `tr.game`den TÜRETİLMEDİ. Türetilmiş bir
 * beklenti (`expect(...).toBe(tr.game.wonByResign)`) metin dosyasındaki bir
 * anahtar silinse ya da yanlış dala bağlansa bile yeşil kalırdı; burada
 * beklenen değer test edilen şeyin DIŞINDAN geliyor (spec §5 metinleri).
 */
const BEKLENEN: { status: TransportStatus; you: Player | null; metin: string }[] = [
  { status: { kind: 'playing', turn: 'X' }, you: 'X', metin: 'Sıra sende' },
  { status: { kind: 'playing', turn: 'X' }, you: 'O', metin: 'Sıra rakipte' },
  { status: { kind: 'playing', turn: 'O' }, you: null, metin: 'Sıra rakipte' },
  { status: { kind: 'draw' }, you: 'X', metin: 'Berabere.' },
  {
    status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
    you: 'X',
    metin: 'Kazandın!',
  },
  {
    status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
    you: 'O',
    metin: 'Kaybettin.',
  },
  {
    status: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
    you: 'O',
    metin: 'Rakibin pes etti — kazandın!',
  },
  {
    status: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
    you: 'X',
    metin: 'Pes ettin, oyunu kaybettin.',
  },
  {
    status: { kind: 'won', winner: 'X', line: null, reason: 'timeout' },
    you: 'X',
    metin: 'Rakibin süresi doldu — kazandın!',
  },
  {
    status: { kind: 'won', winner: 'X', line: null, reason: 'timeout' },
    you: 'O',
    metin: 'Süren doldu, oyunu kaybettin.',
  },
  {
    status: { kind: 'won', winner: 'X', line: null, reason: 'abandon' },
    you: 'X',
    metin: 'Rakibin oyunu terk etti — kazandın!',
  },
  {
    status: { kind: 'won', winner: 'X', line: null, reason: 'abandon' },
    you: 'O',
    metin: 'Kaybettin.',
  },
]

describe('statusText — sonuç metni `you` üzerinden seçilir (KK-050/054/072/074)', () => {
  it.each(BEKLENEN)('$status.kind/$status.reason · you=$you → $metin', ({ status, you, metin }) => {
    expect(statusText(status, you)).toBe(metin)
  })

  it('dört bitiş sebebi de BİRBİRİNDEN FARKLI kazanma metni verir', () => {
    const kazanan = (['line', 'resign', 'timeout', 'abandon'] as const).map((reason) =>
      statusText(
        { kind: 'won', winner: 'X', line: reason === 'line' ? [0, 1, 2] : null, reason },
        'X',
      ),
    )
    expect(new Set(kazanan).size).toBe(4)
  })

  it('you null iken hiçbir sonuç "Kazandın!" demez', () => {
    for (const reason of ['line', 'resign', 'timeout', 'abandon'] as const) {
      const metin = statusText(
        { kind: 'won', winner: 'X', line: reason === 'line' ? [0, 1, 2] : null, reason },
        null,
      )
      expect(metin).not.toContain('kazandın')
      expect(metin).not.toBe('Kazandın!')
    }
  })
})

describe('turnAttr', () => {
  it('oyun sürerken sıradaki taşı, bitince "yok" verir', () => {
    expect(turnAttr({ kind: 'playing', turn: 'O' })).toBe('O')
    expect(turnAttr({ kind: 'draw' })).toBe('yok')
    expect(turnAttr({ kind: 'won', winner: 'X', line: null, reason: 'resign' })).toBe('yok')
  })
})
