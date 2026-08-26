import { DEFAULT_BOARD_CONFIG, cellCount } from '@xox/game-core'
import type { Cell, EndReason, Player, SeatOccupant, WinLineCells } from '@xox/shared'
import { ROOM_TTL_SECONDS } from '@xox/shared'
import type { Model } from 'mongoose'
import mongoose from 'mongoose'

// mongoose CommonJS: tsx-in ESM yukleyicisi named export-lari goremez
// (`does not provide an export named 'models'`). Vitest calisir cunku Vite
// CJS interop-u farkli yapar — yani birim testler bu kirikligi GIZLER.
const { Schema, model, models } = mongoose
import { hasAtMostLength, hasLengthBetween, isNullOrLengthBetween } from './validators'

/**
 * Varsayılan tahta HÜCRE sayısı — yalnız şema `default` üretici fonksiyonları
 * için (dokümanı doğrudan `Room.create({})` ile açan savunmacı/eski yol).
 * `size`/`winLength` OPSİYONEL olduğu için (ADR-0014 kural 1) gerçek oda
 * oluşturma yolu (`rooms/create.ts`) tahtayı KENDİ `cellCount(config)`'inden
 * hesaplar; bu sabit onu GEÇERSİZ KILMAZ, yalnız "hiç config verilmedi" savunma
 * hattıdır. Üst sınır artık `121`dir (KK-B69) — ikinci kemer, bkz. `hasLengthBetween`.
 */
const DEFAULT_CELL_COUNT = cellCount(DEFAULT_BOARD_CONFIG)
/** Şema doğrulayıcılarının İKİNCİ KEMER üst sınırı — 11×11 = 121 hücre (ADR-0014 §3). */
const MAX_CELL_COUNT = 121

export type RoomState = 'waiting' | 'playing' | 'finished'

/** Odanın canlı hamle listesindeki tek kayıt (tasarım §3.2). */
export interface RoomMove {
  index: number
  by: Player
  at: Date
}

/**
 * Koltuğun tek geçerli WS bağlantısı. Takeover ve grace instance'lar arası
 * çalışmak zorunda; süreç-içi bir kayıt defteri iki oyuncu iki instance'taysa
 * hiçbir şey bilmez (tasarım §3.2/§5.4).
 */
export interface RoomPresence {
  connId: string
  since: Date
}

/** Rakip koptuğunda geri sayım hedefi — §3.1 / AS-05 (P1). */
export interface RoomDisconnected {
  seat: Player
  at: Date
  graceEndsAt: Date
}

/** Rövanş teklifi `state`'e girer — teklif odadan geçmek zorunda (§2.4). */
export interface RoomRematch {
  by: Player
  expiresAt: Date
}

/**
 * Oyunun KESİNLEŞMİŞ sonucu — `state:'finished'` yazan CAS ile **aynı**
 * güncellemede damgalanır (W1-02).
 *
 * Neden odada? `games` biten oyunun kalıcı kaydıdır (§3.1) ama canlı bağlantı
 * katmanı yalnız `rooms` dokümanını görür: change stream odayı taşır, `state`
 * mesajı odadan üretilir. Sonuç odada YOKKEN pes/süre/terk ile biten bir oyunun
 * KAZANANI taşınamıyordu — `apps/web/lib/game/room-view.ts` tahtaya bakıp
 * "berabere" demek zorunda kalıyordu (WS-001 incelemesinin bıraktığı borç).
 *
 * Alanlar `@xox/shared`'ın `TransportStatus`'unun (ADR-0001) birebir
 * karşılığıdır — yeni bir eşleme tipi TANIMLANMADI, çünkü iki ayrı şekil iki
 * ayrı dönüştürücü ve sessizce sapabilen iki kopya demekti. Okuma tarafı
 * `transportStatusSchema` ile doğrular; `reason === 'line' ⟺ line !== null`
 * değişmezi böylece çalışma zamanında da korunur.
 */
export interface RoomResult {
  kind: 'won' | 'draw'
  /** Beraberlikte `null`. */
  winner: Player | null
  /** Yalnız `reason === 'line'` iken dolu (ADR-0001). */
  line: WinLineCells | null
  /** Beraberlikte `null`. */
  reason: EndReason | null
}

/** Son emoji — version ARTIRMAZ, yalnız bir sonraki yayında bir kez okunur (P2). */
export interface RoomEmoji {
  from: Player
  emoji: string
  at: Date
}

