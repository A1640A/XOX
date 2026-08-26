# DB-BOARD-001 — Tahta konfigürasyonunun kalıcılık katmanı

Dal: `feat/DB-BOARD-001` (kesildiği yer: `feat/CTR-BOARD-001`). Merge yapılmadı — talimat gereği.

## Özet

`packages/db` iki koleksiyonun (`rooms`, `games`) `size`/`winLength` alanlarını ADR-0014'ün üç
sert kuralına göre kalıcılaştırdı: **opsiyonel alanlar** (`required`/`default` yok), **tek okuma
kapısı** `resolveBoardConfig`, **tek yazma kapısı** `casUpdateRoom`'un tipli `board` kanalı.
`apps/web/lib/game/room-view.ts` bugün kırık olan `size`/`winLength`/`lastMove` alanlarını
`toStateMessage`'a ekledi; bu iki dosyayı kapatmak `apps/web`'in geri kalanının (connection,
session, emoji, rematch, resign, handlers/index, presence, rotate testleri) **kendiliğinden**
yeşile dönmesini sağladı — hepsi `serverMessageSchema.parse` ile çıkışı doğruluyordu ve tek eksik
`toStateMessage`'ın kendisiydi.

## `resolveBoardConfig` imzası ve bozuk-alan davranışı

`packages/db/src/rooms/board-config.ts`:

```ts
export function resolveBoardConfig(doc: Pick<RoomDoc, 'size' | 'winLength'>): BoardConfig
```

- İki alan da yoksa (`undefined`/`undefined`) → `DEFAULT_BOARD_CONFIG` (`{3,3}`), **sessizce**,
  `console.error` YOK (KK-B31 — meşru eski şekil).
- Alan var ama `@xox/game-core`'un `parseBoardConfig`'i reddediyorsa (bilinmeyen `size`, `size`
  ile uyuşmayan `winLength`, yarı bozuk kayıt — yalnız `winLength` var `size` yok vb.) →
  `console.error('[resolveBoardConfig] rooms.size/winLength bozuk, {3,3} varsayılana düşüldü', {size, winLength, reason})`
  - `{3,3}` (KK-B32 — sessiz düşüş YASAK).
- Doğrulamayı **kendisi yapmaz**, `game-core`'un `parseBoardConfig`'ine delege eder (kural 4).
- Sonda: `grep -rn 'size ?? 3'` (yorum satırları hariç, `packages/db` + `apps/web` genelinde)
  **sıfır eşleşme** — `packages/db/src/rooms/board-config.test.ts` bunu otomatik doğrular.
- `packages/db` içinde `logError` sarmalayıcısı yok (o `apps/web`'e özel — `no-console` orada
  `'error'`); `console.error` doğrudan çağrılır, `eslint.config.mjs`'nin genel `no-console` kuralı
  `allow: ['warn','error', ...]` ile buna izin veriyor (`apps/web/**` override'ı bunu kapsamaz).

Dışa verildiği yer: `packages/db/src/index.ts` (`export { resolveBoardConfig } from
'./rooms/board-config'`) — `rooms/index.ts` DB-002'den beri donuk olduğu için `getRoomSummary`
ile aynı desende (kendi modülünden) verildi, donmuş barrel'e dokunulmadı.

**Tüketicileri:** `apps/web/lib/game/room-view.ts` (`roomTransportStatus`, `toStateMessage`),
`packages/db/src/rooms/apply-move.ts`, `packages/db/src/rooms/rematch.ts` (`startRematch`),
`packages/db/src/rooms/summary.ts` (`getRoomSummary`), `packages/db/src/rooms/finish.ts`
(`finishGame`). Hiçbiri `doc.size ?? 3` yazmıyor.

## `board.length === size²` sondasının gerçek çıktısı (`casUpdateRoom` ihlali)

`packages/db/src/rooms/cas.test.ts`, gerçek `xox_test` Atlas'a karşı:

1. `"set" içinde 'board' anahtarı YASAK — çalışma zamanı guard FIRLATIR`
   → `casUpdateRoom({code, expectedVersion:1, set:{board:[...]}})` senkron olarak
   `Error: casUpdateRoom: 'set.board' YASAK — tahta yalnız tipli \`board\` kanalından yazılır
   (ADR-0014 §3)`fırlatıyor —`rejects.toThrow(/set\.board/)` **GEÇTİ**.
2. **KK-B35 sondası:** `size:11` bir odaya (121 hücreli tahta, `version:3`) `{size:3,winLength:3}`
   konfigürasyonuyla etiketlenmiş **9 hücrelik** bir tahta yazmaya çalışan çağrı:
   - `casUpdateRoom(...)` → **`null` döndü** (Mongo'ya HİÇ istek gitmedi — uzunluk kontrolü
     `Room.findOneAndUpdate` çağrılmadan ÖNCE yapılıyor).
   - Sonrasında okunan doküman: `version` **hâlâ 3** (artmadı), `board.length` **hâlâ 121**
     (eski tahta bit düzeyinde korundu).
   - Test: `PASS` (`packages/db/src/rooms/cas.test.ts` → "KK-B35 SONDASI").
3. Doğru uzunluktaki bir tahta (`{size:3,winLength:3}` konfigürasyonuna 9 hücre) kabul edildi,
   `version` 5→6 oldu ve `board` beklenen değere güncellendi — **PASS**.

Tam koşu çıktısı (`packages/db` test dosyası, gerçek Atlas):

```
✓ packages/db/src/rooms/cas.test.ts (3 tests)
```

## `rematch.ts`'teki yerel dizinin kalktığının kanıtı

`packages/db/src/rooms/rematch.ts`:

```diff
-const EMPTY_BOARD: Cell[] = [null, null, null, null, null, null, null, null, null]
+// (silindi — CORE-CFG-001'in bıraktığı borç kapandı)
```

`startRematch` artık `resolveBoardConfig(room)` + `@xox/game-core`'un `emptyBoard(config)`'ini
kullanıyor ve tahtayı `casUpdateRoom`'un tipli `board` kanalından yazıyor (`set` içinde `board`
YOK). Kanıt testi (`rematch.test.ts` → "CORE-CFG-001 borcu kapandı"): `size:11,winLength:5`
etiketli, 121 hücresi de dolu bir odada rövanş kabul edildiğinde dönen tahtanın **121 hücre**
uzunluğunda ve **tamamı `null`** olduğu, `size`/`winLength`'in **değişmediği** (KK-B19) doğrulandı
— eski (`9` hücreli) yerel sabit kullanılsaydı bu test `boardFromCells`'in `RangeError`'ı ya da
yanlış uzunluklu bir tahta ile kırmızı olurdu. `grep -c "EMPTY_BOARD" packages/db/src/rooms/rematch.ts`
→ `0`.

