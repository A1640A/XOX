import { emptyBoard } from '@xox/game-core'
import type { Player } from '@xox/shared'
import { MOVE_TIMEOUT_SECONDS, REMATCH_OFFER_TTL_SECONDS } from '@xox/shared'
import { Game } from '../models/game'
import { Room } from '../models/room'
import type { RoomDoc } from '../models/room'
import { buildPairKey, deriveParticipants } from '../pair'
import { resolveBoardConfig } from './board-config'
import { casUpdateRoom } from './cas'
import { seatOf } from './seat'
import type { TransitionResult } from './types'

function otherSeat(seat: Player): Player {
  return seat === 'X' ? 'O' : 'X'
}

/**
 * KK-057 — teklif **TEMBEL** düşer (tasarım §5.7'nin `settleDeadlines`
 * kalıbının aynısı): ayrı bir zamanlayıcı YOKTUR, süresi geçmiş teklif ilk
 * temasta `rematch: null` olarak yazılır. Yazma olması önemli: karşı taraf
 * teklifin düştüğünü ancak change stream'den öğrenebilir (R1).
 */
async function withoutExpiredRematch(room: RoomDoc, now: number): Promise<RoomDoc> {
  const pending = room.rematch
  if (pending === null || pending.expiresAt.getTime() > now) return room

  const updated = await casUpdateRoom({
    code: room.code,
    expectedVersion: room.version,
    extraFilter: { state: 'finished' },
    set: { rematch: null },
  })
  if (updated !== null) return updated
  // Yarışı kaybettik: başkası yazdı. Uydurmak yerine taze dokümanı oku.
  return (await Room.findOne({ code: room.code }).lean()) ?? room
}

/**
 * `finished → playing` — KK-056/058. **Koltuklar TAKAS EDİLİR** ve `presence`
 * onlarla BİRLİKTE taşınır: koltuk sahipliği `seats[*].userId`'ye, bağlantı
 * geçerliliği `presence[seat].connId`'ye bakıyor (§5.4). `presence` takas
 * edilmezse rövanştan sonra her iki oyuncu da kendi koltuğunda "başka bir
 * bağlantı" görür ve canlı katman ikisini birden 4409 ile kapatır.
 *
 * `version` **SIFIRLANMAZ**: `casUpdateRoom` yalnız artırır (tasarım §5.5
 * kural 3). İstemcinin sürüm boşluğu tespiti rövanş sınırında da çalışmalı.
 *
 * Tahta odanın KENDİ `resolveBoardConfig` sonucundan sıfırlanır — `size`/
 * `winLength` alanlarına DOKUNULMAZ (ADR-0014 §4, KK-B19): rövanş yalnız
 * tahtayı temizler, konfigürasyonu DEĞİŞTİRMEZ.
 *
 * `turnDeadline` **W2-01'in devrettiği açık**: rövanşın İLK hamlesi de
 * `joinRoom`daki oyunun BAŞLADIĞI yazma ile AYNI kuralı izler — `null`
 * bırakılırsa X yeni oyunda sonsuza kadar düşünebilir (gotcha:
 * `docs/memory/api-contract.md` "Açık kalan"). `nowMs` DIŞARIDAN gelir
 * (`joinRoom`/`applyMove` konvansiyonunun aynısı): testler sahte saatle
 * deterministik koşar.
 */
async function startRematch(room: RoomDoc, nowMs: number): Promise<TransitionResult> {
  const previousX = room.seats.X
  const previousO = room.seats.O
  if (previousX === null || previousO === null) return { ok: false, code: 'ROOM_FULL' }

  const players = { X: previousO.userId, O: previousX.userId }
  const game = await Game.create({
    roomCode: room.code,
    players,
    participants: deriveParticipants(players),
    pairKey: buildPairKey(players.X, players.O),
  })

  const config = resolveBoardConfig(room)
  const updated = await casUpdateRoom({
    code: room.code,
    expectedVersion: room.version,
    extraFilter: { state: 'finished' },
    set: {
      state: 'playing',
      seats: { X: previousO, O: previousX },
      presence: { X: room.presence.O, O: room.presence.X },
      // `disconnected` de KOLTUKLA taşınır: kayıt "şu koltuktaki kişi koptu"
      // demek, koltuk etiketi değişince aynı kişiyi göstermeye devam etmeli.
      disconnected:
        room.disconnected === null
          ? null
          : { ...room.disconnected, seat: otherSeat(room.disconnected.seat) },
      moves: [],
      result: null,
      rematch: null,
      // AS-08/W2-01 devri: `joinRoom`daki satırın AYNISI — rövanşın ilk
      // hamlesi de bir son tarih taşımalı, `null` bırakılırsa süresiz kalır.
      turnDeadline: new Date(nowMs + MOVE_TIMEOUT_SECONDS * 1000),
      lastEmoji: null,
      gameId: game._id,
      startedAt: new Date(),
    },
    board: { cells: emptyBoard(config), config },
  })
  if (updated === null) {
    // Yarışı kaybettik: az önce açtığımız oyun YETİM kalmasın (aksi hâlde
    // `finishedAt: null` bir oyun sonsuza dek maç geçmişini kirletir).
    await Game.deleteOne({ _id: game._id })
    return { ok: false, code: 'SERVER_ERROR' }
  }
  return { ok: true, room: updated, events: [{ kind: 'rematch-accepted' }] }
}

