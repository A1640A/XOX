# XOX — Teknik Tasarım (v1)

- **Tarih:** 2026-08-24
- **Görev:** ARCH-001
- **Girdi:** `docs/superpowers/specs/2026-08-24-xox-oyun-spec.md` (SPEC-001) · `docs/memory/decisions.md`
- **Çıktı tüketicisi:** `xox-planner` → board görevleri
- **Kararlar:** `docs/adr/0001…0009`
- **Kapsam:** Spec'in §1–§5'ini **nasıl** inşa edeceğimiz. Yeni özellik eklemez, kapsam genişletmez.

> Bu doküman **normatiftir**. Bir dosya adı, bir alan adı, bir mesaj tipi burada yazılıysa
> uygulama onu birebir kullanır. "Buna benzer bir şey" yazmak sözleşme boşluğu üretir.

---

## 0. Doğrulanmış zemin (tahmin değil — bu koşuda kanıtlandı ya da resmi dokümandan okundu)

| #   | Bulgu                                                                                                                                                                         | Kaynak                                                   | Tasarıma etkisi                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Z1  | **Her açık change stream, sürücü havuzundan bir bağlantıyı `getMore` boyunca tutar.** MongoDB: "ensure that the pool size is greater than the number of open change streams." | mongodb.com/docs/manual/changeStreams                    | `maxPoolSize: 10` → **bağlantı başına stream açmak 5. oyuncuda ölür.** Instance başına **tek** stream (ADR-0002) |
| Z2  | Vercel Fluid fonksiyon **maks. süresi Hobby 300 s, Pro 300 s varsayılan / 800 s maks.** "WebSocket connections close when a Vercel Function reaches its maximum duration."    | vercel.com/docs/functions/limitations · /websockets      | WS bağlantısı **düzenli olarak ölür**. Yeniden bağlanma istisna değil **rutin**. Planlı rotasyon (ADR-0007)      |
| Z3  | `experimental_upgradeWebSocket(handler, options)` — handler **yalnız `ws` alır**, `Request` almaz. `maxPayload` varsayılanı 256 KiB.                                          | vercel.com/docs/.../vercel-functions-package             | Kimlik, upgrade'den **önce** route handler'ın kendi `Request`'inden çözülür                                      |
| Z4  | Yerel geliştirmede WS **`vc dev` ister**, `next dev` desteklemez (Next.js tek destekli çerçeve, Vercel CLI ≥ 54.14.2).                                                        | aynı sayfa                                               | `pnpm dev:ws` script'i + yerel E2E bu komutu kullanır                                                            |
| Z5  | "A single WebSocket connection is pinned to one Vercel Function instance… New WebSocket connections are **not guaranteed** to reach the same instance."                       | vercel.com/docs/functions/websockets                     | İki oyuncu farklı instance'a düşebilir → change stream fan-out zorunlu                                           |
| Z6  | Atlas ücretsiz katman: change stream **destekleniyor**, 500 bağlantı, **100 işlem/sn**, `ns` filtresinde yalnız string/regex.                                                 | mongodb.com/docs/atlas/reference/free-shared-limitations | Koleksiyon filtresi serbest; instance başına tek stream 100 ops/sn bütçesine rahat sığar                         |
| Z7  | `fullDocument:'updateLookup'` + `fullDocument.*` üzerinde `$match` = "Resume Token Not Found" riski.                                                                          | mongodb.com/docs/manual/changeStreams                    | Pipeline **yalnız `operationType`** üzerinde filtrelenir; oda kodu filtresi süreç içinde yapılır                 |
| Z8  | `@node-rs/argon2@2.1.0` `linux-x64-gnu` dahil 13 platform için önceden derlenmiş ikili yayınlar.                                                                              | npm registry (canlı sorgu)                               | Vercel'de node-gyp derlemesi yok; `argon2` (node-pre-gyp) yerine bu kullanılır                                   |
| Z9  | Auth.js Credentials sağlayıcısı **kullanıcı oluşturmaz** ve verisini adapter'a yazmaz.                                                                                        | authjs.dev/getting-started/authentication/credentials    | Kayıt **ayrı** REST uç noktasıdır; P0'da adapter kullanılmaz (ADR-0009)                                          |
| Z10 | `export const GET = auth(function GET(req) { req.auth })` route handler'da desteklenen kalıptır.                                                                              | authjs.dev/.../protecting                                | WS route'u bu sarmalayıcıyla çerez kimliğini alır                                                                |

**Doğrulanmamış, Dalga 0'da kanıtlanacak iki varsayım** (ADR-0006/0007 sonuçlar bölümünde):

- V1: `ws.close(4401, '…')` özel kapanış kodunun istemciye ulaşması (`experimental_upgradeWebSocket`
  `ws` nesnesinin `close(code, reason)` desteği).
- V2: Credentials + `session.strategy: 'jwt'` çerezinin Vercel preview'da tarayıcı kapanıp
  açıldıktan sonra sürmesi (KK-006).

---

## 1. Katman haritası — hangi mantık nerede yaşar

```
┌─────────────────────────────────────────────────────────────────────┐
│ apps/web  · apps/mobile      TAŞIMA + SUNUM                          │
│   HTTP/WS uçları, React/RN bileşenleri, hook'lar                     │
│   KURAL YOK · DURUM GEÇİŞİ YOK — yalnız çağırır ve çizer            │
└───────────────┬─────────────────────────────────┬────────────────────┘
                │                                 │
┌───────────────▼──────────────────┐  ┌───────────▼─────────────────────┐
│ packages/db     OTORİTE          │  │ packages/shared   SÖZLEŞME       │
│  Mongoose modelleri + indeksler  │  │  zod şemaları (WS + REST)        │
│  rooms/*.ts — koşullu geçişler   │  │  sabitler, testid'ler            │
│  (create/join/move/resign/…)     │  │  taşıma ↔ game-core köprüsü      │
│  ELO, stats, geçmiş sorguları    │  │  saf istemci reducer + WS taşıma │
└───────────────┬──────────────────┘  └───────────┬─────────────────────┘
                │                                 │
                └──────────────┬──────────────────┘
                               │
                ┌──────────────▼───────────────┐
                │ packages/game-core   KURAL    │
                │  DOKUNULMAZ — bitti           │
                └───────────────────────────────┘
```

**Neden otoriter geçişler `packages/db`'de?** (ADR-0003)

- `db → game-core` sınır politikası zaten izinli; `db → shared` izinli.
- Bir hamlenin doğruluğu = kural (game-core) + sıra sahipliği + koşullu yazma. Üçü tek fonksiyonda
  olmazsa "kim kontrol etti?" sorusu her PR'da yeniden sorulur.
- `apps/web` içinde olsaydı Vitest ile test etmek için Next.js request bağlamı taklit edilirdi;
  `packages/db` içinde düz `vitest run` ile **gerçek `xox_test` Atlas veritabanına karşı** koşar.
- `apps/web` böylece "zarf aç → fonksiyon çağır → sonucu yaz" kalınlığında kalır (dosya başı < 120 satır).

**Değişmez R1 (fan-out saflığı):** Bir bağlantı, **başka bir bağlantının** ürettiği hiçbir mesajı
change stream dışında almaz. Aynı instance'taki iki oyuncu için bile süreç-içi kısayol **yoktur**.
Yazan bağlantı kendi hamlesini bile change stream yankısıyla öğrenir.
→ Sonuç: Dalga 0'ın E2E'si, iki oyuncu aynı instance'a düşse **bile** fan-out yolunu kanıtlar.
Bu, "instance dağılımı garanti edilemiyor" sorununu tasarımla ortadan kaldırır.

---

## 2. Sözleşme boşluklarının kapatılması (`@xox/shared`)

Spec §8 tablosunun tamamı burada karara bağlanır. Dosyalar:

```
packages/shared/src/
  constants.ts        (genişletilir)
  ws-close.ts         (YENİ)  WS kapanış kodları
  errors.ts           (YENİ)  ErrorCode birliği — tr.errors ile birebir
  testids.ts          (YENİ)  spec §2.0 kancaları, tek kaynak
  game-status.ts      (YENİ)  game-core GameStatus ↔ taşıma tipi köprüsü
  ws-protocol.ts      (genişletilir)
  rest-contract.ts    (YENİ)  REST gövde/yanıt şemaları
  room-client.ts      (YENİ)  saf istemci reducer'ı (web+mobil ortak)
  ws-client.ts        (YENİ)  yeniden bağlanma/heartbeat taşıması (soket enjekte edilir)
  index.ts
```

### 2.1 B1 — kazanan çizgisiz galibiyet (P0 bloklayıcı)

`game-core`'un `GameStatus` tipi **değişmez**. Değişen taşıma tipidir:

```ts
// packages/shared/src/game-status.ts
export const endReasonSchema = z.enum(['line', 'resign', 'timeout', 'abandon'])
export type EndReason = z.infer<typeof endReasonSchema>

export const winLineSchema = z.tuple([cellIndexSchema, cellIndexSchema, cellIndexSchema])

export const transportStatusSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('playing'), turn: playerSchema }),
    z.object({
      kind: z.literal('won'),
      winner: playerSchema,
      line: winLineSchema.nullable(),
      reason: endReasonSchema,
    }),
    z.object({ kind: z.literal('draw') }),
  ])
  // Değişmez: çizgi VARSA sebep 'line'; sebep 'line' İSE çizgi vardır.
  .superRefine((s, ctx) => {
    if (s.kind !== 'won') return
    if ((s.reason === 'line') !== (s.line !== null)) {
      ctx.addIssue({ code: 'custom', message: "reason:'line' ile line alanı tutarsız" })
    }
  })

/** game-core saf durumundan taşıma durumuna. Tek yönlü köprü. */
export function toTransportStatus(status: GameStatus): TransportStatus
/** Pes/süre/terk galibiyeti — game-core'un bilmediği sonuçlar. */
export function forfeitStatus(
  winner: Player,
  reason: 'resign' | 'timeout' | 'abandon',
): TransportStatus
```

