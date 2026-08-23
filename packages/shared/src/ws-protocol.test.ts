import { describe, expect, it } from 'vitest'
import { clientMessageSchema, roomCodeSchema, serverMessageSchema } from './ws-protocol'

describe('roomCodeSchema', () => {
  it('geçerli altı karakterli kodu kabul eder', () => {
    expect(roomCodeSchema.safeParse('AB2C3D').success).toBe(true)
  })

  it('karışan karakterleri (I, O, 0, 1) reddeder', () => {
    expect(roomCodeSchema.safeParse('ABIC3D').success).toBe(false)
    expect(roomCodeSchema.safeParse('AB0C3D').success).toBe(false)
  })

  it('yanlış uzunluğu reddeder', () => {
    expect(roomCodeSchema.safeParse('AB2C3').success).toBe(false)
  })

  it('küçük harfi reddeder', () => {
    expect(roomCodeSchema.safeParse('ab2c3d').success).toBe(false)
  })
})

describe('clientMessageSchema', () => {
  it('geçerli join mesajını çözer', () => {
    const result = clientMessageSchema.safeParse({ type: 'join', roomCode: 'AB2C3D' })
    expect(result.success).toBe(true)
  })

  it('aralık dışı hamle indeksini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 9 }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'move', index: -1 }).success).toBe(false)
  })

  it('tam sayı olmayan hamle indeksini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 1.5 }).success).toBe(false)
  })

  it('bilinmeyen mesaj tipini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'hack' }).success).toBe(false)
  })

  it('aşırı uzun emojiyi reddeder', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'chat:emoji', emoji: 'x'.repeat(99) }).success,
    ).toBe(false)
  })
})

describe('serverMessageSchema', () => {
  it('state mesajını çözer', () => {
    const result = serverMessageSchema.safeParse({
      type: 'state',
      roomCode: 'AB2C3D',
      board: [null, null, null, null, null, null, null, null, null],
      status: { kind: 'playing', turn: 'X' },
      players: { X: 'u1', O: null },
      version: 1,
    })
    expect(result.success).toBe(true)
  })

  it('dokuz hücreden farklı tahtayı reddeder', () => {
    const result = serverMessageSchema.safeParse({
      type: 'state',
      roomCode: 'AB2C3D',
      board: [null, null],
      status: { kind: 'draw' },
      players: { X: 'u1', O: null },
      version: 1,
    })
    expect(result.success).toBe(false)
  })
})
