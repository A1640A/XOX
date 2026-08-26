# XOX — Değişken tahta boyutu ve kazanma uzunluğu · Teknik Tasarım

- **Tarih:** 2026-08-26 (dosya adı lead tarafından verildi)
- **Görev:** ARCH-002
- **Girdi:** `docs/superpowers/specs/2026-08-25-xox-tahta-boyutu-spec.md` (SPEC-BOARD-001, 73 kriter,
  20 edge case, 12 sözleşme boşluğu, 6 açık soru) · `docs/superpowers/specs/2026-08-24-xox-teknik-tasarim.md`
  (ARCH-001) · `docs/memory/{decisions,gotchas,conventions,api-contract}.md` · `docs/design/2026-08-25-gorsel-yonler.md`
- **Kararlar:** `docs/adr/0010…0018` (9 yeni ADR)
- **Çıktı tüketicisi:** `xox-planner` → board görevleri
- **Kapsam:** Spec'i **nasıl** inşa edeceğimiz. Yeni özellik eklemez; spec'in kapsam dışı listesi (§8) aynen geçerlidir.

> Bu doküman **normatiftir**. Bir dosya adı, bir imza, bir alan adı burada yazılıysa uygulama onu
> birebir kullanır. "Buna benzer bir şey" yazmak sözleşme boşluğu üretir.

---

## 0. Doğrulanmış zemin — okundu, varsayılmadı

Spec §0.2 kod okumasını zaten yaptı. Aşağıdakiler **bu tasarım turunda ek olarak** doğrulanan ve
en az bir kararı değiştiren bulgulardır.

| #   | Bulgu                                                                                                                                                                                                                                                                                      | Kaynak                                                                               | Tasarıma etkisi                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **`game-core` dışında `Board`'u indeksleyen tek bir üretim satırı yok.** `db/rooms/apply-move.ts` yalnız `[...nextBoard]`, `web/components/computer/game-engine.ts` yalnız tutuyor, `shared/game-status.test.ts` yalnız `evaluateStatus`'a geçiriyor.                                      | grep, tüm `apps` + `packages`                                                        | `cellAt`'in "tuple olduğu için gerekmez" gerekçesi **bugün zaten olgusal olarak yanlış**. `cellAt` dışa aktarılmak **zorunda değil** (ADR-0011) |
| D2  | Tuple tipi bugün **iki** iş yapıyor: indeks totalliği **ve** `boardFromCells` kapısının kanıtı ("`Board`'a giden tek yol budur"). Düz `readonly Cell[]` ikincisini sessizce yok eder.                                                                                                      | `board.ts:36-58`                                                                     | `Board` **markalanır** (branded), kapı korunur (ADR-0011)                                                                                       |
| D3  | **`apps/mobile` bir oyun ekranı içermiyor.** Yalnız `app/_layout.tsx`, `app/index.tsx` (statik hero) ve `messages/tr.ts`. WS istemcisi, oda akışı, tahta yok. Mobil paritesi `W2-03` kartında, hâlâ `todo`.                                                                                | dosya listesi                                                                        | E-08'in "eski mobil × yeni oda" senaryosu bugün **var olamaz**; risk yeniden çerçevelendi (ADR-0018)                                            |
| D4  | `boundaries` politikası: `e2e → shared` **yalnız**. `apps/e2e` `@xox/game-core`'u import **edemez**.                                                                                                                                                                                       | `eslint.config.mjs:200-203`                                                          | E2E kazanan hat yardımcısı `winLines`'ı **kullanamaz** → kendi çıplak aritmetiğini yazar (bu zaten doğru test tasarımı)                         |
| D5  | `game-core`'un hiçbir hedefe izni yok (`default: 'disallow'`, `game-core` için politika tanımlı değil).                                                                                                                                                                                    | `eslint.config.mjs:170-176`                                                          | `AI_BUDGET_MS` `packages/shared`'a **konamaz** (SB-07 reddedildi) — `game-core` onu okuyamaz (ADR-0013)                                         |
| D6  | `createRoom` `Room.create()` kullanıyor (doküman doğrulayıcıları **çalışır**); `casUpdateRoom` `findOneAndUpdate` kullanıyor (**atlar**, `runValidators` da geçilmiyor).                                                                                                                   | `rooms/create.ts:26`, `rooms/cas.ts:46`                                              | `board.length === size²` yalnız yazma kapısında dayatılabilir (ADR-0014)                                                                        |
| D7  | `moves.ts` yorumu: 3×3 **boş tahtada** en iyi hamle geliştirici makinesinde **515 ms**.                                                                                                                                                                                                    | `moves.ts:59`                                                                        | Bugünkü "yenilmez" yol 1000 ms tavanının yarısını harcıyor. AI-SPIKE-001 bunu kısıtlanmış tarayıcıda da ölçer (ADR-0013 §9)                     |
| D8  | Ağır rotalarda `size-limit` payı ~20 kB gzip (`heavy: 235 kB` bütçe, ölçülen 214.65 kB) ve `@xox/game-core` **tüm** rotalara sızıyor.                                                                                                                                                      | `.size-limit.mjs`, `reports/PERF-002.md`                                             | `PERF-003`, `CORE-AI-001`'in **sert ön koşulu**                                                                                                 |
| D9  | Vercel Skew Protection **Pro/Enterprise**; Next ≥ 14.1.4 + Vercel build → sıfır konfigürasyon. Doküman gezinmeleri pinlenmez; uyuşmazlıkta istemci **tam sayfa yenilemeye** düşer. Next `deploymentId` uyuşmazlığı `x-nextjs-deployment-id` başlığından tespit edip hard navigation yapar. | vercel.com/docs/skew-protection · nextjs.org/.../deploymentId (WebFetch, 2026-08-26) | E-08 birincil olarak **çerçeve katmanında** kapanır (ADR-0018). Planın Pro olup olmadığı **ölçülmedi** → kart kriteri                           |
| D10 | Yön A önizlemesi `gap: 1px` istiyor (KK-B51 ≥ 2 px istiyor), bir "Yakınlaştır" düğmesi içeriyor (KK-B50 reddetti) ve 11×11'de `hitSlop` ile 44 pt hedef öneriyor — **komşu slop'lar zorunlu olarak çakışır** (merkezler ~30 px arayla).                                                    | `docs/design/2026-08-25-gorsel-yonler.md:75-96`                                      | Üç sapma ADR-0017'de karara bağlandı                                                                                                            |

---

## 1. Katman haritası — hangi bilgi nerede yaşar