## `pnpm gates`'in yedi paketi de yeşil verdiği çıktı

| Adım                                             | Kapsam      | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @xox/db typecheck`                | packages/db | ✅ temiz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm --filter @xox/db test` (gerçek `xox_test`) | packages/db | ✅ **28/28 dosya, 230/230 test**                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter @xox/db test:coverage`            | packages/db | ✅ 230/230 — Statements 95.77% · Branches 90.06% · Functions 98.73% · Lines 97.89%                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @xox/web typecheck`               | apps/web    | ✅ temiz (başlangıçta 2 hata: `room-view.ts` + `use-room.test.tsx`, ikisi de kapandı)                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm --filter @xox/web test` / `test:coverage`  | apps/web    | ⚠️ **695/707** — kalan 12 kırmızı **3 dosyada**, TAMAMI `CTR-003`'ün (henüz başlamamış, `todo`) çakışma kümesi olan `apps/web/app/api/rooms/[code]/route.ts` + `packages/shared/src/rest-contract.ts` ikilisine bağlı: `app/api/rooms/[code]/route.test.ts` (7), `components/JoinCodeField.test.tsx` (4), `app/oda/katil/page.test.tsx` (1). Bu kart başlamadan ÖNCE de aynı 3 dosya aynı sebeple kırmızıydı (oturum başında doğrulandı) — bu karttaki HİÇBİR değişiklik onlara dokunmadı |
| `pnpm lint apps/web packages/db`                 | ikisi       | ✅ temiz (1 bulgu düzeltildi: `rematch.test.ts`'te gereksiz tip iddiası)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm knip`                                      | tüm repo    | ✅ exit 0 (yalnız yapılandırma ipucu, hiç kullanılmayan export/bağımlılık yok)                                                                                                                                                                                                                                                                                                                                                                                                            |
| `prettier --check` (değişen dosyalar)            | db+web      | ✅ temiz (2 dosya `--write` ile düzeltildi)                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Not — dürüstlük:** `pnpm gates`'in kendisi `apps/web` içindeki bu 3 dosya yüzünden kırmızı
kalıyor. Bu, DB-BOARD-001'in kapsamı DIŞINDA: `route.ts` benim çakışma kümemde değil (yalnız
`packages/db/src/{models,rooms}/**`, `apps/web/lib/game/room-view.ts`,
`apps/web/lib/realtime/connection.ts`, `apps/web/lib/client/use-room.test.tsx` bana verildi) ve
`CTR-003` board.json'da tam bu dosya + `rest-contract.ts` için ayrı, bağımlılığı çözülmüş bir kart
olarak duruyor (`deps: [ROOM-API-001, CTR-BOARD-001]`, ikisi de `done`). **Zincirin tam yeşile
inmesi için CTR-003'ün de bu dalgada/sıradaki dalgada koşması gerekiyor** — DB-BOARD-001 kendi
başına bunu kapsamıyordu ve dispatch metninin "diğer altı paket yeşil" varsayımı bu üç dosya için
YANLIŞTI (oturum başında `pnpm --filter @xox/web test` ile 13 dosya/111 test kırmızı çıktı; bunun
109 testi `room-view.ts`/`use-room.test.tsx` kapanınca kendiliğinden düzeldi, kalan 12'si CTR-003'e
ait).

## Kapsam dışına taşan İKİ minik dokunuş (gerekçeli)