export interface RoomDoc {
  code: string
  state: RoomState
  /**
   * Tahta konfigürasyonu — OPSİYONEL (ADR-0014 kural 1, KK-B30). `required`
   * DEĞİL, `default` DA YOK: `.lean()`/`aggregate` yollarında mongoose
   * varsayılanı uygulanmaz (gotcha örüntü 3), okuma tarafı zaten TEK kapıdan
   * (`resolveBoardConfig`) geçiyor. Alan yoksa `{3,3}` anlamına gelir.
   */
  size?: number | undefined
  /** bkz. `size`. Alan yoksa odanın boyutunun varsayılan K'sı anlamına gelir. */
  winLength?: number | undefined
  /** Koltuk sahibi: kimlik + görünen ad (KK-032 — tek round-trip). */
  seats: { X: SeatOccupant | null; O: SeatOccupant | null }
  /** Aktif WS bağlantısı — takeover ve grace bunun üzerinden çalışır. */
  presence: { X: RoomPresence | null; O: RoomPresence | null }
  board: Cell[]
  moves: RoomMove[]
  turnDeadline: Date | null
  disconnected: RoomDisconnected | null
  rematch: RoomRematch | null
  /** Oyun sürerken `null`; `state:'finished'` ile aynı yazmada dolar (W1-02). */
  result: RoomResult | null
  lastEmoji: RoomEmoji | null
  gameId: string | null
  /** Her durum değiştiren yazmada artar — emoji istisna (§5.5). */
  version: number
  startedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const seatOccupantSchema = new Schema<SeatOccupant>(
  { userId: { type: String, required: true }, name: { type: String, required: true } },
  { _id: false },
)

const presenceSchema = new Schema<RoomPresence>(
  { connId: { type: String, required: true }, since: { type: Date, required: true } },
  { _id: false },
)

const moveSchema = new Schema<RoomMove>(
  {
    // İkinci kemer üst sınırı 120 (0 tabanlı, 121 hücre — KK-B69). Oda BAŞINA
    // gerçek sınır kural motorundan gelir (`isValidMove`), şemadan değil.
    index: { type: Number, required: true, min: 0, max: MAX_CELL_COUNT - 1 },
    by: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
)

const disconnectedSchema = new Schema<RoomDisconnected>(
  {
    seat: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, required: true },
    graceEndsAt: { type: Date, required: true },
  },
  { _id: false },
)

const rematchSchema = new Schema<RoomRematch>(
  {
    by: { type: String, enum: ['X', 'O'], required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
)

const resultSchema = new Schema<RoomResult>(
  {
    kind: { type: String, enum: ['won', 'draw'], required: true },
    winner: { type: String, enum: ['X', 'O', null], default: null },
    line: {
      type: [Number],
      default: null,
      validate: {
        validator: isNullOrLengthBetween(3, 6),
        message: 'line 3 ile 6 arasında indeks içermelidir',
      },
    },
    reason: { type: String, enum: ['line', 'resign', 'timeout', 'abandon', null], default: null },
  },
  { _id: false },
)

const emojiSchema = new Schema<RoomEmoji>(
  {
    from: { type: String, enum: ['X', 'O'], required: true },
    emoji: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
)

const roomSchema = new Schema<RoomDoc>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6,
    },
    state: {
      type: String,
      enum: ['waiting', 'playing', 'finished'],
      default: 'waiting',
    },
    // `default` BİLEREK YOK (ADR-0014 kural 1) — `.lean()`/`aggregate` yolunda
    // uygulanmaz, "alan hep dolu" yanılsaması üretirdi. Okuma tarafı
    // `resolveBoardConfig`'ten geçer.
    size: { type: Number },
    winLength: { type: Number },
    seats: {
      X: { type: seatOccupantSchema, default: null },
      O: { type: seatOccupantSchema, default: null },
    },
    presence: {
      X: { type: presenceSchema, default: null },
      O: { type: presenceSchema, default: null },
    },
    board: {
      type: [{ type: String, enum: ['X', 'O', null] }],
      default: (): null[] => Array.from({ length: DEFAULT_CELL_COUNT }, () => null),
      // İKİNCİ KEMER (ADR-0014 §3): `Model.create` yolunda kaba bozulmayı
      // yakalar. `board.length === size²` DEĞİŞMEZİ burada DAYATILMAZ — o,
      // `casUpdateRoom`'un tipli `board` kanalındadır (çapraz-alan doğrulaması
      // `findOneAndUpdate`'te zaten çalışmaz).
      validate: {
        validator: hasLengthBetween(DEFAULT_CELL_COUNT, MAX_CELL_COUNT),
        message: `board ${String(DEFAULT_CELL_COUNT)} ile ${String(MAX_CELL_COUNT)} arasında hücre içermelidir`,
      },
    },
    moves: {
      type: [moveSchema],
      default: (): RoomMove[] => [],
      validate: {
        validator: hasAtMostLength(MAX_CELL_COUNT),
        message: `moves en fazla ${String(MAX_CELL_COUNT)} kayıt içerebilir`,
      },
    },
    turnDeadline: { type: Date, default: null },
    disconnected: { type: disconnectedSchema, default: null },
    rematch: { type: rematchSchema, default: null },
    result: { type: resultSchema, default: null },
    lastEmoji: { type: emojiSchema, default: null },
    gameId: { type: String, default: null },
    version: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'rooms' },
)

// Terk edilmiş odalar kendiliğinden temizlenir (B10: bilinçli — tasarım §3.6).
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ROOM_TTL_SECONDS })

export const Room: Model<RoomDoc> =
  (models['Room'] as Model<RoomDoc> | undefined) ?? model<RoomDoc>('Room', roomSchema)