```
                       KONFİGÜRASYON KİMİN?
┌────────────────────────────────────────────────────────────────────────────┐
│ packages/game-core   KURAL                                                  │
│   BoardConfig · BOARD_MODES · parseBoardConfig · cellCount · rowOf/colOf     │
│   winLines(config) · evaluateStatus(board,config) · wouldWin(...)           │
│   AI_BUDGET_MS · CANDIDATE_RADIUS · MAX_SEARCH_DEPTH   ← motor parametresi   │
│   SIFIR BAĞIMLILIK · shared'ı IMPORT EDEMEZ                                 │
└──────────────┬─────────────────────────────────────────────────────────────┘
   game-core ←─┤
┌──────────────▼──────────────┐  ┌──────────────────────────────────────────┐
│ packages/shared  SÖZLEŞME   │  │ packages/db  OTORİTE                      │
│  boardConfigSchema (zod)    │  │  RoomDoc.size?/winLength? (OPSİYONEL)     │
│  cellIndex 0..120           │  │  resolveBoardConfig(doc)  ← TEK KAPI      │
│  board 9..121               │  │  casUpdateRoom({ board: {cells, config} })│
│  state.size/winLength/      │  │  createRoom(owner, config)                │
│    lastMove                 │  │  games.size?/winLength? (YAZILIR, OKUNMAZ)│
│  INVALID_BOARD_CONFIG       │  └──────────────────────────────────────────┘
│  TESTID +5 · DATA_ATTR +3   │
│  room-client state.config   │
└──────────────┬──────────────┘
┌──────────────▼─────────────────────────────────────────────────────────────┐
│ apps/web   TAŞIMA + SUNUM                                                   │
│  lib/game/enabled-sizes.ts   ← OPERASYONEL kapı (kill switch) — kural DEĞİL │
│  components/board/**         ← tek ızgara kod yolu, roving tabindex          │
│  components/board-config/**  ← seçici (oda kurma + bilgisayar)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**İki ayrı "izinli boyut" kavramı, bilerek ayrı yerlerde:**

| Kavram                                                           | Nerede                       | Değişir mi                                    | Kim okur                           |
| ---------------------------------------------------------------- | ---------------------------- | --------------------------------------------- | ---------------------------------- |
| **Kural**: `BOARD_MODES` = hangi kombinasyonlar geçerli          | `game-core`                  | Hayır — donmuş, testler çıplak `3,6,11` yazar | herkes                             |
| **Operasyon**: `ENABLED_BOARD_SIZES` = bugün hangileri sunuluyor | `apps/web` (ortam değişkeni) | Evet — geri alma kolu                         | yalnız `POST /api/rooms` ve seçici |

Bu ayrım yapılmazsa kill switch `game-core`'un testlerini ortama bağımlı yapar (ADR-0018).

---

## 2. `packages/game-core` — tam yüzey

### 2.1 Dosya yerleşimi

```
packages/game-core/src/
  types.ts        Board (MARKALI) · Cell · Player · WinLine (dizi) · GameStatus · Difficulty
  config.ts       YENİ · BoardConfig · BOARD_MODES · parseBoardConfig · cellCount · rowOf/colOf
  board.ts        emptyBoard · boardFromCells · boardToString · availableMoves · nextPlayer · (cellAt)
  status.ts       winLines · evaluateStatus · wouldWin
  moves.ts        isValidMove · applyMove · (placeStone)
  ai.ts           bestMove (3×3 TAM MINIMAX, DEĞİŞMEZ) · chooseMove (dağıtıcı)
  search.ts       YENİ · searchMove — aday daraltma + iteratif derinleşme + alfa-beta
  evaluate.ts     YENİ · WINDOW_WEIGHT tablosu + sezgisel değerlendirme
  ai-config.ts    YENİ · AI_BUDGET_MS · CANDIDATE_RADIUS · MAX_SEARCH_DEPTH · TERMINAL_SCORE
  errors.ts       DEĞİŞMEZ
  index.ts        yüzey (donmuş liste testiyle korunur)
```

Katman yönü korunur: `config → board → status → moves → evaluate → search → ai`.
`import-x/no-cycle` bu zinciri zaten denetliyor.

### 2.2 `config.ts` — imzalar

```ts
export interface BoardConfig {
  /** KENAR uzunluğu. 3 | 6 | 11. */
  readonly size: number
  /** Kazanmak için yan yana gereken taş (K). */
  readonly winLength: number
}

export interface BoardMode {
  readonly size: number
  readonly winLengths: readonly number[]
  readonly defaultWinLength: number
}

/** ELLE YAZILMIŞ, DONMUŞ. Formülden türetilmez (ADR-0010). */
export const BOARD_MODES: readonly BoardMode[]
export const DEFAULT_BOARD_CONFIG: BoardConfig // { size: 3, winLength: 3 }

/** HÜCRE sayısı = size². Tek türetme noktası. */
export function cellCount(config: BoardConfig): number
/** 0 tabanlı satır/sütun. Erişilebilirlik metinleri 1 ekler, bileşende değil `tr`'de. */
export function rowOf(index: number, config: BoardConfig): number
export function colOf(index: number, config: BoardConfig): number

export type BoardConfigRejection =
  | 'not-an-object'
  | 'size-not-integer'
  | 'unknown-size'
  | 'win-length-not-integer'
  | 'win-length-not-allowed'

export type BoardConfigParse =
  | { readonly ok: true; readonly config: BoardConfig }
  | { readonly ok: false; readonly reason: BoardConfigRejection }

export function parseBoardConfig(input: unknown): BoardConfigParse
```

`parseBoardConfig` davranış tablosu (KK-B05/B14/B15 — testte **çıplak** yazılır):

| Girdi                                                                        | Sonuç                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `undefined` · `null` · `{}`                                                  | `ok: true`, `{3,3}` — **hata değil**         |
| `{size:11}`                                                                  | `ok: true`, `{11,5}` (o boyutun varsayılanı) |
| `{size:6, winLength:5}`                                                      | `ok: true`, `{6,5}`                          |
| `{size:4, winLength:3}`                                                      | `unknown-size`                               |
| `{size:3, winLength:4}` · `{size:3, winLength:2}`                            | `win-length-not-allowed`                     |
| `{size:6, winLength:3}` · `{size:6, winLength:6}` · `{size:11, winLength:7}` | `win-length-not-allowed`                     |
| `{size:11.5,…}` · `{size:-3,…}`                                              | `size-not-integer` / `unknown-size`          |
| `{size:'11', winLength:'5'}`                                                 | `size-not-integer`                           |
| `42` · `'x'` · `[]`                                                          | `not-an-object`                              |

Başarılı sonuç `Object.freeze` edilir (KK-B06). Gerekçe `EMPTY_BOARD`/`WIN_LINES` ile aynı:
uzun ömürlü bir sunucu sürecinde tek bir yazma sonraki tüm oyunları bozar.

### 2.3 `types.ts` / `board.ts`

```ts
declare const boardBrand: unique symbol
/** Doğrulanmış tahta. Üretimin TEK yolu `boardFromCells`; okuma serbest. */
export type Board = readonly Cell[] & { readonly [boardBrand]: true }
export type WinLine = readonly number[]
```

```ts
/** Memoize + Object.freeze. `EMPTY_BOARD` sabiti SİLİNDİ. */
export function emptyBoard(config?: BoardConfig): Board
/** Uzunluk (config'e göre) VE her hücre değeri doğrulanır. Aksi hâlde RangeError. */
export function boardFromCells(cells: readonly Cell[], config?: BoardConfig): Board
export function boardToString(board: Board): string // düz dize, round-trip korunur
export function availableMoves(board: Board): number[]
export function nextPlayer(board: Board): Player