`shared → game-core` boundary politikası zaten izinli (`eslint.config.mjs`), yeni izin gerekmez.

**Testler (CTR-001'in kırmızı testleri):** `reason:'resign'` + `line:[0,1,2]` reddedilir ·
`reason:'line'` + `line:null` reddedilir · `toTransportStatus(evaluateStatus(kazanan tahta))`
`reason:'line'` üretir ve çizgiyi korur · `forfeitStatus` her zaman `line:null` verir.

### 2.2 B8 — reddetme sebebi kodlanmış enum

```ts
export const moveRejectionReasonSchema = z.enum([
  'out-of-range',
  'occupied',
  'game-over',
  'not-your-turn',
])
```

Derleme zamanı sondası (test dosyasında): `const _: MoveRejectionReason = 'occupied' satisfies InvalidMoveReason`
— `game-core`'un `InvalidMoveReason`'ı büyürse burası kırılır.

### 2.3 Hata kodu birliği

```ts
export const errorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'WEAK_PASSWORD',
  'INVALID_EMAIL',
  'INVALID_NAME',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'INVALID_CODE',
  'CODE_GENERATION_FAILED',
  'NOT_YOUR_TURN',
  'CELL_OCCUPIED',
  'GAME_OVER',
  'INVALID_MESSAGE',
  'SESSION_TAKEOVER',
  'REMATCH_EXPIRED',
  'RATE_LIMITED',
  'NOT_FRIENDS_ELIGIBLE',
  'SERVER_ERROR',
  'NETWORK',
])
```

`apps/web/messages/tr.ts` içindeki `errors` anahtar kümesi bu enum'la **birebir** olmalı; bunu
doğrulayan bir test UI-001 görevinde yazılır (`Record<ErrorCode, string>` tip kısıtı + çalışma
zamanı anahtar karşılaştırması). `hata-mesaji` bileşeni `data-kod={code}` yazar (spec §2.0).

### 2.4 B2 + ek gözlem — `state` mesajı

```ts
const seatOccupantSchema = z.object({ userId: z.string(), name: z.string().min(1) }).nullable()
const playersSchema = z.object({ X: seatOccupantSchema, O: seatOccupantSchema })

z.object({
  type: z.literal('state'),
  roomCode: roomCodeSchema,
  board: boardSchema,
  status: transportStatusSchema,
  players: playersSchema, // <- görünen ad EKLENDİ (KK-032, tek round-trip)
  you: playerSchema, // <- alıcının kendi koltuğu (KK-050 "Kazandın/Kaybettin")
  version: z.number().int().nonnegative(),
  turnDeadline: z.number().int().nullable(), // epoch ms · P0'da null (AS-08)
  graceEndsAt: z.number().int().nullable(), // rakip kopukken geri sayım hedefi (KK-070)
  rematch: z.object({ by: playerSchema, expiresAt: z.number().int() }).nullable(),
  serverTime: z.number().int(), // <- istemci saat sapmasını düzeltir (spec §3.10)
})
```

`serverTime` olmadan `turnDeadline` işe yaramaz: istemci saati 3 dakika ileriyse sayaç
anında sıfır gösterir. İstemci `offset = serverTime - Date.now()` tutar, geri sayımı
`deadline - (Date.now() + offset)` ile çizer.

`you` alanı olmadan istemci kendi `userId`'sini bilmek zorunda kalır; bu, oturum bilgisini
istemci JS'ine taşımak demektir. Koltuk yeterli.

**Rövanş `state`'e girdi** — spec §3.8 "kalıcı değil" kararını **davranışsal** olarak korur
(rakip ayrılınca iptal, 60 sn'de düşer) ama **taşınabilir** kılar: iki oyuncu farklı instance'ta
olduğu için teklif zaten oda dokümanından geçmek zorunda (ADR-0002 · R1). `state`'e koymamak,
Z2'deki 300 sn rotasyondan sonra teklifi görünmez yapardı. Bkz. ADR-0001 §Reddedilenler.

### 2.5 Yeni sunucu mesajları

| Mesaj               | Alanlar                                     | Kriter             |
| ------------------- | ------------------------------------------- | ------------------ |
| `move:applied`      | `index, by, version` (değişmedi)            | KK-046/047         |
| `move:rejected`     | `index, reason: MoveRejectionReason`        | KK-042/043         |
| `opponent:joined`   | `userId, seat, name`                        | KK-032             |
| `opponent:left`     | `userId, seat, graceEndsAt: number \| null` | KK-070             |
| `opponent:returned` | `seat`                                      | KK-071             |
| `game:over`         | `status: TransportStatus, endedAt: number`  | KK-050/054/072/074 |
| `rematch:offered`   | `by: Player, expiresAt: number`             | KK-055             |
| `rematch:cancelled` | `reason: 'opponent-left' \| 'expired'`      | KK-057, §3.8       |
| `chat:emoji`        | `from: Player, emoji, at: number`           | KK-122             |
| `error`             | `code: ErrorCode, message: string`          | her yer            |
| `pong`              | —                                           | KK-060             |

`opponent:left.userId` korunur (mevcut şema) ama istemci `seat` kullanır — `userId` yalnız günlük içindir.

### 2.6 WS kapanış kodları (`ws-close.ts`)

```ts
export const WS_CLOSE = {
  PROTOCOL_VIOLATION: 4400, // 3 ardışık INVALID_MESSAGE (KK-048)
  UNAUTHENTICATED: 4401, // kimlik çözülemedi (KK-008)
  FORBIDDEN: 4403, // oda dolu / koltuk yok (§3.3)
  NOT_FOUND: 4404, // oda yok ya da TTL ile silindi
  IDLE_TIMEOUT: 4408, // 3 heartbeat sessizlik
  SESSION_TAKEOVER: 4409, // aynı userId başka yerden bağlandı (§3.2)
  ROTATE: 4499, // planlı: fonksiyon süresi doluyor, hemen yeniden bağlan (Z2)
} as const
```

`4409` ve `4499` istemci davranışını **ayırır**: `4409` → yeniden bağlanma **denenmez**, ekran
salt-okunur olur (§3.2'nin sonsuz takeover savaşı kuralı). `4499` → **gecikmesiz** yeniden bağlanma
(backoff sayacı sıfırlanır). Diğer tüm kapanışlar → üstel geri çekilme.

### 2.7 Yeni sabitler

```ts
DISCONNECT_GRACE_SECONDS = 30 // §3.1 / AS-05
REMATCH_OFFER_TTL_SECONDS = 60 // KK-057
WS_IDLE_TIMEOUT_MS = WS_HEARTBEAT_MS * 3 // 75 sn — 2 kayıp heartbeat + pay
WS_ROTATE_MARGIN_MS = 10_000 // deadline'dan bu kadar önce 4499 ile kapat
WS_TICKET_TTL_SECONDS = 30 // ADR-0006
MAX_PROTOCOL_VIOLATIONS = 3 // KK-048
MOBILE_ACCESS_TTL_SECONDS = 900 // 15 dk — KK-009
MOBILE_REFRESH_TTL_SECONDS = 2_592_000 // 30 gün — KK-009
MIN_PASSWORD_LENGTH = 8 // KK-003
DISPLAY_NAME_MIN = 2
DISPLAY_NAME_MAX = 40 // KK-003 / KK-082
EMOJI_PALETTE = ['👋', '😀', '😂', '😮', '😢', '👏', '🔥', '🤝'] as const // KK-122/123
EMOJI_RATE_LIMIT = { count: 5, windowMs: 10_000 } // KK-124
ELO_K = 24
ELO_FLOOR = 100
ELO_MIN_MOVES = 3 // KK-110/112
ELO_PAIR_WINDOW_HOURS = 24
ELO_PAIR_MAX_RATED = 3 // KK-113
LEADERBOARD_MIN_RATED_GAMES = 5
LEADERBOARD_SIZE = 50 // KK-115
HISTORY_PAGE_SIZE = 20 // KK-116
ROOM_CREATE_MAX_ATTEMPTS = 5 // KK-035
```

### 2.8 Test kancaları tek kaynakta

`packages/shared/src/testids.ts` — spec §2.0'ın tamamı `as const` nesnesi olarak. Web `data-testid`,
mobil `testID`, `apps/e2e` `getByTestId` **aynı sabiti** import eder (`e2e → shared` izinli).
Hücre kancaları fonksiyondur: `cellTestId(i: number): string` → `hucre-${i}`.

---

## 3. Veri modeli (`@xox/db`)

### 3.1 Yaşayan oyun **odada**, biten oyun **games**'te

Bu, tasarımın ikinci en önemli kararıdır (ADR-0003):

- `rooms` dokümanı oyun sürerken **tek otorite**: `board`, `moves`, `version`, `turnDeadline`.
  Bir hamle = **tek** koşullu `findOneAndUpdate` = atomik + tek change stream olayı.
- `games` dokümanı oyun **başlarken** `finishedAt: null` ile açılır (KK-076'nın harfi),
  oyun sürerken **yazılmaz**, oyun biterken **bir kez** doldurulur (KK-052).
- İki koleksiyona yazan bir hamle akışı olsaydı: atomiklik yok, iki change stream, sıralama yarışı.

### 3.2 `RoomDoc` (değişiklikler **kalın**)

```ts
export interface SeatOccupant {
  userId: string
  name: string
}
export interface RoomPresence {
  connId: string
  since: Date
}

export interface RoomDoc {
  code: string
  state: 'waiting' | 'playing' | 'finished'
  seats: { X: SeatOccupant | null; O: SeatOccupant | null } // **subdoc: userId + görünen ad**
  presence: { X: RoomPresence | null; O: RoomPresence | null } // **aktif WS bağlantısı**
  board: Cell[] // **9 hücre — canlı tahta**
  moves: { index: number; by: Player; at: Date }[] // **canlı hamle listesi**
  turnDeadline: Date | null // **P1**
  disconnected: { seat: Player; at: Date; graceEndsAt: Date } | null // **P1**
  rematch: { by: Player; expiresAt: Date } | null // **P0 (rövanş)**
  lastEmoji: { from: Player; emoji: string; at: Date } | null // **P2**
  gameId: string | null
  version: number
  startedAt: Date | null // **oyun başlangıcı**
  createdAt: Date
  updatedAt: Date
}
```

`seats` neden subdoc? `state` mesajı rakip adını taşıyor (KK-032). Ad odada denormalize
edilmezse her `state` yayınında ek bir `users` sorgusu gerekir — ve `state`, Z2 yüzünden her
5 dakikada bir yeniden gönderilir. Odanın ömrü 2 saat olduğu için ad bayatlaması sınırlıdır ve
kabul edilir (ad değişikliği bir sonraki odada görünür).

`presence` neden dokümanda? Takeover (§3.2) ve grace (§3.1) **instance'lar arası** çalışmak
zorunda. Süreç-içi bir kayıt defteri iki oyuncu iki instance'taysa hiçbir şey bilmez.
`presence.X.connId` = koltuğun **tek geçerli** bağlantısı; başka her bağlantı kendini
change stream'den öğrenip 4409 ile kapanır. Detay: §5.4.

### 3.3 `GameDoc`

```ts
export interface GameDoc {
  _id: string
  roomCode: string
  players: { X: string; O: string } // **B3**
  participants: string[] // **[X.userId, O.userId] — çok anahtarlı indeks**
  pairKey: string // **sıralı `${a}|${b}` — KK-113 / KK-126**
  board: Cell[]
  moves: MoveDoc[]
  winner: Player | null
  isDraw: boolean
  endReason: EndReason | null // **B4**
  winLine: [number, number, number] | null // **B1'in kalıcı karşılığı**
  rated: boolean // **B4**
  eloDelta: { X: number; O: number } // **B4**
  finishedAt: Date | null
  settledAt: Date | null // **stats+ELO uygulandı damgası (KK-053)**
  createdAt: Date
  updatedAt: Date
}
```

`participants` + `pairKey` **türetilmiş** alanlardır ve yalnız oyun oluşturulurken yazılır.
Gerekçeleri indekstir (§3.6); `players`'tan `$or` ile sorgulamak sıralamayı indeksten düşürür.

### 3.4 `UserDoc`

```ts
_id: string // randomUUID — Auth.js adapter'ın ObjectId'siyle çakışmaz (ADR-0009)
;(name, email(unique, lowercase))
passwordHash: string // **B6** — { select: false }
stats: {
  ;(wins, losses, draws)
}
elo: number(1200)
ratedGames: number // **KK-115 eşiği için sayaç; sıralama indeksinin kısmi filtresi**
theme: 'acik' | 'koyu' // **KK-083 — sunucuda saklanır, cihazlar arası tutarlı**
;(createdAt, updatedAt)
```

`passwordHash: { select: false }` — bir `User.findById()` çağrısının hash'i yanlışlıkla JSON'a
koyması imkânsız hâle gelir. `authorize()` bilerek `.select('+passwordHash')` yazar; bu satır
kod incelemesinde göze çarpar.

### 3.5 Yeni koleksiyonlar

| Koleksiyon            | Alanlar                                                                              | Kullanım                    |
| --------------------- | ------------------------------------------------------------------------------------ | --------------------------- |
| `friendships`         | `userA, userB` (sıralı), `status: 'pending'\|'accepted'`, `requestedBy`, `createdAt` | KK-125…127                  |
| `mobileRefreshTokens` | `jti` (unique), `userId`, `expiresAt` (TTL 0)                                        | ADR-0005 döndürmeli refresh |

### 3.6 İndeksler — tam liste

```
rooms   { code: 1 }                        unique
rooms   { updatedAt: 1 }                   expireAfterSeconds = ROOM_TTL_SECONDS   (B10: bilinçli)
games   { roomCode: 1 }
games   { participants: 1, finishedAt: -1 }        KK-116/117 · çok anahtarlı, sıralamayı indeks karşılar
games   { pairKey: 1, finishedAt: -1 }             KK-113 (24 sa puanlı oyun sayımı) · KK-126
games   { finishedAt: -1 }                         (mevcut — genel raporlama)
users   { email: 1 }                       unique  KK-002 duplicate key 11000
users   { elo: -1 }                        partialFilterExpression: { ratedGames: { $gte: 5 } }   KK-115/117
friendships { userA: 1, userB: 1 }         unique
friendships { userB: 1, status: 1 }
mobileRefreshTokens { jti: 1 }             unique
mobileRefreshTokens { expiresAt: 1 }       expireAfterSeconds = 0
```

**KK-117 (COLLSCAN yok) nasıl garanti ediliyor:**

- `/api/leaderboard` → `find({ ratedGames: { $gte: 5 } }).sort({ elo: -1 }).limit(50)`.
  Sorgunun yüklemi kısmi indeksin filtresiyle **birebir** olduğu için planlayıcı kısmi indeksi
  seçer; `elo: -1` sıralaması indeksten gelir → `IXSCAN`, `SORT` aşaması yok.
- `/api/matches` → `find({ participants: uid, finishedAt: { $ne: null } }).sort({ finishedAt: -1 }).limit(20)`.
  `participants` eşitliği indeks önekidir; `finishedAt` indeksin ikinci alanıdır → hem filtre hem
  sıralama indeksten. `$ne: null` indeks anahtarı üzerinde uygulanır, doküman çekilmez.
- Her iki sorgu için `explain('executionStats')` sondası **testtir**, yorum değil.

### 3.7 Otoriter geçiş fonksiyonları — `packages/db/src/rooms/`

Her biri saf girdi → koşullu yazma → sonuç birliği. Hiçbiri Next.js bilmiyor.

```ts
// ortak dönüş biçimi — istisna fırlatmaz, ayrıştırılabilir sonuç döner
export type TransitionResult<T = RoomDoc> =
  | { ok: true; room: RoomDoc; events: RoomEvent[] }
  | { ok: false; code: ErrorCode | MoveRejectionReason }

createRoom(owner: SeatOccupant): Promise<TransitionResult>     // 5 deneme, 11000 yakalar (KK-035/036)
joinRoom(code, user: SeatOccupant, connId): Promise<TransitionResult>   // yeniden bağlanma + takeover + ROOM_FULL
detachConnection(code, seat, connId): Promise<void>            // yalnız connId hâlâ aktifse yazar
applyMove(code, userId, index): Promise<TransitionResult>      // §5.5 — CAS
resign(code, userId): Promise<TransitionResult>                // KK-054
offerRematch(code, userId) / acceptRematch(code, userId)       // KK-055…058
settleDeadlines(code, now): Promise<TransitionResult | null>   // tembel timeout+abandon (KK-075)
pushEmoji(code, seat, emoji)                                   // version ARTMAZ
finishGame(room, status): Promise<void>                        // games CAS + stats + ELO (KK-052/053)
```

`RoomEvent` = geçişin **ne olduğunu** anlatan yerel bilgi (`{kind:'moved', index, by}` gibi).
Yayın için kullanılmaz (R1: yayın change stream'den gelir); yalnız çağıran uca **anında hata**
döndürmek ve günlük yazmak içindir.

---

## 4. Oda yaşam döngüsü durum makinesi

```
                      createRoom
                          │
                          ▼
                   ┌─────────────┐
      joinRoom     │   waiting   │  seats.X dolu, seats.O boş, board boş, version=1
   (2. kullanıcı)  └──────┬──────┘
                          │  seats.O ← kullanıcı ; state←playing ; startedAt←now
                          │  gameId ← yeni Game(finishedAt:null) ; turnDeadline ← now+60sn (P1)
                          ▼
                   ┌─────────────┐
      applyMove ───│   playing   │─── settleDeadlines(timeout|abandon)
      (her hamle   └──┬───┬───┬──┘         resign
       version+1)     │   │   │
      kazanan çizgi ──┘   │   └── berabere
                          │
                          ▼
                   ┌─────────────┐
                   │  finished   │  status donuk; games dokümanı CAS ile dolduruldu
                   └──────┬──────┘
                          │  acceptRematch: koltuklar TAKAS, board sıfırlanır,
                          │  moves=[], yeni gameId, state←playing, version+1 (SIFIRLANMAZ · KK-058)
                          └───────────────► playing
```

**Geçiş tetikleyicileri ve kim yazar:**

| Geçiş                              | Tetikleyici                                 | Yazan                             | Kriter         |
| ---------------------------------- | ------------------------------------------- | --------------------------------- | -------------- |
| — → `waiting`                      | `POST /api/rooms`                           | isteği yapan                      | KK-030/031     |
| `waiting` → `playing`              | 2. kullanıcının `join` mesajı               | katılan                           | KK-032         |
| `playing` → `playing`              | `move`                                      | hamleyi yapan                     | KK-040…047     |
| `playing` → `finished` (line/draw) | `move` sonucu `evaluateStatus`              | hamleyi yapan                     | KK-050/051/052 |
| `playing` → `finished` (resign)    | `resign` mesajı                             | pes eden                          | KK-054         |
| `playing` → `finished` (timeout)   | zamanlayıcı **veya** tembel kontrol         | **bağlı olan herhangi bir taraf** | KK-074/075     |
| `playing` → `finished` (abandon)   | grace zamanlayıcısı **veya** tembel kontrol | **kalan oyuncu**                  | KK-072         |
| `finished` → `playing`             | `rematch:accept`                            | kabul eden                        | KK-056         |
| herhangi → yok                     | TTL (2 sa hareketsizlik)                    | Mongo                             | KK-076, §3.10  |

**KK-076 doğrudan bu tablodan çıkar:** hiçbir geçişi "sistem" yazmaz; her yazının bir **bağlı
istemcisi** vardır. İki taraf da bağlı değilse yazacak kimse yoktur → `finishedAt: null` kalır →
KK-077 gereği hiçbir sorguda görünmez → TTL siler. Zamanlanmış görev (cron) eklenmesi bu
değişmezi bozar; bilerek eklenmedi (ADR-0004).

**`waiting` durumunda kurucu ayrılırsa** (§3.10): `presence.X ← null` yazılır ama `disconnected`
**yazılmaz** (oyun başlamadı, grace anlamsız). Oda `waiting` kalır, kod geçerlidir, kurucu dönünce
`seats.X.userId === userId` eşleşmesiyle aynı koltuğa oturur.

---

## 5. Gerçek zamanlı katman

### 5.1 Dosya yerleşimi

```
apps/web/
  app/api/rooms/route.ts                    POST — oda kur
  app/api/rooms/[code]/route.ts             GET  — oda özeti (WS öncesi ön kontrol)
  app/api/rooms/[code]/ws/route.ts          GET  — WS upgrade (ince: kimlik + hub'a devir)
  app/api/ws/ticket/route.ts                POST — kısa ömürlü WS bileti (mobil)
  app/api/health/realtime/route.ts          GET  — change stream canlılık sondası (Dalga 0a)
  lib/auth/identity.ts                      resolveIdentity(req) — bearer | çerez | bilet
  lib/realtime/room-hub.ts                  instance başına TEK change stream + kayıt defteri
  lib/realtime/connection.ts                RoomConnection: gönderme, delta hesabı, ihlal sayacı
  lib/realtime/handlers/index.ts            mesaj tipi → handler kayıt defteri (Dalga 0'da TAM)
  lib/realtime/handlers/{join,move,resign,rematch,emoji,ping}.ts
  lib/realtime/rotate.ts                    getDeadline() → planlı 4499 kapanışı
  lib/game/deadlines.ts                     saf: dueSettlement(room, now)
```

`handlers/index.ts` Dalga 0'da **tüm** mesaj tipleriyle eksiksiz doldurulur; henüz yazılmayanlar
`error SERVER_ERROR` döndüren tek satırlık iskeletlerdir. Sebep: sonraki dalgalarda her görev
**yalnız kendi handler dosyasını** değiştirir; kayıt defteri sıcak dosya olmaktan çıkar ve iki
gerçek zamanlı görev aynı dalgada paralel gidebilir. Bu, dalga bölümlemesinin ön koşuludur.

### 5.2 WS bağlantı yaşam döngüsü

```
1  GET /api/rooms/ABC234/ws          ← tarayıcı çerezi ya da ?ticket=…
2  resolveIdentity(req)              → userId | null
   └ null  → upgrade et ve DERHAL ws.close(4401)        (KK-008)
3  Room.findOne({ code })            → yok → close(4404)
4  settleDeadlines(code, now)        → TEMBEL kontrol, mesaj işlemeden önce (KK-075)
5  joinRoom(code, user, connId)      → koltuk ata / yeniden bağlan / ROOM_FULL → close(4403)
   └ presence[seat] = { connId, since }  (koşullu yazma, version+1)
6  experimental_upgradeWebSocket(ws => …)
7  hub.subscribe(code, connection)   → instance'ın TEK change stream'ine kaydol (yeni stream AÇILMAZ)
8  connection.send(state)            → tam durum, hemen  (§3.4 / KK-064)
9  döngü:
     · gelen mesaj  → zod → settleDeadlines → handler → koşullu yazma
     · change stream olayı → delta hesapla → move:applied | state | türetilmiş olay
     · ping           → pong  (KK-060)
     · WS_IDLE_TIMEOUT_MS sessizlik → close(4408)
     · getDeadline() - now < WS_ROTATE_MARGIN_MS → close(4499)      (Z2 · ADR-0007)
10 kapanış:
     · hub.unsubscribe(code, connection)  → oda için abone kalmadıysa kayıt defterinden düş
     · abone hiç kalmadıysa → change stream KAPAT (havuz bağlantısı serbest)
     · detachConnection(code, seat, connId):
         presence[seat].connId === connId ise → presence[seat]=null,
         state==='playing' ise disconnected={seat,at,graceEndsAt=now+30sn}, version+1
         (aksi halde HİÇBİR ŞEY yazılmaz — biz zaten devredilmiştik, §3.2)
```

**4. adım her mesajda tekrarlanır**, yalnız bağlantı açılışında değil. Bu, KK-075'in "Fluid
instance'ı ölse bile sonuç kaybolmaz" garantisidir: ölü instance'ın zamanlayıcısı kaybolsa da
bir sonraki temas (rakibin hamlesi, yeniden bağlanma, hatta `ping`) sonucu kesinleştirir.

### 5.3 Change stream fan-out — tam tasarım (ADR-0002)

```ts
// apps/web/lib/realtime/room-hub.ts  — MODÜL KAPSAMI, instance başına tek örnek
const subscribers = new Map<string /*roomCode*/, Set<RoomConnection>>()
const codeById = new Map<string /*room _id*/, string /*code*/>() // delete olayları için
let stream: ChangeStream | null = null
let resumeToken: unknown = undefined
```

**Nerede açılır:** İlk `subscribe()` çağrısında (tembel). Uygulama açılışında değil — abone
olmayan bir instance havuz bağlantısı tüketmemeli (Z1).

```ts
stream = Room.watch(
  [{ $match: { operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } }],
  {
    fullDocument: 'updateLookup',
    ...(resumeToken ? { startAfter: resumeToken } : {}),
  },
)
```

**Nasıl filtrelenir:** Pipeline **yalnız `operationType`** üzerinde filtreler. Oda koduna göre
sunucu tarafı filtre **bilinçli olarak yapılmaz**:

1. Abone oda kümesi dinamiktir; her `join`/`leave`'de stream'i yeniden açmak resume token
   yönetimini ve olay kaybı riskini davet eder.
2. Z7: `fullDocument.*` üzerinde `$match` + `updateLookup` = "Resume Token Not Found" hata sınıfı.

Filtre süreç içinde tek satırdır: `const conns = subscribers.get(change.fullDocument.code)`.
Eşleşme yoksa olay düşürülür. Bu instance'a düşen fazladan olay maliyeti = bir `Map.get`.

**Kaç abonelik açık kalır:** **En fazla 1** (instance başına). Bu, tasarımın en sert
değişmezidir. `maxPoolSize: 10` ve Z1 birlikte, bağlantı-başına-stream modelini imkânsız kılar:
5 eşzamanlı oyuncu havuzun yarısını kilitlerdi, 10 oyuncu tüm sorguları durdururdu.

**Nasıl kapanır:**

- Son abone gidince `stream.close()` — havuz bağlantısı geri verilir.
- `close`/`error` olayında: `resumeToken`'ı sakla, üstel geri çekilmeyle (500 ms → 10 sn)
  `startAfter: resumeToken` ile yeniden aç.
- Yeniden açıldıktan sonra **tüm yerel abonelere zorla tam `state` yayınla** (§3.10:
  "sessizce sağır kalması yasak"). Oda dokümanı taze okunur; kaçırılmış hiçbir olay
  yeniden oynatılmaz — `state` zaten sonucu içerir (§3.4).
- `invalidate` olayı (koleksiyon düşürme) → `resumeAfter` çalışmaz, `startAfter` ile yeni
  stream (Z: MongoDB dokümanı). Pratikte yalnız `resetDatabase()` sırasında olur.

**Olaydan mesaja — bağlantı başına delta (`connection.ts`):**

```
onRoomChange(room):
  # 1. emoji önce: version DEĞİŞTİRMEZ, bu yüzden version kapısından önce bakılır
  if room.lastEmoji && room.lastEmoji.at > conn.lastEmojiAt:
      send chat:emoji ; conn.lastEmojiAt = room.lastEmoji.at

  if room.version === conn.lastVersion: return          # kendi yazımızın yankısı zaten işlendi

  # 2. türetilmiş olaylar — önceki anlık görüntüyle karşılaştır
  diff(conn.snapshot, room) →
      koltuk doldu           → opponent:joined
      disconnected null→dolu → opponent:left(graceEndsAt)
      disconnected dolu→null → opponent:returned
      rematch null→dolu      → rematch:offered
      rematch dolu→null (oyun hâlâ finished) → rematch:cancelled
      state playing→finished → game:over(status)

  # 3. tahta deltası
  if room.version === conn.lastVersion + 1 && room.moves.length === conn.lastMoveCount + 1:
      send move:applied(sonHamle, room.version)         # ince yol (KK-046)
  else:
      send state(room)                                  # boşluk / rövanş / resync (KK-047)

  conn.snapshot = room ; conn.lastVersion = room.version ; conn.lastMoveCount = room.moves.length
```

Yazan bağlantı da bu yoldan geçer (R1). `move` handler'ı istemciye **hiçbir şey göndermez**;
yalnız reddetmede `move:rejected` gönderir (reddetme veritabanına yazılmaz, dolayısıyla
change stream'den gelmez).

### 5.4 Takeover ve grace — instance'lar arası (§3.1, §3.2)

`presence[seat].connId` koltuğun tek geçerli bağlantısıdır.

- **Takeover:** yeni bağlantı `presence.X = { connId: yeni }` yazar (version+1). Change stream
  olayı **her** instance'a gider. Eski bağlantı kendi `connId`'sinin artık yazılı olmadığını
  görür → `error SESSION_TAKEOVER` + `close(4409)`. Rakip hiçbir kopma görmez çünkü
  `disconnected` hiç yazılmadı. `4409` alan istemci **yeniden bağlanmaz** (§3.2).
- **Kopma:** `detachConnection` koşullu yazar (`presence.X.connId === benimConnId`). Yalnız
  gerçekten aktif olan bağlantı `disconnected` damgası atar. Takeover edilmiş eski bağlantının
  kapanışı hiçbir şey yazmaz — aksi hâlde takeover anında sahte bir "rakip koptu" yayınlanırdı.
  Bu, klasik bir yarış hatasıdır ve koşullu yazmayla kökten kapatılmıştır.
- **Grace:** kalan oyuncunun instance'ı `setTimeout(graceEndsAt - now)` kurar. Dolunca
  `settleDeadlines` → `abandon`. Kopan oyuncu dönerse `joinRoom` `disconnected: null` yazar →
  change stream → kalan oyuncu `opponent:returned` alır, zamanlayıcısını iptal eder (KK-071).
- **Farklı odaya geçiş:** kullanıcının aynı anda tek aktif oyun bağlantısı olur. Yeni odaya
  `join` yazıldığında eski odadaki koltuğu kopmuş sayılır; eski bağlantının `close`'u normal
  grace yolunu işletir (§3.2 son madde).

### 5.5 Eşzamanlı hamle — CAS ve `version` disiplini (ADR-0003)

```ts
// packages/db/src/rooms/apply-move.ts
const room = await Room.findOne({ code }).lean()
if (!room) return { ok: false, code: 'ROOM_NOT_FOUND' }

const seat = seatOf(room, userId) // seats.X.userId === userId ?
if (seat === null) return { ok: false, code: 'ROOM_FULL' } // koltuğu yok
if (room.state !== 'playing') return { ok: false, code: 'game-over' }
if (nextPlayer(board) !== seat) return { ok: false, code: 'not-your-turn' } // KK-044
const check = isValidMove(board, index) // game-core: out-of-range | occupied | game-over
if (!check.ok) return { ok: false, code: check.reason }

const nextBoard = applyMove(board, index, seat) // game-core — SAF
const status = evaluateStatus(nextBoard) // game-core — SAF

const updated = await Room.findOneAndUpdate(
  { code, version: room.version, state: 'playing' }, // <<< KOŞUL
  {
    $set: {
      board: [...nextBoard],
      turnDeadline: status.kind === 'playing' ? new Date(now + MOVE_TIMEOUT_SECONDS * 1000) : null,
      ...(status.kind !== 'playing' ? { state: 'finished' } : {}),
    },
    $push: { moves: { index, by: seat, at: new Date(now) } },
    $inc: { version: 1 },
  },
  { returnDocument: 'after' },
)
if (updated === null) return { ok: false, code: 'not-your-turn' } // yarışı kaybettik (KK-045)
```

**`version` disiplini — dört kural:**

1. Durum değiştiren **her** yazma `$inc: { version: 1 }` içerir. İstisnası **yalnız** emoji
   (`pushEmoji`) ve `updatedAt` tazelemesidir.
2. Yazma **her zaman** `{ version: beklenen }` koşuluyla yapılır. Koşulsuz `updateOne` yasaktır
   (lint edilemez; kod incelemesi maddesi + `rooms/` içinde tek yardımcı fonksiyondan geçirilir).
3. `version` **asla** sıfırlanmaz — rövanşta bile (KK-058).
4. `version` **asla** atlamaz: tek bir CAS yalnız 1 artırır. İstemci boşluk görürse resync ister.

**Spec §3.5'in üç senaryosu buradan çıkar:**

- Sıra X'te, ikisi aynı anda gönderir → O'nun `nextPlayer` kontrolü `not-your-turn` verir; yazma
  hiç denenmez, `version` artmaz (KK-042).
- X iki hücreye aynı anda gönderir → ilki geçer; ikincisi taze okumada `nextPlayer === 'O'`
  görür → `not-your-turn` (KK-044).
- İki yazma aynı `version` ile ulaşırsa → biri 0 doküman günceller, `updated === null` → reddedilir
  (KK-045). Bu dal testte **zorlanır**: `applyMove` çağrısı arasına elle bir `version` artışı
  enjekte edilerek.

İstemci `move` mesajına `version` **koymaz** (§3.5 kararı korunur): sıra sahipliği + hücre
doluluğu tam korumadır ve protokolü sadeleştirir.

### 5.6 İstemci: iyimser güncelleme ve geri alma

Saf reducer `packages/shared/src/room-client.ts`. Web ve mobil **aynı** reducer'ı kullanır;
UI yalnız görüntüler ve olay üretir. Vitest ile DOM'suz test edilir → KK-046/047/060/061/065
birim testtir, E2E'ye bırakılmaz.

```ts
export interface RoomClientState {
  connection: 'baglaniyor' | 'bagli' | 'kopuk' | 'devredildi'
  board: Cell[]
  status: TransportStatus
  players: Players
  you: Player | null
  version: number
  pending: { index: number; by: Player } | null // data-bekliyor="true"
  turnDeadline: number | null
  serverOffsetMs: number
  graceEndsAt: number | null
  rematch: { by: Player; expiresAt: number } | null
  lastError: ErrorCode | null
}

export function roomClientReducer(
  state: RoomClientState,
  event: RoomClientEvent,
): { state: RoomClientState; effects: RoomClientEffect[] }
```

Kurallar:

| Olay                                            | Davranış                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kullanıcı hücreye bastı                         | `you === status.turn` **ve** hücre boş **ve** `connection === 'bagli'` değilse **hiçbir şey yapma** (KK-041/062: sunucuya mesaj bile gitmez). Aksi hâlde `pending` kur, `send move` |
| `move:applied`, `version === state.version + 1` | uygula, ilgili `pending`'i temizle (KK-046)                                                                                                                                         |
| `move:applied`, `version > state.version + 1`   | **uygulama** — `effects: [{type:'resync'}]` → `join` gönder (KK-047)                                                                                                                |
| `move:applied`, `version <= state.version`      | yoksay (yinelenen yankı)                                                                                                                                                            |
| `move:rejected`                                 | `pending` temizle, hücreyi boşalt, `lastError` kur (KK-046)                                                                                                                         |
| `state`                                         | tahtayı **tümüyle** değiştir, diff/merge yapma. `pending` gelen tahtada varsa onayla, yoksa **sessizce sil** (KK-065, §3.4/4-5)                                                     |
| `state.status.kind !== 'playing'`               | doğrudan sonuç ekranı; `game:over` bekleme (§3.4 ara durum)                                                                                                                         |
| soket kapandı `4409`                            | `connection: 'devredildi'`, **yeniden bağlanma yok**, tahta salt-okunur (§3.2)                                                                                                      |
| soket kapandı `4499`                            | `connection: 'baglaniyor'`, backoff sayacı **sıfır**, hemen bağlan (Z2)                                                                                                             |
| diğer kapanışlar                                | `connection: 'kopuk'`, üstel geri çekilme (KK-061)                                                                                                                                  |
| 2 heartbeat içinde `pong` yok                   | bağlantıyı kopmuş say, yeniden bağlan (KK-060)                                                                                                                                      |

Geri çekilme saf fonksiyondur ve ayrı test edilir:
`nextReconnectDelay(attempt, rng)` = `min(BASE * 2^attempt, MAX)` × `(0.8 + 0.4·rng())` (KK-061,
±%20 jitter, `rng` enjekte edilir — konvansiyon gereği).

`ws-client.ts` soketi **enjekte edilen bir fabrikayla** açar
(`createSocket: (url: string) => SocketLike`). Böylece tarayıcı `WebSocket`'i, React Native
`WebSocket`'i ve testteki sahte soket aynı kodu koşturur; `jsdom`'da gerçek soket gerekmez.

### 5.7 Hamle süresi ve terk — çift yürütme (ADR-0004)

Saf karar fonksiyonu (`apps/web/lib/game/deadlines.ts`, DOM'suz, DB'siz):

```ts
export function dueSettlement(
  room: Pick<RoomDoc, 'state' | 'turnDeadline' | 'disconnected' | 'board'>,
  now: number,
): { reason: 'timeout' | 'abandon'; loser: Player } | null
```

- `state !== 'playing'` → `null`
- `turnDeadline` geçmiş → `{ reason:'timeout', loser: nextPlayer(board) }`
- `disconnected.graceEndsAt` geçmiş → `{ reason:'abandon', loser: disconnected.seat }`
- **İkisi de geçmişse:** önce dolan kazanır; **eşitlikte `timeout`** (spec §3.7, deterministik).

İki yürütme yolu, ikisi de zorunlu:

1. **Zamanlayıcı:** bağlı bir instance `setTimeout(min(turnDeadline, graceEndsAt) - now)` kurar,
   dolunca `settleDeadlines` çağırır. Zamanlayıcı bağlantı kapanınca **iptal edilir**.
2. **Tembel kontrol:** `settleDeadlines`, gelen **her** WS mesajının işlenmesinden **önce**
   çağrılır (KK-075). Instance ölse de sonuç bir sonraki temasta kesinleşir.

`settleDeadlines` yazması da CAS'tır: `{ code, version, state: 'playing' }`. İki instance aynı
anda süreyi fark ederse yalnız biri yazar; diğeri `null` alır ve change stream'den öğrenir.

Rövanş teklifinin düşmesi (KK-057) **aynı tembel kalıptır**: `rematch.expiresAt < now` ise
`rematch: null` yazılır ve gelen `rematch:accept` `REMATCH_EXPIRED` alır. Ayrı zamanlayıcı yok.

**P0/P1 ayrımı (AS-08):** P0'da `MOVE_TIMEOUT_SECONDS` uygulanmaz; `turnDeadline` **null** yazılır
ve `dueSettlement` null deadline'ı yoksayar. Dalga 2'de tek satır (deadline hesabı) açılır —
protokol, şema ve reducer **zaten hazırdır**. Terk koruması da P1'dir; P0'da `disconnected`
damgalanır ama grace zamanlayıcısı kurulmaz.

### 5.8 Kötüye kullanım kapıları

| Kapı                    | Yer                                                                                       | Kriter     |
| ----------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| zod ayrıştırma          | her gelen mesaj, istisnasız                                                               | KK-043/048 |
| 3 ihlal → `close(4400)` | `connection.violations` sayacı                                                            | KK-048     |
| emoji beyaz listesi     | `EMOJI_PALETTE.includes(emoji)` — uzunluk kontrolü **yetmez**                             | KK-123     |
| emoji hız sınırı        | bağlantı başına kayan pencere, 10 sn / 5                                                  | KK-124     |
| `maxPayload`            | `experimental_upgradeWebSocket` seçeneği, 8 KiB'a düşürülür (varsayılan 256 KiB gereksiz) | —          |
| kayıt/giriş hız sınırı  | IP başına, Vercel Firewall kuralı (kod değil)                                             | —          |

---

## 6. Kimlik

### 6.1 Web (ADR-0009)

```
apps/web/
  auth.config.ts     kenar-güvenli: pages, callbacks.authorized, boş providers
  auth.ts            tam: Credentials({ authorize }) + session.strategy='jwt' + callbacks
  middleware.ts      auth.config.ts'i kullanır — mongoose/argon2 IMPORT ETMEZ
  lib/auth/password.ts   @node-rs/argon2 argon2id hash/verify + sahte doğrulama
  lib/auth/session.ts    getCurrentUser(): sunucu bileşenleri için
  app/api/auth/[...nextauth]/route.ts
  app/api/auth/register/route.ts
```

`middleware.ts` **ayrı** bir yapılandırma kullanmak zorundadır: Next.js middleware kenar
çalışma zamanındadır ve `mongoose` / `@node-rs/argon2` (yerel ikili) oraya giremez. Auth.js'in
belgelenmiş "split config" kalıbı: `auth.config.ts` yalnız `pages` + `callbacks.authorized`
içerir; `authorize()` implementasyonu ve veritabanı erişimi `auth.ts`'te kalır.
**Bu ayrım yapılmazsa build kenar çalışma zamanında patlar** — `gotchas.md`'ye yazıldı.

Korunan rotalar (KK-007): `/oyna/:path*`, `/oda/:path*`, `/profil`, `/siralama`, `/gecmis`,
`/arkadaslar` → `307 /giris?donus=<pathname+search>`. `/davet/:kod` **korunmaz**; kendi içinde
oturuma bakıp `/oda/<kod>` ya da `/giris?donus=/oda/<kod>` yönlendirmesi yapar (KK-121).

**Kayıt** (`POST /api/auth/register`) — Z9 gereği ayrı uç nokta:
zod doğrulama (KK-003) → `argon2id` hash → `User.create({ _id: randomUUID(), … })` →
11000 ⇒ `409 EMAIL_TAKEN` (KK-002) → `201`. İstemci sonra `signIn('credentials', …)` çağırır.

**Giriş zamanlama saldırısı (KK-005):** `authorize()` kullanıcıyı bulamazsa da **sabit bir sahte
hash'e karşı `verify` koşturur**. Aksi hâlde "kayıtlı olmayan e-posta" ~1 ms, "yanlış parola"
~50 ms sürer ve e-posta numaralandırması ölçülebilir hâle gelir. Test bu farkı ±100 ms ile ölçer.

### 6.2 Mobil köprüsü (ADR-0005)

```
mobil                          web                                  mobil
─────                          ───                                  ─────
expo-auth-session
 openAuthSessionAsync ──► GET /api/auth/mobile/authorize?state=…
                              │ oturum yok → 307 /giris?donus=<authorize URL'i>
                              │ oturum var → 307 /api/auth/mobile/callback?state=…
                              ▼
                          GET /api/auth/mobile/callback?state=…
                              │ auth() → userId
                              │ access  JWT  (aud:'xox-mobile', typ:'access',  15 dk)
                              │ refresh JWT  (aud:'xox-mobile', typ:'refresh', 30 gün, jti kayıtlı)
                              ▼
                          307 xox://auth?token=…&refresh=…&state=…  ─────►  state doğrula
                                                                            expo-secure-store
POST /api/auth/mobile/refresh { refresh } → yeni çift (jti DÖNDÜRÜLÜR, eskisi silinir)
```

- Token'lar `jose` ile HS256, anahtar `AUTH_SECRET`'ten türetilir; `aud: 'xox-mobile'` claim'i
  onları web oturum JWT'sinden **ayırır** (birinin diğeri yerine kabul edilmesi imkânsız).
- `mobileRefreshTokens` koleksiyonu TTL indeksiyle kendini temizler; `refresh` çağrısı eski
  `jti`'yi siler ve yenisini yazar → **yeniden kullanım tespiti** (silinmiş jti ile gelen istek
  401 alır).
- Deep link'te token taşımanın riski (Android'de şema ele geçirme) kabul edilmiştir; azaltıcılar:
  `state` bağlama, 15 dk access ömrü, döndürmeli refresh. PKCE kod değişimine yükseltme yolu
  ADR-0005'te yazılıdır.

### 6.3 Tek kimlik çözücü — `lib/auth/identity.ts`

```ts
export async function resolveIdentity(
  req: Request,
): Promise<{ userId: string; name: string } | null>
```

Sıra: `Authorization: Bearer` (aud `xox-mobile`, typ `access`) → Auth.js çerezi → `?ticket=`
(aud `xox-ws`, 30 sn, yalnız WS upgrade'inde). **Üç yol da aynı `userId`'ye çözülür** — KK-010'un
birim testi tam olarak budur.

Bilet neden var? `react-native-web` hedefinde (KK-090/091 doğrulama yüzeyimiz) tarayıcı
`WebSocket` API'si **özel başlık gönderemez**; `Authorization` başlığı native RN'de mümkündür ama
web hedefinde değildir. Token'ı sorgu dizesine koymak onu Vercel erişim günlüklerine yazar —
30 saniyelik tek kullanımlık bilet bu sızıntıyı önemsizleştirir. Bkz. ADR-0006.

---

## 7. REST yüzeyi

| Yöntem                | Yol                          | Gövde / yanıt                                               | Kriter         | Dalga |
| --------------------- | ---------------------------- | ----------------------------------------------------------- | -------------- | ----- |
| GET                   | `/api/health`                | `{ ok, db }`                                                | KK-100/101     | var   |
| GET                   | `/api/health/realtime`       | `{ ok, latencyMs }` — change stream canlılık sondası        | —              | 0a    |
| POST                  | `/api/auth/register`         | `{email,password,displayName}` → 201 / 400 / 409            | KK-001…004     | 0c    |
| *                     | `/api/auth/[...nextauth]`    | Auth.js                                                     | KK-005/006/011 | 0c    |
| GET                   | `/api/auth/mobile/authorize` | 307                                                         | KK-009         | 2     |
| GET                   | `/api/auth/mobile/callback`  | 307 `xox://auth?…`                                          | KK-009         | 2     |
| POST                  | `/api/auth/mobile/refresh`   | `{refresh}` → yeni çift                                     | KK-009/010     | 2     |
| POST                  | `/api/ws/ticket`             | → `{ ticket, expiresIn }`                                   | KK-010         | 0d    |
| POST                  | `/api/rooms`                 | → `{ code }` / 503 `CODE_GENERATION_FAILED`                 | KK-030/035     | 0d    |
| GET                   | `/api/rooms/[code]`          | → `{ code, state, seats, canJoin }` / 404                   | KK-033         | 0d    |
| GET                   | `/api/rooms/[code]/ws`       | WS upgrade                                                  | KK-008/040     | 0d    |
| GET/PATCH             | `/api/profile`               | `{ name, email, stats, elo, theme }` / `{name?}`/`{theme?}` | KK-080…083     | 2     |
| GET                   | `/api/leaderboard`           | ilk 50 + kendi satırın                                      | KK-115/117     | 3     |
| GET                   | `/api/matches`               | son 20                                                      | KK-116/117     | 3     |
| GET/POST/PATCH/DELETE | `/api/friends`               | istek/kabul/çıkar                                           | KK-125…127     | 3     |

Tüm gövdeler `packages/shared/src/rest-contract.ts` şemalarından geçer; sunucu doğrulaması
istemciden **bağımsızdır** (KK-003).

---

## 8. Ekranlar → dosyalar

### 8.1 Web

| Rota                                               | Dosya                          | Bileşenler                                                                                  | Dalga |
| -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | ----- |
| `/`                                                | `app/page.tsx`                 | `HomeCtas`, `JoinCodeField`                                                                 | 0c    |
| `/giris`                                           | `app/giris/page.tsx`           | `SignInForm`                                                                                | 0c    |
| `/kayit`                                           | `app/kayit/page.tsx`           | `SignUpForm`                                                                                | 0c    |
| `/oyna/bilgisayar`                                 | `app/oyna/bilgisayar/page.tsx` | `DifficultyPicker`, `Board`                                                                 | 1     |
| `/oda/[kod]`                                       | `app/oda/[kod]/page.tsx`       | `RoomScreen` = `Board`+`StatusLine`+`ConnectionBadge`+`ResultPanel`+`TurnTimer`+`EmojiTray` | 0c→3  |
| `/oda/katil`                                       | `app/oda/katil/page.tsx`       | `JoinCodeField`                                                                             | 1     |
| `/profil`                                          | `app/profil/page.tsx`          | `StatsPanel`, `NameEditor`, `ThemeToggle`                                                   | 2     |
| `/siralama` `/gecmis` `/arkadaslar` `/davet/[kod]` | aynı desen                     |                                                                                             | 3     |

Ortak: `components/board/Board.tsx` **tek** tahta bileşenidir; hem bilgisayar hem oda ekranı onu
kullanır. Girdi kapısı prop'tur (`interactive: boolean`), bileşen kural bilmez.
`components/ErrorBanner.tsx` `data-testid="hata-mesaji" data-kod={code}` yazar ve metni
`tr.errors[code]`'dan alır — bileşende gömülü metin yok.

`useRoom(code)` hook'u (`apps/web/lib/client/use-room.ts`): `ws-client` + `roomClientReducer`'ı
`useSyncExternalStore` ile React'e bağlar. **Hiçbir oyun kuralı ve hiçbir uzlaşma mantığı bu
dosyada yoktur** — yalnız abonelik köprüsü.

### 8.2 Mobil

`apps/mobile/lib/use-room.ts` aynı `ws-client` + `roomClientReducer`'ı `useSyncExternalStore` ile
sarar. Ekranlar spec §4.2'deki rotalarda; `testID` değerleri `@xox/shared/testids`'ten gelir.
`apps/mobile/messages/tr.ts` web'le **aynı anahtar ağacını** kullanır; eşbiçimi doğrulayan test
`apps/mobile` içindedir (web'in ağacını import edemez — boundaries; bu yüzden anahtar listesi
`@xox/shared/message-keys.ts` içinde tutulur ve iki taraf da ona karşı doğrulanır).

---

## 9. ELO ve sosyal katman (P2)

`packages/db/src/elo.ts` — **saf** fonksiyon, DB bilmez:

```ts
export function eloDelta(ra: number, rb: number, result: 0 | 0.5 | 1): number
// beklenen = 1 / (1 + 10^((rb-ra)/400)) ; round(K × (result - beklenen)) ; ELO_FLOOR tabanı
```

Puanlılık kararı (`isRated`) da saf fonksiyondur ve üç girdiye bakar: hamle sayısı
(`>= ELO_MIN_MOVES`), rakip insan mı, aynı çiftin son 24 saatteki puanlı oyun sayısı
(`< ELO_PAIR_MAX_RATED`). Sayım `games { pairKey, finishedAt }` indeksinden gelir (KK-113).

`finishGame` sırası (KK-053 idempotans):

```
1. Game.findOneAndUpdate({ _id: gameId, finishedAt: null }, { $set: { …sonuç…, finishedAt } })
   → null dönerse: BAŞKASI ZATEN BİTİRDİ, hiçbir şey yapma. Yarışın tek kazananı bu CAS'tır.
2. rated ise ELO deltalarını hesapla, users.elo ve ratedGames'i $inc et
3. stats sayaçlarını $inc et
4. Game.updateOne({ _id }, { $set: { settledAt: new Date() } })
```

2–4 arasında instance ölürse `finishedAt != null && settledAt == null` olan bir oyun kalır;
onarım işi **v1'de yazılmaz** ama alan bu yüzden vardır. Kabul edilen, ölçülebilir açık.

---

## 10. Gözlemlenebilirlik ve dağıtım

- Sentry **yok** (decisions.md). `@vercel/analytics` + `@vercel/speed-insights` `app/layout.tsx`'te
  (KK-104). **KK-102/KK-103 bu kararla düşer** — planner bu iki kriteri board'da
  `iptal (karar: Sentry yok)` olarak işaretlemeli, "yapılmadı" olarak değil.
- Yapılandırılmış günlük: `apps/web/lib/log.ts` — `console.warn/error` tek sarmalayıcıdan geçer
  (`no-console` yalnız bu ikisine izin veriyor), `userId`/`roomCode` etiketlenir, **parola,
  token, `MONGODB_URI` asla yazılmaz**. Maskeleme testi KK-103'ün yerine geçen kalıcı korumadır.
- `vercel.json`: WS route'u için `maxDuration` açıkça yazılır (Z2). Değer plana göre 300 (Hobby)
  ya da 800 (Pro); `rotate.ts` `getDeadline()` kullandığı için **koda gömülmez**.
- `apps/web/package.json`: `"dev:ws": "vc dev --listen 3000"` (Z4). Kök `pnpm dev` (`next dev`)
  UI çalışması için kalır; WS gerektiren yerel E2E `dev:ws` ister.

---

## 11. Bağımlılık grafiği

```
                       ┌──────────┐
                       │ CTR-001  │  shared: protokol + reducer + taşıma istemcisi
                       └────┬─────┘
        ┌───────────────────┼──────────────────────────────┐
        │                   │                              │
   ┌────▼────┐        ┌─────▼─────┐                  ┌─────▼──────┐
   │ UI-001  │(∥)     │  DB-001   │  modeller+indeks │ RT-PROBE   │(∥, bağımsız)
   │ tokens+ │        │ +rooms/   │  +geçişler       │ change     │
   │ tr.ts   │        └─────┬─────┘                  │ stream     │
   └────┬────┘              │                        │ sondası    │
        │                   │                        └────────────┘
        │            ┌──────▼──────┐
        │            │  AUTH-001   │  auth.ts, register, middleware
        │            └──────┬──────┘
        └────────┬──────────┤
                 │          │
          ┌──────▼───┐  ┌───▼──────┐
          │ UI-SKEL  │  │  WS-001  │  hub + route + handler kayıt defteri
          │  -001    │  └───┬──────┘
          └──────┬───┘      │
                 └────┬─────┘
                 ┌────▼─────┐
                 │ E2E-001  │  DALGA 0 KAPISI — gerçek preview + gerçek Atlas
                 └────┬─────┘
        ┌─────────────┼─────────────┬──────────────┐
   ┌────▼────┐  ┌─────▼────┐  ┌─────▼────┐  ┌──────▼─────┐
   │ W1-01   │  │  W1-02   │  │  W1-03   │  │   W1-04    │   (Dalga 1, tamamen paralel)
   │ bilgis. │  │ sonuç+   │  │ kopma+   │  │ oda katıl  │
   │ karşı   │  │ rövanş   │  │ resync   │  │ + hatalar  │
   └────┬────┘  └─────┬────┘  └─────┬────┘  └──────┬─────┘
        └─────────────┴──────┬──────┴──────────────┘
                    ┌────────▼────────┐
                    │    Dalga 2 (P1) │  süre+terk · profil+tema · mobil · gözlem+domain
                    └────────┬────────┘
                    ┌────────▼────────┐
                    │    Dalga 3 (P2) │  ELO+sıralama+geçmiş · emoji · arkadaşlar · davet
                    └────────┬────────┘
                    ┌────────▼────────┐
                    │    Dalga 4      │  sertleştirme: perf · güvenlik · mutasyon · kapsam
                    └─────────────────┘
```

**Kritik yol:** `CTR-001 → DB-001 → AUTH-001 → WS-001 → E2E-001`. Beş halka.
Bu zincir kısaltılamaz: her halka bir öncekinin **tipini** import eder. Kısaltma denemesi
(örn. AUTH ve WS'i paralelleştirmek) `lib/auth/identity.ts`'in iki worktree'de birden
yazılmasına ve typecheck kırılmasına yol açar.

---

## 12. Dalga bölümlemesi ve çakışma kümeleri

Kural: aynı dalgadaki görevlerin **dokunulacak dosya desenleri kesişmez**. Kesişen tek dosya
bile varsa görevler ayrı dalgaya konur.

### Dalga 0a — sözleşme ve risk (4 paralel)

| id             | başlık                                                                                         | agent              | çakışma kümesi (dokunulacak desenler)                                        |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `CTR-001`      | shared: taşıma tipi, hata kodları, testid'ler, sabitler, saf istemci reducer + WS taşıması     | `xox-dev-core`     | `packages/shared/src/**` · `packages/shared/package.json`                    |
| `UI-001`       | ui-tokens genişletme + `messages/tr.ts` tam ağaç (web+mobil) + tema değişkenleri               | `xox-designer`     | `packages/ui-tokens/**` · `apps/web/messages/**` · `apps/mobile/messages/**` |
| `OPS-002`      | `vc dev` script'i, `vercel.json` `maxDuration`, `.env.example`, preview env değişkenleri       | `xox-devops`       | `vercel.json` · `.env.example` · `package.json` · `apps/web/package.json`    |
| `RT-PROBE-001` | `/api/health/realtime` — change stream gecikme sondası; **KK-040 bütçesini UI'dan önce ölçer** | `xox-dev-realtime` | `apps/web/app/api/health/realtime/**`                                        |

`RT-PROBE-001`'in çıktısı bir **karar kapısıdır**: gözlenen gecikme p95 > 1500 ms ise
`decisions.md`'deki Redis pub/sub yedeği devreye alınır ve ADR-0002 revize edilir. Bu ölçüm
UI yazılmadan önce alınır — yanlış temele beş dalga inşa etmemek için.

### Dalga 0b — otorite (1)

| id       | başlık                                                                                                                                                 | agent             | çakışma kümesi                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------- |
| `DB-001` | `RoomDoc`/`GameDoc`/`UserDoc` yeni şemalar, tüm indeksler, `rooms/` geçişleri (`create`,`join`,`detach`,`applyMove`), `seedTestUsers` + `passwordHash` | `xox-dev-backend` | `packages/db/src/**` · `packages/db/package.json` |

deps: `CTR-001`

### Dalga 0c — kimlik ve yüzey (2 paralel)

| id            | başlık                                                                                                                         | agent             | çakışma kümesi                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH-001`    | `auth.ts`+`auth.config.ts`+`middleware.ts`, `register`, argon2id, sabit-zamanlı giriş, `lib/auth/{password,session,tokens}.ts` | `xox-dev-backend` | `apps/web/auth*.ts` · `apps/web/middleware.ts` · `apps/web/app/api/auth/**` · `apps/web/lib/auth/{password,session,tokens}.ts` |
| `UI-SKEL-001` | `/`, `/giris`, `/kayit`, `/oda/[kod]` kabuğu, `Board`, `StatusLine`, `ErrorBanner`, `useRoom` hook'u                           | `xox-dev-web`     | `apps/web/app/{page.tsx,layout.tsx,giris,kayit,oda}/**` · `apps/web/components/**` · `apps/web/lib/client/**`                  |

deps: `DB-001` (AUTH-001) · `CTR-001`+`UI-001` (UI-SKEL-001)
`UI-SKEL-001` **`@/auth` import etmez** — oturum kapısı middleware'dedir; bu, iki görevi
paralel tutan tek kuraldır.

### Dalga 0d — gerçek zamanlı (1)

| id       | başlık                                                                                                                                                                                                               | agent              | çakışma kümesi                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `WS-001` | `room-hub.ts` (tek change stream), `connection.ts` delta hesabı, `handlers/**` (**tamamı iskelet dahil**), `identity.ts`, `POST /api/rooms`, `GET /api/rooms/[code]`, WS route, `rotate.ts`, `lib/game/deadlines.ts` | `xox-dev-realtime` | `apps/web/app/api/rooms/**` · `apps/web/app/api/ws/**` · `apps/web/lib/realtime/**` · `apps/web/lib/game/**` · `apps/web/lib/auth/identity.ts` |

deps: `AUTH-001`, `DB-001`

### Dalga 0e — KAPI (1)

| id        | başlık                                                                                                                                                          | agent        | çakışma kümesi |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------- |
| `E2E-001` | Yürüyen iskelet: giriş → oda kur → 2. istemci katıl → hamle → karşıda görün. **Gerçek preview + gerçek Atlas.** `storageState` auth fixture'ı, `twoPlayers` ile | `xox-qa-e2e` | `apps/e2e/**`  |

deps: `WS-001`, `UI-SKEL-001`
**Çıkış kriteri (bu yeşil yanmadan Dalga 1 başlamaz):** KK-001, KK-006, KK-030, KK-031, KK-032,
KK-040, KK-041 preview üzerinde geçer; ölçülen fan-out gecikmesi rapora **sayı olarak** yazılır.

### Dalga 1 — P0 tamamlama (4 paralel)

| id      | başlık                                                                                     | agent              | çakışma kümesi                                                                                                                                         | kriterler  |
| ------- | ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `W1-01` | Bilgisayara karşı (tamamen istemci)                                                        | `xox-dev-web`      | `apps/web/app/oyna/**` · `apps/web/components/computer/**`                                                                                             | KK-020…027 |
| `W1-02` | Sonuç + pes + rövanş                                                                       | `xox-dev-realtime` | `packages/db/src/rooms/{resign,rematch,finish}.ts` · `apps/web/lib/realtime/handlers/{resign,rematch}.ts` · `apps/web/components/room/ResultPanel.tsx` | KK-050…058 |
| `W1-03` | Kopma, yeniden bağlanma, resync, takeover                                                  | `xox-dev-realtime` | `apps/web/lib/realtime/{presence,rotate}.ts` · `apps/web/components/room/ConnectionBadge.tsx` · `packages/db/src/rooms/detach.ts`                      | KK-060…065 |
| `W1-04` | `/oda/katil`, kod normalleştirme, `ROOM_FULL`/`INVALID_CODE`, kod çakışma yeniden denemesi | `xox-dev-web`      | `apps/web/app/oda/katil/**` · `packages/db/src/rooms/create.ts` · `apps/web/components/JoinCodeField.tsx`                                              | KK-033…036 |

`W1-02` ve `W1-03` aynı dalgada olabiliyor **çünkü** handler kayıt defteri Dalga 0'da eksiksiz
yazıldı ve her görev yalnız kendi handler dosyasına dokunuyor.

### Dalga 2 — P1 (4 paralel)

| id      | başlık                                                    | agent              | çakışma kümesi                                                                                        | kriterler               |
| ------- | --------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| `W2-01` | Hamle süresi + terk grace'i (sunucu tarafı + `TurnTimer`) | `xox-dev-realtime` | `apps/web/lib/game/**` · `packages/db/src/rooms/settle.ts` · `apps/web/components/room/TurnTimer.tsx` | KK-070…077              |
| `W2-02` | Profil, ad düzenleme, tema                                | `xox-dev-web`      | `apps/web/app/profil/**` · `apps/web/app/api/profile/**` · `apps/web/components/profile/**`           | KK-080…084              |
| `W2-03` | Mobil paritesi + mobil auth köprüsü                       | `xox-dev-mobile`   | `apps/mobile/**` · `apps/web/app/api/auth/mobile/**`                                                  | KK-009, KK-090…093      |
| `W2-04` | Analytics + Speed Insights + günlük maskeleme + domain    | `xox-devops`       | `apps/web/app/layout.tsx` · `apps/web/lib/log.ts` · Vercel ayarları                                   | KK-100/101/104, OPS-001 |

`W2-04`'ün `app/layout.tsx`'e dokunması `W2-02` ile kesişmez (profil sayfası ayrı dosya) ama
`UI-SKEL-001`'in sahibi olduğu dosyadır — Dalga 0 bittiği için serbesttir.

### Dalga 3 — P2 (4 paralel)

| id      | başlık                                  | agent              | çakışma kümesi                                                                                                                                    | kriterler       |
| ------- | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `W3-01` | ELO + `finishGame` puanlama + sıralama  | `xox-dev-backend`  | `packages/db/src/elo.ts` · `packages/db/src/rooms/finish.ts` · `apps/web/app/{siralama,api/leaderboard}/**`                                       | KK-110…115, 117 |
| `W3-02` | Maç geçmişi                             | `xox-dev-web`      | `apps/web/app/{gecmis,api/matches}/**`                                                                                                            | KK-116/117      |
| `W3-03` | Emoji paleti + hız sınırı + davet linki | `xox-dev-realtime` | `apps/web/lib/realtime/handlers/emoji.ts` · `packages/db/src/rooms/emoji.ts` · `apps/web/components/room/EmojiTray.tsx` · `apps/web/app/davet/**` | KK-120…124      |
| `W3-04` | Arkadaşlar                              | `xox-dev-backend`  | `packages/db/src/models/friendship.ts` · `apps/web/app/{arkadaslar,api/friends}/**`                                                               | KK-125…127      |

`W3-01` ve `W3-03` ikisi de `packages/db/src/rooms/` altında ama **farklı dosyalarda**
(`finish.ts` vs `emoji.ts`) — kesişim yok.

### Dalga 4 — sertleştirme

`xox-reviewer` · `xox-security` · `xox-perf` · kapsam eşikleri · `pnpm mutation` ·
mobil `[MANUEL]` KK-093 raporu.

---

## 13. Riskler ve azaltıcılar

| #   | Risk                                                                   | Olasılık                          | Azaltıcı                                                                                          | Nerede kanıtlanır         |
| --- | ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| R1  | Change stream gecikmesi KK-040'ın 1500 ms bütçesini aşar               | orta                              | `RT-PROBE-001` **UI'dan önce** ölçer; aşarsa Redis yedeği (decisions.md)                          | Dalga 0a                  |
| R2  | Havuz tükenmesi (Z1)                                                   | **yüksek → tasarımla sıfırlandı** | Instance başına tek stream; bağlantı-başına stream yasak                                          | ADR-0002 + kod incelemesi |
| R3  | 300 sn'lik fonksiyon ömrü oyunu böler (Z2)                             | **kesin**                         | Planlı `4499` rotasyonu + gecikmesiz yeniden bağlanma + tam `state`                               | ADR-0007, KK-063          |
| R4  | `ws.close(4401)` özel kodu istemciye ulaşmıyor (V1)                    | düşük                             | Dalga 0d'de doğrudan sonda; ulaşmazsa upgrade öncesi `401` döndürülür ve KK-008 metni güncellenir | Dalga 0d                  |
| R5  | Credentials + JWT çerezi preview'da sürmüyor (V2)                      | düşük                             | `session.strategy:'jwt'` açıkça yazılır; KK-006 Dalga 0e'de gerçek preview'da koşar               | Dalga 0e                  |
| R6  | Middleware kenar çalışma zamanı `mongoose`/argon2 ikilisini bundle'lar | orta                              | Split config; `auth.config.ts` yalnız kenar-güvenli                                               | Dalga 0c build            |
| R7  | Atlas ücretsiz katmanın 100 ops/sn sınırı                              | düşük                             | Hamle başına **tek** yazma; emoji `version` artırmaz; tek stream                                  | tasarım                   |
| R8  | İki dalgada aynı dosyaya iki agent                                     | orta                              | §12 çakışma kümeleri **birebir** board'a girer; planner kesişimi mekanik kontrol eder             | planner                   |

---

## 14. Spec'te değişen kararlar (analist varsayımlarının üzerine)

| Spec                                          | Değişiklik                                                                   | Gerekçe                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| §3.8 "rövanş teklifi `state`'te yok"          | **Teklif oda dokümanında ve `state` mesajında**                              | Z2 (300 sn rotasyon) ve R1 (change stream tek yol) birleşince teklif taşınamaz hâle gelirdi |
| §8 B7 "maç geçmişi `games`'ten türetilebilir" | Onaylandı; ek olarak `participants` + `pairKey` türetilmiş alanları eklendi  | KK-117'nin COLLSCAN yasağı `$or` ile sağlanamaz                                             |
| KK-102/KK-103 (Sentry)                        | **İptal** — `decisions.md` Sentry'yi kaldırdı; yerine günlük maskeleme testi | AS-02 kapandı                                                                               |
| AS-01                                         | Credentials **+ adapter yok** (P0)                                           | Z9 + `UserDoc._id: string` ile adapter'ın `ObjectId`'si çakışır (ADR-0009)                  |
| —                                             | Oyun tahtası oyun sürerken `rooms`'ta, `games` arşiv                         | Atomiklik: hamle = tek CAS = tek change stream olayı                                        |

---

## 15. Definition of Done — mimari maddeler

Bir görev "bitti" derken bunlar da doğrulanır:

1. `apps/web` içinde `evaluateStatus`/`applyMove`'un **yeniden implementasyonu yok** (KK-022);
   kural çağrısı yalnız `@xox/game-core`'dan.
2. `apps/web` içinde koşulsuz `Room.updateOne` yok — her yazma `packages/db/src/rooms/`'dan geçer.
3. Yeni her WS mesajı `serverMessageSchema`/`clientMessageSchema`'da **ve** `roomClientReducer`'ın
   tüketici tarafında ele alınmış (exhaustive switch derlemeyi kırar).
4. Yeni her hata `ErrorCode` enum'unda **ve** `tr.errors`'ta.
5. Yeni her ekran metni `messages/tr.ts`'te; bileşende Türkçe string literal yok.
6. Yeni her sorgu için `explain` çıktısı COLLSCAN içermiyor (KK-117 kapsamındakiler).