/** Rövanş yüzeyinin ortak girişi: oda + koltuk + `finished` kapısı. */
async function resolve(
  code: string,
  userId: string,
): Promise<{ room: RoomDoc; seat: Player } | TransitionResult> {
  const found = await Room.findOne({ code }).lean()
  if (found === null) return { ok: false, code: 'ROOM_NOT_FOUND' }
  const seat = seatOf(found, userId)
  if (seat === null) return { ok: false, code: 'ROOM_FULL' }
  // Rövanş yalnız BİTMİŞ oyunda anlamlıdır. `GAME_OVER` ("Oyun bitti.")
  // burada tam ters şeyi söylerdi; `INVALID_MESSAGE` bu çerçevenin mevcut
  // durumda geçersiz olduğunu anlatan doğru koddur.
  if (found.state !== 'finished') return { ok: false, code: 'INVALID_MESSAGE' }
  return { room: await withoutExpiredRematch(found, Date.now()), seat }
}

function isTransitionResult(
  value: { room: RoomDoc; seat: Player } | TransitionResult,
): value is TransitionResult {
  return 'ok' in value
}

/**
 * `finished` içinde rövanş teklifi — KK-055…057.
 *
 * **Karşılıklı teklif = mutabakat (spec §3.8):** rakip zaten teklif etmişse
 * ikinci `rematch:offer` doğrudan kabul sayılır ve yeni oyun başlar. Aksi
 * hâlde iki oyuncu da "teklif ettim, bekliyorum" ekranında kilitlenirdi.
 *
 * `nowMs` opsiyonel — mevcut çağıranlar (WS handler'ları) DEĞİŞMEDEN çalışır,
 * yalnız testler sahte saat geçirebilir (`joinRoom` konvansiyonunun aynısı).
 */
export async function offerRematch(
  code: string,
  userId: string,
  nowMs: number = Date.now(),
): Promise<TransitionResult> {
  const resolved = await resolve(code, userId)
  if (isTransitionResult(resolved)) return resolved
  const { room, seat } = resolved

  const pending = room.rematch
  if (pending !== null && pending.by !== seat) return startRematch(room, nowMs)
  if (pending !== null) {
    // Kendi teklifimizin tekrarı: YAZMA YOK. Her tekrar bir CAS + bir change
    // stream olayı + odadaki her bağlantıya tam `state` üretirdi (yazma
    // amplifikasyonu kapısı — `join.ts`teki kısa devrenin aynısı).
    return { ok: true, room, events: [] }
  }

  const expiresAt = new Date(Date.now() + REMATCH_OFFER_TTL_SECONDS * 1_000)
  const updated = await casUpdateRoom({
    code,
    expectedVersion: room.version,
    extraFilter: { state: 'finished' },
    set: { rematch: { by: seat, expiresAt } },
  })
  if (updated === null) return { ok: false, code: 'SERVER_ERROR' }
  return { ok: true, room: updated, events: [{ kind: 'rematch-offered', by: seat }] }
}

/**
 * `finished → playing` — KK-056/058. Süresi geçmiş (ya da hiç olmayan) teklif
 * `REMATCH_EXPIRED` alır; kendi teklifini kabul etmek sessiz bir no-op'tur
 * (istemci indirgeyicisi bunu zaten engelliyor, sunucu uydurma bir hata
 * üretmez).
 */
export async function acceptRematch(
  code: string,
  userId: string,
  nowMs: number = Date.now(),
): Promise<TransitionResult> {
  const resolved = await resolve(code, userId)
  if (isTransitionResult(resolved)) return resolved
  const { room, seat } = resolved

  const pending = room.rematch
  if (pending === null) return { ok: false, code: 'REMATCH_EXPIRED' }
  if (pending.by === seat) return { ok: true, room, events: [] }
  return startRematch(room, nowMs)
}