// PAKET-ÖZEL — index.ts dışa AKTARMAZ:
function cellAt(board: Board, index: number): Cell // board[index] ?? null  → TOTAL
```

`cellAt`'in `?? null`'u tasarımın parçasıdır: aralık dışı okuma **boş hücre** verir, `undefined`
vermez. Böylece konfigürasyon-tahta uyuşmazlığı **hayalet galibiyet** üretemez (`undefined ===
undefined` üç kez doğru olurdu). Dal testtir (`cellAt(board, 999) === null`), savunmacı değildir.

### 2.4 `status.ts`

```ts
/** Memoize (anahtar `${size}x${winLength}`), donmuş dizi + donmuş hatlar.
 *  Yalnız BOARD_MODES'taki 6 kombinasyon önbelleğe alınır. */
export function winLines(config?: BoardConfig): readonly WinLine[]

export function evaluateStatus(board: Board, config?: BoardConfig): GameStatus

/** Hızlı yol: `index`e `player` taşı konsa kazanır mıydı? Son taşın etrafında
 *  dört yön taraması; hat tablosuna BAKMAZ. Yalnız arama ağacı kullanır. */
export function wouldWin(board: Board, index: number, player: Player, config?: BoardConfig): boolean
```

Üretim sırası (ADR-0012 — **sözleşmedir**, uygulama detayı değildir):
yatay (r artan, c artan) → dikey (c artan, r artan) → köşegen ↘ → köşegen ↙.
(3,3) çıktısı bugünkü `WIN_LINES` ile **birebir aynı sekiz hat, aynı sıra**.

Hat sayıları (KK-B07, testte çıplak): `(3,3)→8 · (6,4)→54 · (6,5)→32 · (11,4)→304 · (11,5)→252 · (11,6)→204`.

**Freestyle** (§2.3): K veya fazlası kazanır; raporlanan `line` pencere tarama sırasındaki
ilktir, yani overline'da dizinin **ilk K indeksi** (KK-B24). İki hat aynı anda tamamlanırsa
`winLines` sırasındaki ilki döner (KK-B23) — ek bir öncelik kuralı yoktur.

### 2.5 `moves.ts`

```ts
export function isValidMove(board: Board, index: number, config?: BoardConfig): boolean
export function applyMove(board: Board, index: number, player: Player, config?: BoardConfig): Board
```

Reddetme sırası **korunur**: `out-of-range` → `game-over` → `occupied`. Aralık artık
`cellCount(config)`'e göredir (KK-B27: `{3,3}`'te 9 → out-of-range; `{11,5}`'te 120 geçerli,
121 → out-of-range). Sıra sahipliği **hâlâ bilerek doğrulanmaz** (`index.ts` gerekçesi aynen).

### 2.6 Yapay zekâ — iki kod yolu

```ts
/** 3×3 TAM MINIMAX. GÖVDESİ VE İMZASI DEĞİŞMEZ. WIN_SCORE = 10 ve yorumu yerinde kalır
 *  (yalnız "> BOARD_SIZE" ifadesi "> cellCount({3,3})" olarak güncellenir — KK-B48). */
export function bestMove(board: Board, player: Player): number

export interface ChooseMoveOptions {
  readonly config?: BoardConfig
  readonly budgetMs?: number
  readonly now?: () => number
}

export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty,
  rng?: () => number, // 4. KONUM KORUNDU — ai.test.ts hiç değişmez
  options?: ChooseMoveOptions,
): number
```

Dağıtım: `config.size === 3` → `bestMove` (bugünkü kod, KK-B20'nin kanıtladığı gövde).
`config.size > 3` → `searchMove`.

`searchMove` akışı (ADR-0013):

```
1  adaylar ← boş hücreler, herhangi bir taşa Chebyshev ≤ CANDIDATE_RADIUS(2)
              tahta boşsa → [merkez]                            # KK-B45: tek taşta 24 aday
2  TAKTİK TARAMA (bütçeden BAĞIMSIZ, koşulsuz)                  # KK-B46
     bir adayla hemen kazanıyorsam → onu oyna
     rakip bir adayla hemen kazanıyorsa → onu blokla
3  best ← statik sıralamanın ilk adayı                          # KK-B44: 1 ms'de bile geçerli
4  for depth = 2 … MAX_SEARCH_DEPTH:
       r ← alphaBeta(depth, deadline)      # süre kontrolü her 1024 düğümde
       if r.aborted: break                 # YARIM ITERASYON ATILIR
       best ← r.move
