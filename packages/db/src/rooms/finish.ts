import { ELO_MIN_MOVES, ELO_PAIR_MAX_RATED, ELO_PAIR_WINDOW_HOURS } from '@xox/shared'
import type { Player, TransportStatus } from '@xox/shared'
import { eloDelta } from '../elo'
import type { EloOutcome } from '../elo'
import { Game } from '../models/game'
import type { GameDoc } from '../models/game'
import type { RoomDoc, RoomResult } from '../models/room'
import { User } from '../models/user'
import { resolveBoardConfig } from './board-config'

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

/** ELO formülünün "skor"u — koltuğun kendi bakış açısından 1/0.5/0 (KK-110). */
function outcomeFor(seat: Player, status: FinishedStatus): EloOutcome {
  if (status.kind === 'draw') return 0.5
  return status.winner === seat ? 1 : 0
}

/**
 * KK-112/113 — bir oyunun PUANLI sayılıp sayılmayacağı. İki bağımsız kapı:
 *
 * 1. Toplam hamle `ELO_MIN_MOVES`'tan (3) az ise puansız — anında pes ederek
 *    puan aktarımı çalışmasın.
 * 2. Aynı `pairKey` için son `ELO_PAIR_WINDOW_HOURS` (24) saatte zaten
 *    `ELO_PAIR_MAX_RATED` (3) puanlı oyun oynanmışsa sonrakiler puansızdır —
 *    stats sayaçları YİNE DE artar (çağıran bunu ayrı ele alır), yalnız ELO
 *    değişmez. Sayım `games{pairKey, finishedAt}` indeksinden gelir (§3.6).
 */
async function isEligibleForRating(
  pairKey: string,
  movesCount: number,
  nowMs: number,
): Promise<boolean> {
  if (movesCount < ELO_MIN_MOVES) return false
  const windowStart = new Date(nowMs - ELO_PAIR_WINDOW_HOURS * 60 * 60 * 1000)
  const recentRatedCount = await Game.countDocuments({
    pairKey,
    rated: true,
    finishedAt: { $gte: windowStart },
  })
  return recentRatedCount < ELO_PAIR_MAX_RATED
}

/**
 * `games` CAS'ı + `users.stats` + ELO (KK-052/053/110…114, tasarım §9). Sıra:
 *
 * 1. `Game.findOneAndUpdate({ _id, finishedAt: null }, …)` — `null` dönerse
 *    **başkası zaten bitirmiştir, hiçbir şey yapılmaz.** Yarışın tek kazananı
 *    bu CAS'tır: iki instance aynı bitişi görse de ELO da stats da bir kez
 *    uygulanır (aşağıdaki adımların TAMAMI bu `if (settled === null) return`
 *    kapısının ARKASINDADIR).
 * 2. `rated` uygunluğu (`isEligibleForRating`) hesaplanır — puanlıysa ELO
 *    deltaları `eloDelta` (saf fonksiyon, `elo.ts`) ile hesaplanır.
 * 3. `games.rated`/`games.eloDelta` yazılır; `users.stats` her zaman, `elo`/
 *    `ratedGames` yalnız puanlıysa TEK `bulkWrite`'ta `$inc` edilir.
 * 4. `settledAt` damgası.
 *
 * 2–4 arasında instance ölürse `finishedAt != null && settledAt == null` olan
 * bir oyun kalır; onarım işi v1'de YAZILMAZ (kabul edilen, ölçülebilir açık —
 * `settledAt` alanı tam bu yüzden var).
 *
 * Sayaçlar `settled.players`'tan okunur, `room.seats`'ten DEĞİL: koltuklar
 * rövanşta takas ediliyor (KK-058) ve oda dokümanı bir sonraki oyuna ait
 * olabilir; kimin hangi koltukta oynadığının otoritesi `games`'tir (B3).
 *
 * `nowMs` DIŞARIDAN gelir (`joinRoom`/`applyMove` konvansiyonunun aynısı):
 * ELO_PAIR_WINDOW_HOURS penceresi testte sahte saatle deterministik ölçülür.
 */
export async function finishGame(
  room: RoomDoc,
  status: TransportStatus,
  nowMs: number = Date.now(),
): Promise<void> {
  // Tasarlanmış no-op'lar (istisna değil): sürmekte olan bir oyunun ve oyunu
  // hiç başlamamış bir odanın kesinleştirilecek sonucu yoktur.
  if (status.kind === 'playing') return
  const gameId = room.gameId
  if (gameId === null) return

  // ADR-0014 §5/KK-B34: `games.size`/`winLength` BURADA yazılır ama HİÇBİR API
  // OKUMAZ (GET /api/matches, ELO, sıralama). Amaç tamamen ileriye dönüktür
  // (AS-B04 (b)) — eski kayıtların yanıtı bu yüzden bir uyum testiyle değil,
  // hiç okunmayarak bayt bayt aynı kalır. Değerler `resolveBoardConfig`'ten
  // geçirilmiş ÇÖZÜLMÜŞ değerlerdir, `room.size`'ın ham hâli DEĞİL.
  const { size, winLength } = resolveBoardConfig(room)

  const settled = await Game.findOneAndUpdate(
    { _id: gameId, finishedAt: null },
    {
      $set: {
        size,
        winLength,
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
  // Yarışı kaybettik: başkası (öbür yürütme yolu, öbür instance) zaten
  // bitirmiş. Buradan sonraki HİÇBİR adım (ELO dahil) çalışmaz — bu satırın
  // ALTI, ELO'nun "tam bir kez" uygulandığının TEK garantisidir.
  if (settled === null) return

  const rated = await isEligibleForRating(settled.pairKey, settled.moves.length, nowMs)

  const eloDeltas: Record<Player, number> = { X: 0, O: 0 }
  if (rated) {
    const [userX, userO] = await Promise.all([
      User.findById(settled.players.X, 'elo').lean(),
      User.findById(settled.players.O, 'elo').lean(),
    ])
    const eloX = userX?.elo ?? undefined
    const eloO = userO?.elo ?? undefined
    if (eloX !== undefined && eloO !== undefined) {
      eloDeltas.X = eloDelta(eloX, eloO, outcomeFor('X', status))
      eloDeltas.O = eloDelta(eloO, eloX, outcomeFor('O', status))
    }
  }

  await Game.updateOne({ _id: gameId }, { $set: { rated, eloDelta: eloDeltas } })

  const statsByUser = new Map(statsWrites(settled.players, status).map((w) => [w.userId, w.field]))
  const userIds: [string, Player][] = [
    [settled.players.X, 'X'],
    [settled.players.O, 'O'],
  ]
  await User.bulkWrite(
    userIds.map(([userId, seat]) => {
      const inc: Record<string, number> = {}
      const field = statsByUser.get(userId)
      if (field !== undefined) inc[`stats.${field}`] = 1
      if (rated) {
        inc['elo'] = eloDeltas[seat]
        inc['ratedGames'] = 1
      }
      return { updateOne: { filter: { _id: userId }, update: { $inc: inc } } }
    }),
  )

  await Game.updateOne({ _id: gameId }, { $set: { settledAt: new Date() } })
}
