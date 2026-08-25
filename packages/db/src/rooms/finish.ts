import type { Player, TransportStatus } from '@xox/shared'
import { Game } from '../models/game'
import type { GameDoc } from '../models/game'
import type { RoomDoc, RoomResult } from '../models/room'
import { User } from '../models/user'

/** Terminal taşıma durumu — `finishGame`'in gerçekten işleyebildiği daralma. */
type FinishedStatus = Extract<TransportStatus, { kind: 'won' | 'draw' }>

/**
 * `TransportStatus` → `rooms.result`. Yeni bir eşleme ŞEKLİ yok: alanlar
 * birebir taşınır, böylece okuma tarafı (`room-view.ts`) `transportStatusSchema`
 * ile doğrulayıp doğrudan kullanabilir. İki farklı şekil, sessizce sapabilen
 * iki dönüştürücü demekti (bkz. gotcha: sabitin kopyası = sessiz sapma).
 */
export function toRoomResult(status: FinishedStatus): RoomResult {
  if (status.kind === 'draw') {
    return { kind: 'draw', winner: null, line: null, reason: null }
  }
  return {
    kind: 'won',
    winner: status.winner,
    // Motorun dondurulmuş, memoize edilmiş hattına referans tutmamak için kopya.
    // Yayma hat uzunluğundan bağımsızdır (K = 3..6, ADR-0011 §4).
    line: status.line === null ? null : [...status.line],
    reason: status.reason,
  }
}

/** `$inc` yükü: kazanan `wins`, kaybeden `losses`, beraberlikte iki taraf `draws`. */
function statsWrites(
  players: GameDoc['players'],
  status: FinishedStatus,
): { userId: string; field: 'wins' | 'losses' | 'draws' }[] {
  if (status.kind === 'draw') {
    return [
      { userId: players.X, field: 'draws' },
      { userId: players.O, field: 'draws' },
    ]
  }
  const loserSeat: Player = status.winner === 'X' ? 'O' : 'X'
  return [
    { userId: players[status.winner], field: 'wins' },
    { userId: players[loserSeat], field: 'losses' },
  ]
}

/**
 * `games` CAS'ı + `users.stats` (KK-052/053, tasarım §9). Sıra:
 *
 * 1. `Game.findOneAndUpdate({ _id, finishedAt: null }, …)` — `null` dönerse
 *    **başkası zaten bitirmiştir, hiçbir şey yapılmaz.** Yarışın tek kazananı
 *    bu CAS'tır: iki instance aynı bitişi görse de sayaç bir kez artar.
 * 2. `users.stats` `$inc` (ELO/`rated` W3-01'in işi; bu tur `rated:false`).
 * 3. `settledAt` damgası.
 *
 * 2–3 arasında instance ölürse `finishedAt != null && settledAt == null` olan
 * bir oyun kalır; onarım işi v1'de YAZILMAZ (kabul edilen, ölçülebilir açık —
 * `settledAt` alanı tam bu yüzden var).
 *
 * Sayaçlar `settled.players`'tan okunur, `room.seats`'ten DEĞİL: koltuklar
 * rövanşta takas ediliyor (KK-058) ve oda dokümanı bir sonraki oyuna ait
 * olabilir; kimin hangi koltukta oynadığının otoritesi `games`'tir (B3).
 */
export async function finishGame(room: RoomDoc, status: TransportStatus): Promise<void> {
  // Tasarlanmış no-op'lar (istisna değil): sürmekte olan bir oyunun ve oyunu
  // hiç başlamamış bir odanın kesinleştirilecek sonucu yoktur.
  if (status.kind === 'playing') return
  const gameId = room.gameId
  if (gameId === null) return

  const settled = await Game.findOneAndUpdate(
    { _id: gameId, finishedAt: null },
    {
      $set: {
        board: [...room.board],
        moves: room.moves.map((move) => ({ index: move.index, by: move.by, at: move.at })),
        winner: status.kind === 'won' ? status.winner : null,
        isDraw: status.kind === 'draw',
        endReason: status.kind === 'won' ? status.reason : null,
        winLine: status.kind === 'won' ? status.line : null,
        finishedAt: new Date(),
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).lean()
  if (settled === null) return

  await User.bulkWrite(
    statsWrites(settled.players, status).map((write) => ({
      updateOne: {
        filter: { _id: write.userId },
        update: { $inc: { [`stats.${write.field}`]: 1 } },
      },
    })),
  )

  await Game.updateOne({ _id: gameId }, { $set: { settledAt: new Date() } })
}