5  return best
```

Değerlendirme (`evaluate.ts`): her yöndeki her K-pencere için, rakip taşı varsa 0; yoksa
`WINDOW_WEIGHT[penceredekiTaşSayısı]`. Tablo **elle yazılmış, donmuş**, uzunluğu `K+1`.
Böylece yeni bir K yeni bir örüntü sınıfı doğurmaz (spec §2.2(b) endişesi doğrusala iner).
Toplam = `benim − DEFENSE_BIAS × rakibin`. Yalnız taş komşuluğundaki pencereler taranır.

Terminal puan değişmezi (KK-B48'in yeniden ifadesi):
**`TERMINAL_SCORE − MAX_SEARCH_DEPTH > MAX_HEURISTIC`** — en geç kazanç bile en iyi sezgisel
pozisyondan yüksek puan almalıdır. Testle öldürülür.

Determinizm: `unbeatable`/`hard` yolunda rastgelelik **yok**; eşitlikte en küçük indeks
(bugünkü kesin `>`). `now` enjekte edilir → testler deterministik, `game-core` G/Ç yapmaz.

### 2.7 `index.ts` — yüzey ve donması

Yeni dışa aktarımlar: `BoardConfig`, `BoardMode`, `BOARD_MODES`, `DEFAULT_BOARD_CONFIG`,
`cellCount`, `rowOf`, `colOf`, `parseBoardConfig`, `BoardConfigParse`, `BoardConfigRejection`,
`emptyBoard`, `winLines`, `wouldWin`, `AI_BUDGET_MS`, `CANDIDATE_RADIUS`, `MAX_SEARCH_DEPTH`.
Silinenler: `BOARD_SIZE`, `EMPTY_BOARD`, `WIN_LINES`.

**Yüzey testi:** `index.ts`'in export anahtar kümesi **elle yazılmış** bir listeyle karşılaştırılır.
Yüzey sessizce büyüyemez ya da küçülemez. (`knip` ölü dışa aktarımı ayrıca yakalar.)

---

## 3. `packages/shared` — protokol (tek pencere, ADR-0015/0016)

### 3.1 Değişen şemalar

| Dosya              | Değişiklik                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.ts`    | `cellIndexSchema` 0..**120** · `boardSchema` `array(cell).min(9).max(121)` · **YENİ** `boardSizeSchema` (`3\|6\|11`), `winLengthSchema` (3..6), `boardConfigSchema`        |
| `game-status.ts`   | `winLineSchema` → `array(cellIndexSchema).min(3).max(6)` · `toTransportStatus` `[a,b,c]` yerine **kopyalayarak** `[...status.line]` (**ADR-0011'de, bir dalga önce iner**) |
| `errors.ts`        | `+INVALID_BOARD_CONFIG` (20 → **21** kod; `errors.test.ts`'teki çıplak `20` → `21`)                                                                                        |
| `rest-contract.ts` | **YENİ** `roomCreateBodySchema` `{ size?, winLength? }` · `roomStateResponseSchema` `+size +winLength` (zorunlu)                                                           |
| `ws-protocol.ts`   | `stateMessageSchema` `+size +winLength` (zorunlu) `+lastMove`                                                                                                              |
| `room-client.ts`   | `RoomClientState` `+size +winLength +lastMove`; `move:applied` `lastMove`'u günceller, `state` tümüyle değiştirir                                                          |
| `message-keys.ts`  | `boardConfig` grubu (16) + `game`'e 4 + `computer`'a 3 + `errors`'a 1                                                                                                      |
| `testids.ts`       | +5 `TESTID`, +3 `DATA_ATTR`; `cellTestId` **kodu değişmez**, yalnız yorumu                                                                                                 |

### 3.2 `state` mesajının tam alan tablosu (tüketici sondasının kaynağı)

`type · roomCode · board · status · players · you · version · turnDeadline · graceEndsAt ·
rematch · serverTime · **size** · **winLength** · **lastMove**`

`lastMove: { index, by } | null` — **spec'te yoktu, tasarım ekledi** (ADR-0015 §3).
Gerekçe: Z2 gereği bağlantı ≤ 300 sn'de kesilir; `state`'te olmayan her şey rotasyondan sonra
kaybolur. `data-son-hamle` (KK-B55) 121 hücrede "rakibin hamlesini anında gör"ün tek görsel
dayanağıdır. `RoomDoc.moves`'un son elemanından üretilir; `moves` dizisinin tamamı gönderilmez.

### 3.3 Şema **sınır** değil, **şekil** korur (KK-B37/B38)

`boardSchema` 9..121 aralığını korur; `board.length === size²` odanın kendi konfigürasyonuna
karşı **sunucuda** kontrol edilir. `cellIndexSchema` 0..120'dir; aşan indeks **mevcut**
`move:rejected` `reason:'out-of-range'` ile reddedilir — protokole yeni reddetme sebebi
**eklenmez**, `moveRejectionReasonSchema` dört değerde kalır.

### 3.4 `shared` `game-core`'un DEĞERLERİNİ yeniden dışa vermez

Şema sınırları (0, 120, 9, 121, 3, 6) **çıplak yazılır**. Tutarlılık (`max === MAX_CELL_COUNT − 1`
vb.) **ayrı bir test dosyasında** iddia edilir — test dosyaları `boundaries`'ten muaftır ve
bundle'a girmez. Barrel'dan değer yeniden dışa vermek `@xox/shared`'ın her tüketicisine
`game-core`'u sokardı ve `PERF-003`'ün çözmeye çalıştığı sızıntıyı büyütürdü (D8).

### 3.5 Yük bütçesi

121 hücrelik dolu tahta ≈ 700 bayt; tüm `state` mesajı gerçek `JSON.stringify` çıktısıyla
**< 4 KiB** (KK-B70), `maxPayload` 8 KiB'ın yarısı. Ölçüm `DB-BOARD-001`'in testidir.

---

## 4. `packages/db` — kalıcılık (ADR-0014)

### 4.1 Şema değişiklikleri

```ts
export interface RoomDoc {
  // …
  size?: number // YOKSA 3 · required DEĞİL · default YOK
  winLength?: number
}
export interface GameDoc {
  // …
  size?: number // YAZILIR, hiçbir API OKUMAZ (KK-B34 yapısal olarak sağlanır)
  winLength?: number
}
```

| Doğrulayıcı                  | Bugün                    | Yeni                            |
| ---------------------------- | ------------------------ | ------------------------------- |
| `board`                      | `hasExactLength(9)`      | `hasLengthBetween(9, 121)`      |
| `moves`                      | `hasAtMostLength(9)`     | `hasAtMostLength(121)` (KK-B69) |
| `moveSchema.index`           | `min:0 max:8`            | `min:0 max:120`                 |
| `result.line`                | `isNullOrExactLength(3)` | `isNullOrLengthBetween(3, 6)`   |
| yerel `const BOARD_SIZE = 9` | var                      | **SİLİNİR** (KK-B36)            |

> Şema üst sınırı 121'dir; **oda başına** gerçek sınır `size²`'dir ve onu kural motoru sağlar
> (dolu hücreye oynanamaz). Bu ayrım kart kriterine yazılır.

### 4.2 Okuma kapısı

```ts
// packages/db/src/rooms/board-config.ts
export function resolveBoardConfig(doc: Pick<RoomDoc, 'size' | 'winLength'>): BoardConfig
```

- İki alan da yok → `{3,3}`, **sessizce** (meşru eski şekil, KK-B31)
- Var ama `parseBoardConfig` reddediyor → `console.error` + `{3,3}` (KK-B32)
- **Hiçbir tüketici `doc.size ?? 3` yazmaz.** Sonda: `grep -rn 'size ?? 3'` → 0.

### 4.3 Yazma kapısı — `casUpdateRoom` tipli tahta kanalı

```ts
export interface CasWriteInput {
  code: string
  expectedVersion: number
  extraFilter?: Record<string, unknown>
  set?: Record<string, unknown> // 'board' anahtarı YASAK (çalışma zamanı guard + test)
  unset?: Record<string, unknown>
  push?: Record<string, unknown>
  board?: { cells: readonly Cell[]; config: BoardConfig } // uzunluk BURADA doğrulanır
}
```

`board` verilirse `cells.length === cellCount(config)` doğrulanır; uymazsa **yazma yapılmadan**
reddedilir (KK-B35 sondası). Tahtaya yazan üç yol (`createRoom`, `applyMove`, `startRematch`)
bu tek noktadan geçer.

### 4.4 Geçiş fonksiyonlarındaki değişiklikler

| Fonksiyon                                          | Değişiklik                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createRoom(owner, config = DEFAULT_BOARD_CONFIG)` | `size`, `winLength` ve `cellCount(config)` uzunluğunda boş tahtayı **tek** `Room.create`'te yazar. Konfigürasyonu yazan **tek** yol budur (KK-B19)                        |
| `applyMove`                                        | `resolveBoardConfig(room)` → `boardFromCells(room.board, config)` → `isValidMove/applyMove/evaluateStatus(…, config)`; `moveRejectionReason` `cellCount(config)` kullanır |
| `startRematch`                                     | Tahtayı odanın **kendi** konfigürasyonundan sıfırlar; `size`/`winLength`'e **dokunmaz**. Sonda: iki alan bit düzeyinde aynı (KK-B18)                                      |
| `finishGame`                                       | `games`'e `size`/`winLength` yazar (okunmaz)                                                                                                                              |
| `getRoomSummary`                                   | Yanıta `size`/`winLength` ekler (SB-09)                                                                                                                                   |

### 4.5 Değişmeyenler

Yeni indeks yok · hamle başına ek Atlas işlemi yok (KK-B72) · `MOVE_TIMEOUT_SECONDS` 60 sn,
her boyutta (KK-B73) · TTL `updatedAt` üzerinde, her hamlede tazelenir · **geri dolum betiği
yok** (KK-B33/B34).

---

## 5. `apps/web`

### 5.1 REST

| Uç                      | Değişiklik                                                                                                                                                                                                                  | Kriter                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `POST /api/rooms`       | Gövde **opsiyonel** okunur (`req.json()` patlarsa `{}`) → `roomCreateBodySchema` → `parseBoardConfig` → `enabledSizes` kapısı → `createRoom(owner, config)`. Reddetme: **400** `INVALID_BOARD_CONFIG`, oda **oluşturulmaz** | KK-B14/B15/B16, E-06/E-07 |
| `GET /api/rooms/[code]` | Yanıt `size` + `winLength` taşır                                                                                                                                                                                            | KK-B17, US-B03            |

`POST /api/rooms` **gövdesiz** çağrıldığında bugünkü davranış bit düzeyinde korunur: `{3,3}`, 201.

### 5.2 Gerçek zamanlı

`lib/game/room-view.ts` → `toStateMessage` `size`, `winLength`, `lastMove` ekler.
`lib/realtime/connection.ts`'in delta mantığı **değişmez** — `move:applied` ince yolu ve
`state` tam yolu aynı; `lastMove` yalnız `state` üretiminde hesaplanır.

E-18: `boardFromCells` `RangeError` atarsa `console.error` + istemciye `SERVER_ERROR`;
oda `finished` sayılmaz, sonuç uydurulmaz.

### 5.3 `components/board/**` — tek ızgara kod yolu (ADR-0017)

```
Board.tsx            ızgara + hücreler (React.memo) + data-boyut/data-kazanma
roving-grid.ts       SAF · nextFocusIndex(current, key, config) — DOM'suz test edilir
cell-label.ts        SAF · tr.boardConfig.cellPosition'dan aria-label üretir
Marks.tsx            DEĞİŞMEZ
```

**Prop sözleşmesi:**

```ts
export interface BoardProps {
  readonly cells: readonly Cell[]
  readonly config: BoardConfig // YENİ — data-kazanma uzunluktan türetilemez
  readonly interactive: boolean
  readonly winningLine?: readonly number[] | null
  readonly pendingIndex?: number | null
  readonly lastMoveIndex?: number | null // YENİ
  readonly onCellPress?: (index: number) => void
}
```

`cells.length !== cellCount(config)` → **hata durumu render edilir** + `console.error`
(KK-B57, E-03/E-18). Bozuk ızgara asla çizilmez.

**Yerleşim** (dallanma yok):
`grid-template-columns: repeat(var(--xox-n), minmax(0, 1fr))` · tahta
`width: min(100%, var(--xox-board-max)); aspect-ratio: 1` · hücre `aspect-ratio: 1`.
`minmax(0, 1fr)` ve atalarda `min-width: 0` **zorunludur** — KK-B50'nin en olası ihlal yolu
budur. CSS'te **alt sınır yoktur**; 28/24 px belirtilen görünüm alanlarında **ölçülen**
iddialardır. Dar ekran ipucu (`tr.boardConfig.narrowScreen`) bir container query ile görünür
olur; JS ölçümü yoktur.

`gap` **tek sabit**: `--xox-grid-line: 2px`, her boyutta aynı (Yön A'nın 1 px'inden bilinçli
sapma — ADR-0017 §2).

**Erişilebilirlik:** `role=grid/row/gridcell` korunur · grid'e `aria-label` (yeni kazanç) ·
`aria-rowcount/colcount` + hücrede `aria-rowindex/colindex` · **roving tabindex** (tek tab
durağı, 3×3 dahil) · klavye haritası `roving-grid.ts`'te, kenarlarda sarma yok.

**Kazanan çizgi üç sinyal:** `data-kazanan="true"` · kazanan olmayanlarda ≥ %40 opaklık
düşüşü (yeni veri niteliği **gerekmez**, bileşen `winningLine`'ı zaten biliyor) · renkten
bağımsız ≥ 3 px dış çizgi.

**Render bütçesi:** `CellButton` `React.memo`; `onCellPress` `useCallback`; bir mesaj **≤ 2**
hücreyi yeniden render eder (KK-B71, sayaç testi).

### 5.4 `components/board-config/**` — seçici

```
BoardConfigPicker.tsx     3 boyut düğmesi (aria-pressed) + K seçici + özet
board-config-state.ts     SAF · applySizeChange(state, size) → K izinli değilse o boyutun
                          varsayılanına DÜŞER (KK-B13) — ekranda hiçbir anda geçersiz
                          kombinasyon görünmez
use-board-modes.ts        Seçenek listesinin TEK kaynağı; ROLLOUT kartı burayı filtreler
```

3×3 seçiliyken K seçici **yoktur**; yerine `tr.boardConfig.winLengthFixed` metni
("3 taş (3×3 tahtada sabit)") görünür (KK-B12).

`oyun-ayari-ozeti` üç ekranda aynı kanca, aynı şablon (`tr.boardConfig.summary`).

### 5.5 Bilgisayara karşı ekran

- Boyut/K seçimi **oda akışından bağımsız**, sunucuya istek gitmez (KK-B42). Varsayılan
  `{3,3}` → bugünkü tıklama sayısı değişmez.
- `use-computer-game.ts`: bekleme `max(0, COMPUTER_MOVE_DELAY_MS − gerçekDüşünmeSüresi)`
  (KK-B67). Ölçüm `performance.now()`. **`shared/constants.ts` AÇILMAZ** — "toplam ≤ 1000 ms"
  iddiası `apps/web`'in kendi testinde.
- Zorluk etiketi: `size === 3` → `tr.computer.unbeatable`; `size > 3` → `tr.computer.hard`
  - `tr.computer.strengthNote`. **`Difficulty` tipi ve `zorluk-unbeatable` kancası değişmez**
    (KK-B47).

### 5.6 `lib/game/enabled-sizes.ts` — operasyonel kapı

`XOX_ENABLED_BOARD_SIZES` (varsayılan `3,6,11`). İki tüketici — `POST /api/rooms` ve
`use-board-modes.ts` — **aynı fonksiyonu** çağırır. Kapatılan boyutla **kurulmuş** odalar
oynanabilir kalır (ADR-0018 §3).

---

## 6. `apps/mobile` — kapsam dışı, ama bağımlılık var

`apps/mobile` bugün bir oyun ekranı içermiyor (D3). Bu özellik mobil tahta **yazmaz**.

**Bağlayıcı kural:** `W2-03` (mobil paritesi) `CTR-BOARD-001`'e **bağımlı** ilan edilir —
mobil tahta **genişlemiş protokole karşı** yazılır. Böylece "eski mobil × yeni oda" durumu
hiç var olmaz (ADR-0018 hat 3).

`apps/mobile/messages/tr.ts` bu özellikte **değişir** (message-keys parite testi) ama ekran
yazılmaz. AS-B02'nin kabul edilebilir çıkışı (mobilde 11×11 gizlenir) `W2-03`'ün kararıdır.

---

## 7. `apps/e2e`

- `playMove(page, index, options?)` ve `expectCell(page, index, mark)` **imzaları korunur**
  (KK-B41); boyut parametresi **opsiyonel** eklenir.
- `createRoom(page, config?)` — seçiciyi kullanır; parametresiz çağrı bugünkü akış.
- Kazanan üçlüyü elle yazan iddialar (`result-rematch.spec.ts`) bir yardımcıya taşınır:
  **`winningSequence(config)` `apps/e2e` içinde, kendi çıplak aritmetiğiyle** yazılır.
  `@xox/game-core` import **edilemez** (D4) — ve bu zaten doğru test tasarımıdır: beklenti
  test edilen şeyin **dışından** gelmeli (gotcha örüntü 2).
- Yeni senaryolar: seçici (KK-B11/B12/B13) · katılma özeti (KK-B17) · rövanş konfigürasyonu
  (KK-B18) · 11×11 yerleşim (KK-B50/B51/B52/B53) · kazanan çizgi üç sinyal (KK-B54) ·
  son hamle (KK-B55) · klavye (KK-B59/B60) · `axe` üç boyutta (KK-B66) · eski istemci 4400
  (KK-B40).
- `OPS-007` nöbetçisi yürürlükte: E2E **üretime karşı koşturulmaz**, allowlist gevşetilmez.

---

## 8. Türkçe metin ağacı

Spec §5 aynen uygulanır: `boardConfig` grubu (16 anahtar), `game`'e 4, `computer`'a 3,
`errors`'a 1. **Üç dosya tek commit'te**: `shared/errors.ts` + `shared/message-keys.ts` +
`apps/web/messages/tr.ts` + `apps/mobile/messages/tr.ts` (`message-keys.test.ts` birebir
eşliği doğruluyor).

`unbeatable: 'Yenilmez'` **silinmez** — 3×3'te hâlâ doğru metin odur.

---

## 9. Test stratejisi — 3×3 kanıtları nasıl korunuyor

| Bugünkü kanıt                                                 | Nasıl korunuyor                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai.test.ts` tümevarımsal yenilmezlik (X, O, iki mükemmel AI) | `bestMove`'un **gövdesi değişmiyor**; `chooseMove`'un 4. parametresi (`rng`) konumunu koruyor → test dosyası **sıfır satır** düzenlenir (KK-B20)                                                                                                                                      |
| `game-core` %100 kapsam                                       | Yeni dalların hepsi testtir, savunmacı değildir. `cellAt`'in `?? null`'u, memo'nun "sınır dışı konfigürasyon önbelleğe alınmaz" dalı, `parseBoardConfig`'in beş reddetme sebebi — hepsi tetiklenebilir. Ulaşılamaz hâle gelen dal **sessizce silinmez, gürültülü bırakılır** (KK-B29) |
| %98.49 mutasyon                                               | Eşik **≥ %98 sabit** (KK-B21). Yeni kodun mutantlarını öldüren testler: `WINDOW_WEIGHT` tablosunun çıplak beklentisi, `TERMINAL_SCORE` değişmezini ihlal eden mutantı öldüren kurulu pozisyon, aday yarıçapı 2→1/3 mutantını öldüren "24 aday" sondası                                |
| `WIN_LINES` sekizlisi                                         | `winLines({3,3})`'ün **elle kopyalanmış** sekiz hatla, aynı sırada eşitliği (KK-B08)                                                                                                                                                                                                  |

**İki katmanlı test kuralı** (conventions.md) her yeni tabloda uygulanır: türetilmiş test
(kapsamı otomatik genişletir) + **elle yazılmış, testin dışından gelen** beklenti tablosu.
`BOARD_MODES`, hat sayıları, `WINDOW_WEIGHT`, `TESTID` sayısı, hata kodu sayısı — hepsi
çıplak sayı yazar.

**İki bağımsız uygulamanın birbirini denetlemesi:** `wouldWin` ↔ `evaluateStatus`, tohumlu
üreteçle sabitlenmiş **500 pozisyonluk** korpusta (KK-B26). Bu test silinemez, örneklem
düşürülemez.

**Kapılar doğru kapsamı ölçer** (gotcha örüntü 6):

| Kapı                          | Nerede koşar                                      | Ölçtüğü                                        |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| `AI_NODE_BUDGET`              | Vitest, `game-core`                               | Algoritmik gerileme — deterministik, flake yok |
| `AI_BUDGET_MS`                | `apps/e2e`, gerçek tarayıcı + CDP CPU kısıtlaması | Kullanıcının hissettiği süre                   |
| `scrollWidth === clientWidth` | `apps/e2e`, 360×640                               | KK-B50                                         |
| `size-limit` rota bütçeleri   | CI `build` işi                                    | KK-B70 değil, bundle şişmesi (D8)              |

Merge sonrası **daima**: `pnpm exec turbo run typecheck --force` +
`pnpm exec turbo run test:coverage --force` (çıktıda `Cached: 0`), ardından
`gh run list --workflow=CI --limit 3`.

---

## 10. Dalga bölümlemesi

### 10.1 Bölümleme ilkeleri (neden böyle bölündü)

1. **Typecheck atomikliği > metinsel çakışma.** İki kart farklı dosyalara dokunsa bile bir
   tipin genişlemesi diğerini kırıyorsa, **aynı kartta** olmalılar (ADR-0011).
2. **`packages/shared` bir kez açılır, bir kez donar.** Aynı dalgada iki kart `shared`'a
   dokunamaz. Tek istisna `game-status.ts`'in `CORE-CFG-001` içindeki payı — gerekçesi
   typecheck atomikliği (ADR-0015).
3. **`main` her dalgada yayınlanabilir.** B0–B3 kullanıcıya görünmez; özellik **tek bir
   kartın** merge'üyle canlanır (ADR-0018 §2).
4. **Görsel iş katmana göre bölünür**, özelliğe göre değil (ADR-0017 §10).
5. **Paralellik ≤ 3** (gotcha: dört paralel agent oturum kotasını öldürdü).

### 10.2 Kartlar, sıra, çakışma kümeleri

#### Dalga B0 — ölçüm ve zemin (3 paralel)

| Kart                                                                                   | Agent          | Bağımlılık  | Çakışma kümesi                                                                                                        |
| -------------------------------------------------------------------------------------- | -------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| **DESIGN-001a** — Yön A tasarım dili + tokenlar (bileşen **yok**)                      | `xox-designer` | —           | `packages/ui-tokens/**` · `apps/web/app/globals.css` · `apps/web/lib/generate-globals-css.ts` · `docs/design/**`      |
| **PERF-003** _(mevcut kart)_ — `game-core` sızıntısı; ağır rotalarda bütçe payı açılır | `xox-perf`     | PERF-002 ✅ | `apps/web/next.config.ts` · `apps/web/components/computer/**` · `packages/game-core/package.json` · `.size-limit.mjs` |
| **AI-SPIKE-001** — ölçüm; **kod merge EDİLMEZ**                                        | `xox-perf`     | —           | _(yok — ayrı dal, yalnız rapor)_                                                                                      |

> `DESIGN-001a` çıktısı bağlayıcıdır: `--xox-grid-line: 2px`, hücre/ızgara tokenları,
> odak halkası, `surfaceRaised`. ADR-0017'deki üç sapma (gap 1→2 px, "Yakınlaştır"
> uygulanmaz, `hitSlop` reddedildi) `docs/design/`'a not düşülür.

#### Dalga B1 — çekirdek (1 büyük kart)

| Kart                                                                                                                         | Agent          | Bağımlılık | Çakışma kümesi                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CORE-CFG-001** — `game-core` parametrikleşmesi (SB-01+SB-02+SB-03) + zorunlu shared/db payı. **Tek worktree, tek commit.** | `xox-dev-core` | PERF-003   | `packages/game-core/src/{types,config,board,status,moves,index}.ts`+testleri · `packages/shared/src/game-status.ts`+testi · `packages/db/src/models/{validators,room,game}.ts` · `apps/web/components/computer/game-engine.ts` |

> Bu kart **bölünemez** (ADR-0011). `ai.ts`/`search.ts` **kapsam dışı**. Diğer tüm imzalar
> `config = DEFAULT_BOARD_CONFIG` varsayılanı alır → `db/rooms/**`, `web/lib/**` bu kartta
> açılmaz. `apps/web/components/computer/game-engine.ts`'e dokunduğu için aynı dalgada
> `components/**`'a dokunan başka kart **olamaz** → `DESIGN-001b` B1'e konamaz.

#### Dalga B2 — protokol · AI · görsel dil (3 paralel)

| Kart                                                                                                                     | Agent            | Bağımlılık                           | Çakışma kümesi                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **CTR-BOARD-001** — `shared` tam unfreeze (SB-04/05/06/09/10/11) + `room-client` + iki `tr.ts`. **Sonra yeniden donar.** | `xox-dev-shared` | CORE-CFG-001                         | `packages/shared/src/**` · `apps/web/messages/tr.ts` · `apps/mobile/messages/tr.ts`                 |
| **CORE-AI-001** — N>3 arama motoru                                                                                       | `xox-dev-core`   | CORE-CFG-001, AI-SPIKE-001, PERF-003 | `packages/game-core/src/{ai,search,evaluate,ai-config,index}.ts`+testleri · `stryker.conf` eşikleri |
| **DESIGN-001b** — Yön A'nın bileşenlere uygulanması                                                                      | `xox-designer`   | DESIGN-001a                          | `apps/web/components/**` **eksi** `board/**` · `apps/web/app/{page,giris,kayit,profil}/…`           |

> `CORE-AI-001` `index.ts`'e dokunuyor; `CORE-CFG-001` bir dalga önce merge edilmiş olmalı.
> `CORE-AI-001` `size-limit` kapısını **kendi** yeşil tutmak zorundadır (D8).

#### Dalga B3 — kalıcılık ve tahta (2 paralel)

| Kart                                                                                                       | Agent         | Bağımlılık                               | Çakışma kümesi                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DB-BOARD-001** — `size`/`winLength` alanları, `resolveBoardConfig`, `cas` tahta kanalı, `toStateMessage` | `xox-dev-db`  | CORE-CFG-001, CTR-BOARD-001              | `packages/db/src/models/{room,game}.ts` · `packages/db/src/rooms/**` · `apps/web/lib/game/room-view.ts` · `apps/web/lib/realtime/connection.ts`                 |
| **UI-BOARD-001** — `Board.tsx` yeniden yazımı + `roving-grid.ts` + `cell-label.ts`                         | `xox-dev-web` | CORE-CFG-001, CTR-BOARD-001, DESIGN-001a | `apps/web/components/board/**` · `apps/web/components/room/RoomScreen.tsx` ve `components/computer/ComputerGameScreen.tsx`'te **yalnız prop bağlama satırları** |

#### Dalga B4 — yüzey (2 paralel)

| Kart                                                                                     | Agent         | Bağımlılık                               | Çakışma kümesi                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API-BOARD-001** — `POST /api/rooms` gövdesi, `GET /api/rooms/[code]` yanıtı            | `xox-dev-web` | DB-BOARD-001, CTR-BOARD-001              | `apps/web/app/api/rooms/**`                                                                                                                                                               |
| **UI-CFG-001** — seçici + özet + rövanş/katılma görünümü. **ÖZELLİK BURADA YAYINLANIR.** | `xox-dev-web` | CTR-BOARD-001, UI-BOARD-001, DESIGN-001b | `apps/web/components/board-config/**` (yeni) · `apps/web/components/home/HomeActions.tsx` · `apps/web/components/room/{RoomScreen,status-text}.ts(x)` · `apps/web/app/oda/katil/page.tsx` |

#### Dalga B5 — bilgisayar ekranı ve yayın kontrolü (2 paralel)

| Kart                                                                          | Agent         | Bağımlılık                | Çakışma kümesi                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **UI-COMP-001** — bilgisayar ekranında boyut/K, gecikme tabanı, "Zor" etiketi | `xox-dev-web` | UI-CFG-001, CORE-AI-001   | `apps/web/components/computer/**` · `apps/web/app/oyna/bilgisayar/page.tsx`                                                                                                                                              |
| **ROLLOUT-BOARD-001** — skew doğrulaması, `deploymentId`, kill switch         | `xox-devops`  | API-BOARD-001, UI-CFG-001 | `apps/web/lib/game/enabled-sizes.ts` (yeni) · `apps/web/components/board-config/use-board-modes.ts` (**tek dosya**) · `apps/web/app/api/rooms/route.ts` · `apps/web/app/api/health/route.ts` · `apps/web/next.config.ts` |

#### Dalga B6 — kapı (1 kart)

| Kart                                                               | Agent        | Bağımlılık | Çakışma kümesi              |
| ------------------------------------------------------------------ | ------------ | ---------- | --------------------------- |
| **E2E-BOARD-001** — 15 `[E2E]` kriteri + `axe` + eski istemci 4400 | `xox-qa-e2e` | hepsi      | `apps/e2e/**` (izole proje) |

### 10.3 Bağımlılık grafiği

```
DESIGN-001a ─────────────────────────┐
PERF-003 ──────────┐                 │
AI-SPIKE-001 ───┐  │                 │
                │  ▼                 │
                │ CORE-CFG-001 ──────┼────────────┐
                │      │             │            │
                │      ├──► CTR-BOARD-001 ────────┼──► DB-BOARD-001 ──► API-BOARD-001 ─┐
                └──────┴──► CORE-AI-001           │          │                          │
                     DESIGN-001b ─────────────────┴──► UI-BOARD-001 ──► UI-CFG-001 ─────┤
                                                                              │         │
                                                                    UI-COMP-001   ROLLOUT-BOARD-001
                                                                              └────┬────┘
                                                                          E2E-BOARD-001
```

### 10.4 Kriter → kart eşlemesi

| Kart              | Kriterler                                         |
| ----------------- | ------------------------------------------------- |
| CORE-CFG-001      | KK-B01…B10, B22…B29, B36                          |
| CORE-AI-001       | KK-B20/B21 (koruma), B43…B48, B68 (düğüm bütçesi) |
| CTR-BOARD-001     | KK-B37, B38, B39                                  |
| DB-BOARD-001      | KK-B19, B30…B35, B69, B70, B72, B73               |
| UI-BOARD-001      | KK-B49…B66 (`[BİRİM]` olanlar), B71               |
| API-BOARD-001     | KK-B14, B15, B16                                  |
| UI-CFG-001        | KK-B11, B12, B13, B17, B18                        |
| UI-COMP-001       | KK-B42, B47, B67                                  |
| ROLLOUT-BOARD-001 | KK-B40 (azaltma tarafı)                           |
| E2E-BOARD-001     | 15 `[E2E]` kriterinin tamamı + KK-B66             |

### 10.5 Bölümlemenin bilinen zayıf noktaları (planner bunları görmeli)

1. **En riskli kenar: protokol B2'de donuyor, tüketicileri B3–B4'te yazılıyor.**
   CTR-001'in bilinen kusuru (bkz. açık borç `CTR-003`). Tek panzehir `CTR-BOARD-001`'in
   **tüketici sondası** kabul kriteridir (ADR-0015 §7) — tasarımın §3.2 alan tablosundan
   **elle kopyalanmış** beklentiler.
2. **`CORE-AI-001` ↔ bundle bütçesi.** Ağır rotalarda ~20 kB gzip pay var ve `game-core`
   tüm rotalara sızıyor. `PERF-003` ön koşul; yine de `CORE-AI-001` kendi `size-limit`
   sonucunu raporlamalı.
3. **B4'te yarım özellik.** `API-BOARD-001` ve `UI-CFG-001` paralel gidiyor; ikisi birden
   merge edilene kadar seçici çalışmaz. Kabul edilir (E2E B6'da), ama board'da
   "yarım özellik" olarak işaretlenmeli.
4. **`AI-SPIKE-001` `blocked`'ı `[MANUEL]` bir adım içeriyor** (gerçek Android'de kalibrasyon).
   Ömer'in eli gerekir. Kalibrasyon yapılmazsa spike **tamamlanmış sayılmaz**; CI'daki
   throttle çarpanı gerekçesiz kalır (gotcha örüntü 6).

---

## 11. Açık soruların kapanışı

| Soru                                     | Durum                                | Karar                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS-B01 · AI süre bütçesi                 | `blocked` → **ölçüm tanımlı**        | ADR-0013 §9: iki katmanlı kapı, üç aşamalı kalibrasyon. Sayı `AI-SPIKE-001`'den gelir                                                                    |
| AS-B02 · mobilde 121 eleman              | `blocked` → **kapsam dışına alındı** | `apps/mobile` bugün tahta içermiyor (D3). Karar `W2-03`'ün; bu özelliği bloklamaz                                                                        |
| AS-B03 · `waiting`'te ayar değişikliği   | varsayım (a)                         | **Onaylandı** (ADR-0014 §4). Geri dönüş yolu yazılı                                                                                                      |
| AS-B04 · tek ELO havuzu                  | varsayım (a)                         | **Onaylandı** (ADR-0014 §5). `games.size` yazılıyor → (b) sonradan ucuz kalıyor                                                                          |
| AS-B05 · hücre tabanı 28/24 px           | varsayım                             | **Onaylandı ama yeri değişti**: sayılar CSS'e değil **E2E ölçümüne** yazılır (ADR-0017 §1)                                                               |
| AS-B06 · son hamle 3×3'te de             | varsayım                             | **Onaylandı** (tek uygulama, boyuta göre dallanma yok)                                                                                                   |
| SB-07 · `AI_BUDGET_MS` yeri              | spec `shared` diyordu                | **REDDEDİLDİ** — `game-core` `shared`'ı import edemez (D5). Sabit `game-core/ai-config.ts`'te                                                            |
| KK-B48 · `WIN_SCORE` değişmezi           | spec "yeniden ifade" istiyordu       | **İki ayrı değişmez**: `bestMove` için eski (metni güncellenir), `searchMove` için daha güçlü olan (`TERMINAL_SCORE − MAX_SEARCH_DEPTH > MAX_HEURISTIC`) |
| KK-B56 · sütun sayısı `board.length`'ten | spec literal                         | **Güçlendirildi**: sütun `config.size`'dan, `cells.length` ile **eşleşmesi zorunlu**; uyuşmazlıkta hata durumu (KK-B57)                                  |
| — · `state.lastMove`                     | spec'te **yoktu**                    | **EKLENDİ** (ADR-0015 §3): Z2 rotasyonu olmadan KK-B55 gözlemlenemez                                                                                     |

---

## 12. Sonraki ajana bırakılan borç (bilerek, yazılı)

1. **`AI_BUDGET_MS`, `AI_NODE_BUDGET`, `MAX_SEARCH_DEPTH` sayıları boş.** `AI-SPIKE-001`
   doldurur. Kod bu kartlardan önce yazılabilir; **sayı tahmin edilemez.**
2. **Skew Protection etkin mi bilinmiyor.** `ROLLOUT-BOARD-001`'in ilk kriteri bu ölçümdür;
   `0` çıkarsa `deploymentId` elle yazılır. Ölçüm yapılmadan "korunuyoruz" denmeyecek.
3. **3×3 tam minimax'ın gerçek cihazdaki süresi bilinmiyor** (D7: geliştirici makinesinde
   515 ms). Spike ölçer; 1000 ms tavanını zorluyorsa **ayrı bir kart** açılır — bu özelliğin
   borcu değil, ama bu özellik onu görünür kılıyor.
4. **`boardToString` 121 hücrede okunamaz düz bir dize üretir.** Round-trip sözleşmesi
   (`boardFromCells(Array.from(s))`) korunduğu için biçim **değiştirilmedi**. Hata ayıklama
   ergonomisi isteniyorsa ayrı bir yardımcı, ayrı bir kart.
5. **`CTR-003`** (canJoin türetmesini `shared`'a tekilleştir) hâlâ açık ve `packages/shared`
   unfreeze'ini gerektiriyor. **`CTR-BOARD-001` penceresi açıkken `CTR-003`'ü de kapatmak
   ücretsizdir** — planner değerlendirmeli, aksi hâlde borç bir sonraki unfreeze'i bekler.
