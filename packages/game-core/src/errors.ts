export type InvalidMoveReason = 'out-of-range' | 'occupied' | 'game-over'

export class InvalidMoveError extends Error {
  readonly index: number
  readonly reason: InvalidMoveReason

  constructor(index: number, reason: InvalidMoveReason) {
    super(`Geçersiz hamle: ${String(index)} (${reason})`)
    this.name = 'InvalidMoveError'
    this.index = index
    this.reason = reason
  }
}
