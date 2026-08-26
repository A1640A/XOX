import {
  boardFromCells,
  emptyBoard,
  evaluateStatus,
  type BoardConfig,
  type InvalidMoveReason,
} from '@xox/game-core'
import { describe, expect, it } from 'vitest'
import {
  endReasonSchema,
  forfeitStatus,
  type MoveRejectionReason,
  moveRejectionReasonSchema,
  toTransportStatus,
  transportStatusInnerSchema,
  transportStatusSchema,
  winLineSchema,
} from './game-status'

const winningBoard = boardFromCells(['X', 'X', 'X', 'O', 'O', null, null, null, null])
const drawBoard = boardFromCells(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])

describe('transportStatusSchema değişmezi: reason==="line" ⟺ line !== null', () => {
  it("reason:'resign' ile birlikte gelen çizgiyi REDDEDER", () => {
    const result = transportStatusSchema.safeParse({
      kind: 'won',
      winner: 'X',
      reason: 'resign',
      line: [0, 1, 2],
    })
    expect(result.success).toBe(false)
  })

  it("reason:'line' ile birlikte gelen null çizgiyi REDDEDER", () => {
    const result = transportStatusSchema.safeParse({
      kind: 'won',
      winner: 'X',
      reason: 'line',
      line: null,
    })
    expect(result.success).toBe(false)
  })

  it("reason:'line' + gerçek çizgiyi kabul eder", () => {
    expect(
      transportStatusSchema.safeParse({
        kind: 'won',
        winner: 'O',
        reason: 'line',
        line: [2, 4, 6],
      }).success,
    ).toBe(true)
  })

  it.each(['resign', 'timeout', 'abandon'] as const)(
    "reason:'%s' + line:null kabul edilir",
    (reason) => {
      expect(
        transportStatusSchema.safeParse({ kind: 'won', winner: 'X', reason, line: null }).success,
      ).toBe(true)
    },
  )

  it('playing ve draw varyantları değişmezden etkilenmez', () => {
    expect(transportStatusSchema.safeParse({ kind: 'playing', turn: 'X' }).success).toBe(true)
    expect(transportStatusSchema.safeParse({ kind: 'draw' }).success).toBe(true)
  })

  it('bilinmeyen kind değerini reddeder', () => {
    expect(transportStatusSchema.safeParse({ kind: 'pending' }).success).toBe(false)
  })

  it('bilinmeyen bitiş sebebini reddeder', () => {
    expect(
      transportStatusSchema.safeParse({ kind: 'won', winner: 'X', reason: 'hile', line: null })
        .success,
    ).toBe(false)
  })
})

describe('transportStatusInnerSchema', () => {
  it('discriminated union olarak kullanılabilir (ADR-0001 sonucu)', () => {
    expect(transportStatusInnerSchema.def.type).toBe('union')
  })

  it('değişmezi dayatmaz — tutarsız veriyi geçirir', () => {
    expect(
      transportStatusInnerSchema.safeParse({
        kind: 'won',
        winner: 'X',
        reason: 'resign',
        line: [0, 1, 2],
      }).success,
    ).toBe(true)
  })
})

describe('winLineSchema', () => {
  it('0..8 aralığındaki üçlüyü kabul eder', () => {
    expect(winLineSchema.safeParse([0, 4, 8]).success).toBe(true)
  })

  // cellIndexSchema'nın üst sınırı artık 120'dir (CTR-BOARD-001, 11×11 desteği) —
  // bu testin sorumluluğu SADECE dizi uzunluğunu (3..6) doğrulamaktır, hücre
  // aralığı `primitives.test.ts`'in işidir (bkz. yukarıdaki yorum, ADR-0015 §4).
  it('9 artık aralık İÇİNDEDİR (11×11) — yalnız 120 üstü reddedilir', () => {
    expect(winLineSchema.safeParse([0, 4, 9]).success).toBe(true)
    expect(winLineSchema.safeParse([0, 4, 121]).success).toBe(false)
  })

  it.each([
    [3, true],
    [4, true],
    [5, true],
    [6, true],
    [2, false],
    [7, false],
  ])('%i indeksli hat kabul durumu: %s (sınırlar ÇIPLAK: 3..6)', (length, accepted) => {
    const line = Array.from({ length }, (_unused, index) => index)
    expect(winLineSchema.safeParse(line).success).toBe(accepted)
  })

  it('iki elemanlı diziyi reddeder — alt sınır 3tür', () => {
    expect(winLineSchema.safeParse([0, 4]).success).toBe(false)
  })
})

