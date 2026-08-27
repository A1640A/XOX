import type { BoardConfig } from '@xox/game-core'
import type { LastMove, Player, TransportStatus } from '@xox/shared'
import { moveAnnouncement, winningLineAnnouncement } from '@/components/board/announcements'
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

export interface LiveAnnouncementInput {
  readonly status: TransportStatus
  readonly you: Player | null
  /** `RoomClientState.lastMove` — `move:applied` GÜNCELLER, `state` TÜMÜYLE değiştirir. */
  readonly lastMove: LastMove | null
  readonly size: number
  readonly winLength: number
}

/**
 * `durum-metni` (`role="status" aria-live="polite"`) içeriğinin BAĞLAMI
 * (ADR-0017 §7): `board/announcements.ts`'in SAF fark-tabanlı üreticilerini
 * (`moveAnnouncement`/`winningLineAnnouncement`, `UI-BOARD-001`'in bilerek
 * bağlamadan bıraktığı iki fonksiyon) `statusText`'in genel sıra/sonuç
 * metniyle TEK bir canlı bölgede birleştirir — "Rakip 4. satır 7. sütuna
 * oynadı. Sıra sende." Tahtanın tamamı asla okunmaz, yalnız FARK.
 *
 * Öncelik: kazanan bir çizgiyle bitiş > son hamle > yalnız durum. Oyun
 * çizgiyle bittiğinde son hamlenin koordinatı değil, kazanan ÇİZGİNİN
 * koordinatları duyurulur (KK-B65) — ikisi aynı anda gösterilmez.
 */
export function liveAnnouncement(input: LiveAnnouncementInput): string {
  const base = statusText(input.status, input.you)
  const config: BoardConfig = { size: input.size, winLength: input.winLength }

  if (input.status.kind === 'won' && input.status.reason === 'line' && input.status.line !== null) {
    return `${winningLineAnnouncement(input.status.line, config)} ${base}`
  }

  if (input.lastMove !== null) {
    const by = input.lastMove.by === input.you ? 'you' : 'opponent'
    return `${moveAnnouncement(input.lastMove.index, config, by)} ${base}`
  }

  return base
}