- `apps/web/lib/realtime/session.test.ts`: tek bir test (`"şema dışı ama geçerli JSON da
INVALID_MESSAGE'dır"`) `index:99`'un artık **protokol seviyesinde geçerli** olduğunu
  varsaymıyordu — `CTR-BOARD-001` `cellIndexSchema`'yı 11×11 için `0..120`'ye genişletti, yani 99
  artık şema dışı değil. Değeri `121`'e (genişlemiş üst sınırın da dışına) çektim; `connection.ts`
  ya da davranış DEĞİŞMEDİ, yalnız test verisi güncellendi.
- Bu dosya benim resmi çakışma kümemde değildi (`connection.ts` vardı, `session.test.ts` yoktu)
  ama düzeltmeden `apps/web`'in geneli yeşile dönmüyordu — tek satırlık, mekanik bir fixture
  güncellemesiydi (`use-room.test.tsx` ile aynı sınıf).

## Diğer önemli kanıtlar

- **KK-B70** (11×11 dolu tahta < 4 KiB): `room-view.test.ts`'te ölçüldü —
  gerçek `JSON.stringify` çıktısı **889 bayt** (bütçe 4096 bayt, WS `maxPayload` 8 KiB'in yarısı).
- **İkinci kemer aralıkları** (`Model.create` yolu): `board` `hasLengthBetween(9,121)`, `moves`
  `hasAtMostLength(121)`, `moveSchema.index` `min:0 max:120` — hem `rooms` hem `games` şemasında.
  Sınır testleri: 8 REDDEDİLİR, 121 KABUL, 122 REDDEDİLİR (`room.test.ts`, `game.test.ts`).
- **KK-B69 ayrımı**: 121 hamleli bir 11×11 oyunu **kaydedilebilir** (şema izin veriyor) ama 3×3'te 10. hamle kural motorundan `occupied` ile reddedilir — şema ile oda-başına gerçek sınır AYRI
  test edildi (`apply-move.test.ts` → "DB-BOARD-001: odanın KENDİ konfigürasyonu").
  **Nötr eleman körlüğü** notuna uyuldu: `(11,5)` gibi `N−K≠0` bir vaka `board-config.test.ts`,
  `apply-move.test.ts`, `rematch.test.ts`, `summary.test.ts`, `finish.test.ts`, `room-view.test.ts`
  içinde AYRICA sınandı (yalnız `{3,3}` değil).
- **KK-B19**: `createRoom(owner, config = DEFAULT_BOARD_CONFIG)` — `rooms`'a `size`/`winLength`
  yazan TEK yol; `startRematch` bu iki alana DOKUNMUYOR (`rematch.test.ts` bunu doğruluyor).
- **KK-B33**: `rooms` için geri dolum betiği YAZILMADI (TTL 7200 sn zaten kendini boşaltıyor).
- **KK-B34**: `games.size`/`winLength` `finishGame`'de yazılıyor ama `getRoomSummary`/`GET
/api/matches`/ELO/sıralama tarafından HİÇ okunmuyor — yapısal olarak "eski kayıt bayt bayt
  aynı" sağlandı (`finish.test.ts` yeni alanların yazıldığını, hiçbir okuyucunun onlara
  bakmadığını `grep` ile değil kodun kendisiyle kanıtlıyor: `queries/*` ve route'lar bu alanlara
  hiç değinmiyor).

## Commit SHA'ları

```
90f5819 fix(web): toStateMessage size/winLength/lastMove — apps/web'i yeşile döndürür
cc16bd3 feat(db): ADR-0014 tahta konfigürasyonu kalıcılığı — opsiyonel alanlar + tek yazma kapısı
```

Taban: `b18262d Merge branch 'main' into feat/CTR-BOARD-001` (dal `feat/CTR-BOARD-001`'den kesildi,
merge edilmedi — talimat gereği main'e inmedi).

## Değişen dosyalar

- `packages/db/src/models/validators.ts` — `hasLengthBetween`
- `packages/db/src/models/room.ts`, `packages/db/src/models/game.ts` — opsiyonel `size?`/
  `winLength?`, ikinci kemer aralıkları
- `packages/db/src/rooms/board-config.ts` (+ test) — YENİ, tek okuma kapısı
- `packages/db/src/rooms/cas.ts` (+ test) — tipli `board` kanalı, `set.board` guard'ı
- `packages/db/src/rooms/create.ts` (+ test) — `config` parametresi
- `packages/db/src/rooms/apply-move.ts` (+ test) — `resolveBoardConfig` kullanımı
- `packages/db/src/rooms/rematch.ts` (+ test) — yerel `EMPTY_BOARD` kaldırıldı
- `packages/db/src/rooms/summary.ts` (+ test) — `size`/`winLength` eklendi
- `packages/db/src/rooms/finish.ts` (+ test) — `games.size`/`winLength` yazımı
- `packages/db/src/index.ts` — `resolveBoardConfig` dışa verimi
- `apps/web/lib/game/room-view.ts` (+ test) — `size`/`winLength`/`lastMove`
- `apps/web/lib/client/use-room.test.tsx` — fixture (verilen görev)
- `apps/web/lib/realtime/session.test.ts` — tek satır fixture (kapsam dışı, gerekçeli)