describe('endReasonSchema', () => {
  it('tam olarak dört bitiş sebebi tanımlar', () => {
    expect(endReasonSchema.options).toEqual(['line', 'resign', 'timeout', 'abandon'])
  })
})

describe('toTransportStatus', () => {
  it("kazanan tahtada reason:'line' üretir ve çizgiyi korur", () => {
    const status = toTransportStatus(evaluateStatus(winningBoard))
    expect(status).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' })
    expect(transportStatusSchema.safeParse(status).success).toBe(true)
  })

  it('süren oyunu olduğu gibi taşır', () => {
    expect(toTransportStatus(evaluateStatus(emptyBoard()))).toEqual({ kind: 'playing', turn: 'X' })
  })

  it('beraberliği olduğu gibi taşır', () => {
    expect(toTransportStatus(evaluateStatus(drawBoard))).toEqual({ kind: 'draw' })
  })

  it('çizgiyi kopyalar — motorun donmuş dizisini paylaşmaz', () => {
    const engineStatus = evaluateStatus(winningBoard)
    const status = toTransportStatus(engineStatus)
    if (engineStatus.kind !== 'won' || status.kind !== 'won') throw new Error('kazanan bekleniyor')
    expect(status.line).not.toBe(engineStatus.line)
    expect(Object.isFrozen(status.line)).toBe(false)
  })

  it('üçten UZUN hattı KIRPMADAN taşır — eski [a,b,c] yıkımı burada ölürdü', () => {
    const config: BoardConfig = { size: 6, winLength: 5 }
    const cells = Array.from({ length: 36 }, () => null) as ('X' | 'O' | null)[]
    for (let i = 0; i < 5; i += 1) cells[i] = 'X'
    const engineStatus = evaluateStatus(boardFromCells(cells, config), config)
    const status = toTransportStatus(engineStatus)
    expect(status).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2, 3, 4], reason: 'line' })
    if (status.kind !== 'won') return
    expect(status.line).toHaveLength(5)
    expect(transportStatusSchema.safeParse(status).success).toBe(true)
  })
})

describe('forfeitStatus', () => {
  it.each(['resign', 'timeout', 'abandon'] as const)("'%s' için her zaman line:null verir", (r) => {
    const status = forfeitStatus('O', r)
    expect(status).toEqual({ kind: 'won', winner: 'O', line: null, reason: r })
    expect(transportStatusSchema.safeParse(status).success).toBe(true)
  })
})

describe('moveRejectionReasonSchema (B8)', () => {
  it('tam dört değer içerir', () => {
    expect(moveRejectionReasonSchema.options).toEqual([
      'out-of-range',
      'occupied',
      'game-over',
      'not-your-turn',
    ])
  })

  it('serbest metni reddeder', () => {
    expect(moveRejectionReasonSchema.safeParse('notYourTurn').success).toBe(false)
  })

  it("game-core'un InvalidMoveReason'ı büyürse derleme kırılır", () => {
    // Derleme zamanı sondası — `satisfies` ifadesi game-core genişlerse hata verir.
    const _: MoveRejectionReason = 'occupied' satisfies InvalidMoveReason
    const widen = (reason: InvalidMoveReason): MoveRejectionReason => reason
    expect(moveRejectionReasonSchema.safeParse(_).success).toBe(true)
    expect(widen('out-of-range')).toBe('out-of-range')
    expect(widen('game-over')).toBe('game-over')
  })
})
