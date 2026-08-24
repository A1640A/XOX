import type { Player, TransportStatus } from '@xox/shared'
import { tr } from '@/messages/tr'

/** `sira-gostergesi` `data-sira` değeri (spec §2.0): oyun sürerken sıradaki taş, aksi hâlde `yok`. */
export function turnAttr(status: TransportStatus): Player | 'yok' {
  return status.kind === 'playing' ? status.turn : 'yok'
}

/**
 * `durum-metni` içeriği. Kural kararı YOKTUR — yalnız `TransportStatus`'u
 * (game-status.ts, `@xox/game-core`'un `GameStatus`'undan tek yönlü türetilmiş
 * taşıma tipi) `tr.game`'deki hazır metne eşler.
 */
export function statusText(status: TransportStatus, you: Player | null): string {
  if (status.kind === 'playing') {
    return status.turn === you ? tr.game.yourTurn : tr.game.opponentTurn
  }
  if (status.kind === 'draw') return tr.game.draw

  const won = status.winner === you
  switch (status.reason) {
    case 'line':
      return won ? tr.game.youWon : tr.game.youLost
    case 'resign':
      return won ? tr.game.wonByResign : tr.game.lostByResign
    case 'timeout':
      return won ? tr.game.wonByTimeout : tr.game.lostByTimeout
    case 'abandon':
      // Terk eden taraf zaten uzaklaşmıştır; kaybeden için ayrı bir metin
      // tanımlanmamış (spec §5) — genel kaybetme metnine düşülür.
      return won ? tr.game.wonByAbandon : tr.game.youLost
  }
}
