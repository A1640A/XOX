---
task: CORE-CFG-001
status: done
summary: >
  game-core parametrikleştirildi: BoardConfig/BOARD_MODES/parseBoardConfig tek kaynak,
  Board markalı diziye ve WinLine `readonly number[]`e genişledi, WIN_LINES yerine memoize
  winLines(config) + wouldWin hızlı yolu geldi, cellAt totalleşti. Tipin genişlemesinin
  zorunlu kıldığı shared (winLineSchema/toTransportStatus) ve db (isNullOrLengthBetween,
  yerel BOARD_SIZE) payları AYNI commit'te indi. 3×3 davranışı ve 642 oyunluk tümevarımsal
  yenilmezlik kanıtı bit düzeyinde korundu; kapsam %100, mutasyon %99.75.
files_changed:
  - packages/game-core/src/config.ts (YENİ)
  - packages/game-core/src/config.test.ts (YENİ)
  - packages/game-core/src/index.test.ts (YENİ)
  - packages/game-core/src/types.ts
  - packages/game-core/src/board.ts
  - packages/game-core/src/board.test.ts
  - packages/game-core/src/status.ts
  - packages/game-core/src/status.test.ts
  - packages/game-core/src/moves.ts
  - packages/game-core/src/moves.test.ts
  - packages/game-core/src/index.ts
  - packages/game-core/src/ai.test.ts (yalnız EMPTY_BOARD -> emptyBoard() mekanik ikamesi)
  - packages/shared/src/game-status.ts
  - packages/shared/src/game-status.test.ts
  - packages/db/src/models/validators.ts
  - packages/db/src/models/validators.test.ts (YENİ)
  - packages/db/src/models/room.ts
  - packages/db/src/models/room.test.ts
  - packages/db/src/models/game.ts
  - packages/db/src/models/game.test.ts
  - packages/db/src/rooms/apply-move.ts (KAPSAM DIŞI ama ZORUNLU — aşağıda)
  - packages/db/src/rooms/finish.ts (KAPSAM DIŞI ama ZORUNLU — aşağıda)
  - apps/web/components/computer/game-engine.ts
  - apps/web/components/computer/use-computer-game.ts (yalnız yorumdaki ölü ad)
tests:
  added: 61
  passing: 1355
  coverage: 'game-core %100 (199/199 stmt · 109/109 branch · 44/44 fn · 161/161 line)'
  mutation: '%99.75 (386 killed + 11 timeout + 1 kanıtlı eşdeğer survivor / 398 üzerinden)'
decisions:
  - karar: 'Board markası `declare const boardBrand: unique symbol` + `readonly Cell[] & { readonly [boardBrand]: true }`'
    gerekçe: >
      Tuple iki iş yapıyordu: indeks totalliği ve boardFromCells kapısının kanıtı.
      Değişken boyutta birincisi tuple ile taşınamaz; marka ikincisini korur ve
      `cells as Board` cast'ini GEREKLİ kılar (no-unnecessary-type-assertion susmaz).
    reddedilen_alternatif: 'Düz readonly Cell[] — cast kimlik dönüşümü olur, lint siler, kapı ölür (E-18 savunmasız kalır).'
  - karar: 'runLength sınır kontrolü ÜÇ koşul: `r < n && c >= 0 && c < n`. `r >= 0` KALDIRILDI.'
    gerekçe: >
      Negatif satır daima negatif indeks üretir (0 <= c < n) ve cellAt TOTAL olduğu için
      null döner — `r >= 0` hiçbir girdiyle ayırt edilemeyen, öldürülemez bir mutant
      üretiyordu (3 mutant hayatta kalıyordu). `r < n` ise ULAŞILABİLİR ve şart:
      konfigürasyon-tahta uyuşmazlığında gerçek hücreleri okur.
    reddedilen_alternatif: 'Dört koşulu bırakıp mutasyon eşiğini düşürmek — savunmacı dal yasağının ihlali.'
  - karar: "winLines/emptyBoard önbelleği YALNIZ BOARD_MODES'taki altı kombinasyonu tutar."
    gerekçe: "Uzun ömürlü Vercel instance'ında hatalı bir çağrı sonsuz büyüyen önbellek üretmesin (ADR-0012 §2)."
    reddedilen_alternatif: 'Sınırsız Map — testi kolay, bellek sızıntısı riski gerçek.'
  - karar: 'Her konfigürasyonun İLK İSTEYEN testi, o konfigürasyon hakkındaki HER ŞEYİ tek testte iddia eder.'
    gerekçe: >
      Memoizasyon test sırasını sözleşmeye çeviriyor: üretim kodunu gerçekten koşan tek
      test ilk isteyendir, sonrakiler önbellekten döner ve mutantı ÖLDÜREMEZ. Ölçüldü.
    reddedilen_alternatif: 'coverageAnalysis: all — doğru ama 642 oyunluk kanıtla birlikte mutasyon süresi kabul edilemez.'
gotchas:
  - >
    MEMOİZASYON + Stryker perTest = kapı yanlış kapsamı ölçer (gotcha örüntü 6). İddiaların
    tek satırı değişmeden SADECE test sırasını değiştirmek skoru %94.04 -> %84.25'e düşürdü.
    Memoize eden her fonksiyonda: üretim kodunun bütün iddiaları O KONFİGÜRASYONU İLK
    İSTEYEN teste konur.
  - >
    (3,3)'te `c` DAİMA 0'dır (N-K = 0). Hat üreticisinin sütun terimini bozan mutasyon
    3×3 testleriyle GÖRÜNMEZ. Parametrik bir üreticinin testi, parametrenin sıfır olmadığı
    bir konfigürasyonda da elle yazılmış beklenti taşımalı.
  - >
    `typeof x === 'number' && Number.isInteger(x)` ikinci kontrol gereksizdir (Number.isInteger
    yalnız sayı ilkelleri için true). TS daraltması için yazılıyorsa `as number` ile çözülür;
    aksi hâlde öldürülemez bir mutant kalır.
blocked_reason: null
next_suggestions:
  - >
    DB-BOARD-001: `packages/db/src/rooms/rematch.ts`'te 9 elemanlı yerel `EMPTY_BOARD`
    dizisi HÂLÂ duruyor (bu kartın kapsamı models/**'dı). Odanın kendi konfigürasyonundan
    sıfırlama oraya yazılacak; `emptyBoard(config)` kullanılmalı.
  - >
    UI-BOARD-001: `apps/web/components/board/Board.tsx`'teki `const BOARD_SIZE = 3` (KENAR)
    hâlâ duruyor — ADR-0010 bu adın repodan tamamen silinmesini istiyor. O dosya bu kartın
    çakışma kümesinde değildi.
  - >
    CORE-AI-001: `ai.ts`'in yorumundaki "WIN_SCORE > BOARD_SIZE" ifadesi artık var olmayan
    bir ada atıf yapıyor; KK-B48 gereği `> cellCount({3,3})` olarak güncellenecek.
  - >
    CTR-BOARD-001: `cellIndexSchema` hâlâ 0..8. `winLineSchema` 3..6 UZUNLUK kabul ediyor
    ama indeks üst sınırı 8'de duruyor — 6×6/11×11 hatları protokolden GEÇEMEZ.
    Bu bilinçli (o pencere CTR-BOARD-001'in) ama B2'den önce kimse 3×3 dışını yayınlamamalı.
---

# CORE-CFG-001 — game-core parametrikleşmesi

## 1. Ne yapıldı

### `packages/game-core`

| Dosya       | Değişiklik                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `config.ts` | **YENİ.** `BoardConfig` · `BoardMode` · `BOARD_MODES` (elle yazılmış, iç içe donmuş) · `DEFAULT_BOARD_CONFIG` · `cellCount` · `rowOf`/`colOf` · `parseBoardConfig` · `isKnownMode` (pakete özel) |
| `types.ts`  | `Board` → markalı dizi · `WinLine` → `readonly number[]`                                                                                                                                         |
| `board.ts`  | `BOARD_SIZE` + `EMPTY_BOARD` **silindi** → `emptyBoard(config?)` (memoize + donmuş) · `cellAt` **total** · `boardFromCells(cells, config?)` uzunluğu config'e göre doğrular                      |
| `status.ts` | `WIN_LINES` **silindi** → `winLines(config?)` (üretilir, memoize, donmuş) · `evaluateStatus(board, config?)` · **YENİ** `wouldWin(board, index, player, config?)`                                |
| `moves.ts`  | Aralık `cellCount(config)`'e göre; reddetme sırası (`out-of-range` → `game-over` → `occupied`) aynen korundu; `placeStone` de config alır (4. konum, `ai.ts` 3 argümanla çağırmaya devam eder)   |
| `index.ts`  | Yüzey büyüdü; `index.test.ts`'te **elle yazılmış** 19 anahtarlık listeyle donduruldu                                                                                                             |

### `packages/shared` — tek pencere kuralının bilinçli tek istisnası

- `winLineSchema`: `z.tuple([c,c,c])` → `z.array(c).min(3).max(6)`
- `toTransportStatus`: `const [a,b,c] = status.line` → `[...status.line]`
- **Başka hiçbir dosyaya dokunulmadı.** `primitives.ts`, `ws-protocol.ts`, `errors.ts`,
  `rest-contract.ts`, `room-client.ts` CTR-BOARD-001'in.

### `packages/db`

- `isNullOrExactLength(3)` → **`isNullOrLengthBetween(3, 6)`**; `room.result.line` ve
  `game.winLine` doğrulayıcıları tiple **aynı commit'te** hareket etti.
- KK-B36: `room.ts` **ve** `game.ts` içindeki yerel `const BOARD_SIZE = 9` silindi;
  yerine `cellCount(DEFAULT_BOARD_CONFIG)`. Değer bit düzeyinde aynı (9).

### `apps/web`

- `components/computer/game-engine.ts`: `EMPTY_BOARD` → `emptyBoard()`. Davranış aynı.

## 2. Kapsam sapmaları — bilinçli, gerekçeli

| Dosya                                               | Neden kartın listesinde yoktu    | Neden dokunmak ZORUNLUYDU                                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/rooms/apply-move.ts`               | `rooms/**` DB-BOARD-001'in       | `BOARD_SIZE`'ı **`@xox/game-core`'dan import ediyordu.** Sabit silinince typecheck kırılıyor. ADR-0011 "diğer imzalar varsayılan alır" derken silinen bir SABİTİ hesaba katmamış. 1 import + 1 ifade değişti. |
| `packages/db/src/rooms/finish.ts`                   | aynı                             | `[status.line[0], status.line[1], status.line[2]]` `WinLine` dizi olunca `(number\|undefined)[]` üretiyor → `RoomResult.line`'a atanamıyor. `[...status.line]` oldu.                                          |
| `packages/game-core/src/ai.test.ts`                 | "sıfır satır değişmeli" (KK-B20) | `EMPTY_BOARD` yedi yerde kullanılıyordu ve ADR-0011 §5 + yüzey kriteri onu **silmeyi** emrediyor. İki normatif ifade çelişiyor. **Silme** kazandı; ikame tamamen mekanik (aşağıda kanıt).                     |
| `apps/web/components/computer/use-computer-game.ts` | conflictSet'te yoktu             | Tek satır **yorumda** silinmiş `EMPTY_BOARD` adına atıf kalıyordu. Yalnız yorum değişti.                                                                                                                      |

## 3. Kanıtlar

### 3.1 `ai.test.ts` — 11 satır, hepsi aynı mekanik ikame

```
-import { EMPTY_BOARD, availableMoves, boardFromCells } from './board'
+import { availableMoves, boardFromCells, emptyBoard } from './board'
-    expect(bestMove(EMPTY_BOARD, 'X')).toBe(0)
+    expect(bestMove(emptyBoard(), 'X')).toBe(0)
...  (kalan 9 satırın hepsi EMPTY_BOARD -> emptyBoard())
11	11	packages/game-core/src/ai.test.ts
```

Hiçbir `expect`, hiçbir eşik, hiçbir oyun sayısı değişmedi.

### 3.2 642 oyunluk tümevarımsal koşu

```
✓ unbeatable zorluk > X olarak oynayan AI, ... kaybetmez ve kural dışı hamle yapmaz 1000ms
✓ unbeatable zorluk > O olarak oynayan AI, ... kaybetmez ve kural dışı hamle yapmaz 1052ms
✓ unbeatable zorluk > iki mükemmel AI karşılaşırsa beraberlik olur 1005ms

packages/game-core/src/ai.test.ts:121:    expect(tally.games).toBe(73)
packages/game-core/src/ai.test.ts:127:    expect(tally.games).toBe(569)      # 73 + 569 = 642
```

### 3.3 Kapsam

```
Statements   : 100% ( 199/199 )
Branches     : 100% ( 109/109 )
Functions    : 100% ( 44/44 )
Lines        : 100% ( 161/161 )
```

### 3.4 Mutasyon (iki bağımsız koşuda birebir aynı)

```
File       |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
All files  |  99.75 |   99.75 |      386 |        11 |          1 |        0 |        0 |
 ai.ts     | 100.00 |  100.00 |       65 |         0 |          0 |        0 |        0 |
 board.ts  |  98.48 |   98.48 |       64 |         1 |          1 |        0 |        0 |
 config.ts | 100.00 |  100.00 |       71 |         0 |          0 |        0 |        0 |
 errors.ts | 100.00 |  100.00 |        3 |         0 |          0 |        0 |        0 |
 moves.ts  | 100.00 |  100.00 |       47 |         0 |          0 |        0 |        0 |
 status.ts | 100.00 |  100.00 |      136 |        10 |          0 |        0 |        0 |
```

Tek hayatta kalan mutant `board.ts:115` — `if (cell !== null) placed += 1` → `placed -= 1`.
**Kanıtlı eşdeğer:** `nextPlayer` yalnız `placed % 2 === 0`'a bakar ve JS'te `(-n) % 2 === 0`
ile `n % 2 === 0` aynıdır (`-0 === 0`). Bu karttan önce de vardı, hiçbir testle öldürülemez.

### 3.5 Hayalet galibiyet sınıfının kapandığı

Eskiden `cellAt` `board[index] as Cell` yazıyordu: `noUncheckedIndexedAccess` altında
gerçek tip `Cell | undefined` iken cast onu `Cell` gösteriyordu. Konfigürasyon-tahta
uyuşmazlığında `undefined === undefined` üç kez doğru olur ve **var olmayan hücrelerden
kazanan hat** üretilirdi. Yeni hâl `board[index] ?? null`; üç sonda:

- `cellAt(board, 999) === null` · `cellAt(board, -1) === null` · `cellAt(board, 9)` tanımsız değil
- `[9, 10, 11].map((i) => cellAt(board, i))` → `[null, null, null]` (üçlü karşılaştırma artık asla eşleşemez)
- E-18 sondası: 121 hücrelik tahta `{6,4}` ile taranıyor; `wouldWin` satır sınırını aşmıyor
  ve hayalet galibiyet üretmiyor (bu test `r < n` mutantlarının katilidir).

### 3.6 `winLines(3,3) ≡ WIN_LINES` testi ELLE YAZILMIŞ

`status.test.ts`'in tepesinde, `winLines`'a **hiçbir referans içermeyen** düz dizi:

```ts
const WIN_LINES_3X3 = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]
```

`grep -c 'WIN_LINES_3X3' status.test.ts` → 3 (tanım + iki kullanım); üreticiden okuma yok.
Aynı disiplin `(6,4)`'ün 17 sınır hattında ve `BOARD_MODES`'un `EXPECTED_MODES` tablosunda da uygulandı.

### 3.7 KK-B36 grep sondası (yorum satırları elenerek)

```
$ for f in $(git ls-files 'packages/**/*.ts' 'apps/**/*.ts(x)' | grep -v '\.test\.'); do
    n=$(grep -vE '^\s*(\*|//|/\*)' "$f" | grep -c 'BOARD_SIZE'); [ "$n" -gt 0 ] && echo "$f: $n"; done

apps/web/components/board/Board.tsx: 4      <- KENAR (=3), UI-BOARD-001'in dosyası
packages/shared/src/constants.ts: 1         <- LEADERBOARD_SIZE (alt dize eşleşmesi)
packages/shared/src/rest-contract.ts: 2     <- LEADERBOARD_SIZE

$ # packages/db/src üretim kodunda çıplak 9:
(çıktı yok)
```

`packages/db` içinde 9-hücre varsayımının ikinci kopyası **kalmadı**.
Kalan iki borç `next_suggestions`'ta.

### 3.8 Dört paket typecheck (+ mobile, e2e)

```
$ pnpm gates   # exit=0
 Tasks:    7 successful, 7 total     (typecheck: game-core, shared, db, web, mobile, e2e, ui-tokens)
 Tasks:    5 successful, 5 total     (test:coverage)
 eslint . --max-warnings=0           -> temiz
 prettier --check .                  -> temiz
 knip                                -> exit 0, unused/unlisted/unresolved yok
```

## 4. Commit'ler

| SHA       | Mesaj                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `2dd105a` | `feat(core): BoardConfig + markali Board + winLines(config) — tahta konfigurasyonu tek kaynak` (SB-01+SB-02+SB-03, dört paket, **TEK** commit) |
| `e113f2e` | `test(core): mutasyon sondasi — 11 hayatta kalan mutant, 10'u olduruldu (%97.31 -> %99.75)`                                                    |

Dal: `feat/CORE-CFG-001`. Merge/push YAPILMADI. `--no-verify` KULLANILMADI (iki commit de
lefthook gitleaks + format + lint + commitlint kapılarından geçti).
