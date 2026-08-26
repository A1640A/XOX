# ADR-0014 — Kalıcılık: opsiyonel alanlar, tek normalleştirici, değişmez yazma kapısında, geri dolum yok

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** SB-08 · KK-B19, KK-B30…B36, KK-B69, KK-B72, KK-B73 · E-18
- **Öncelik:** P0 — yanlış karar canlı veriyi bozar

## Bağlam

`packages/db/src/models/room.ts` beş ayrı yerde 3×3 varsayıyor: yerel `BOARD_SIZE = 9`,
`board` `hasExactLength(9)`, `moves` `hasAtMostLength(9)`, `moveSchema.index` `max: 8`,
`result.line` `isNullOrExactLength(3)`.

İki mongoose gerçeği bu tasarımı kısıtlıyor (ikisi de bu repoda **canlıda doğrulandı**,
`gotchas.md`):

1. `pre('validate')` ve doküman doğrulayıcıları yalnız `doc.save()` / `Model.create()` /
   `insertMany` yolunda çalışır. `findOneAndUpdate` / `updateOne` / `bulkWrite` **atlar** —
   ve `packages/db/src/rooms/cas.ts` tam olarak `findOneAndUpdate` kullanıyor.
2. `runValidators: true` altında bile **çapraz-alan** doğrulaması yapılamaz: doğrulayıcının
   `this`'i dokümanı değil sorguyu gösterir. Yani `board.length === size²` bir şema
   doğrulayıcısıyla **dayatılamaz**.

Üçüncü kısıt yapısal: `RoomDoc`'a **zorunlu** alan eklemek 2026-08-25'te birleşmiş ağacın
typecheck'ini ve `apps/web`'de beş fixture'ı kırdı (W1-02); ayrıca `.lean()` / `aggregate`
okumalarında mongoose varsayılanı **uygulanmaz** — tip doğru, çalışma zamanı yalan söyler
(gotcha örüntü 3).

## Karar

### 1. Alanlar OPSİYONEL (`required` değil, `default` da yok)

```ts
export interface RoomDoc {
  // …
  size?: number // yoksa 3
  winLength?: number // yoksa 3
}
export interface GameDoc {
  // …
  size?: number
  winLength?: number
}
```

Şemada `{ type: Number }` — **`default` verilmez**. Gerekçe: `default`, `.lean()` ve
`aggregate` yollarında uygulanmadığı için "alan hep dolu" yanılsaması üretir; okuma tarafı
zaten tek bir normalleştiriciden geçiyor.

### 2. `resolveBoardConfig(doc)` — okuma tarafının TEK kapısı

```ts
// packages/db/src/rooms/board-config.ts
export function resolveBoardConfig(doc: Pick<RoomDoc, 'size' | 'winLength'>): BoardConfig
```

- İki alan da yoksa → `DEFAULT_BOARD_CONFIG` (`{3,3}`), **sessizce** (KK-B31). Bu meşru eski
  şekildir, anormallik değildir.
- Alan var ama `parseBoardConfig` reddediyorsa → `console.error` + `{3,3}` (KK-B32).
  **Sessiz düşüş yasak**: bozuk veri görünmez kalmamalı.
- `doc.size ?? 3` yazan **hiçbir** tüketici olmayacak; o satır sabitin yedinci kopyasıdır.
  Sonda: `grep -rn 'size ?? 3'` sıfır eşleşme.

Konum `packages/db`'dir çünkü hem `packages/db/src/rooms/*` hem `apps/web` (izinli:
`web → db`) aynı kapıyı kullanmalı. Doğrulamayı kendisi yapmaz, `game-core`'un
`parseBoardConfig`'ine delege eder (kural 4).

### 3. `board.length === size²` değişmezi **yazma kapısında** dayatılır — şemada değil

`casUpdateRoom` tahtayı artık serbest `set` alanı olarak **kabul etmez**; tipli ayrı bir
kanalı vardır:

```ts
export interface CasWriteInput {
  // …
  set?: Record<string, unknown> // 'board' anahtarı YASAK (çalışma zamanı guard + test)
  board?: { cells: readonly Cell[]; config: BoardConfig } // uzunluk BURADA doğrulanır
}
```

`board` verilirse `cells.length === cellCount(config)` kontrol edilir; uymazsa yazma
**yapılmadan** reddedilir. Böylece `rooms.board`'a yazan üç yol (`createRoom`, `applyMove`,
`startRematch`) aynı tek noktadan geçer.

**Dürüstlük notu:** bu, `Room.updateOne(...)`'ı doğrudan çağıran bir kodu durduramaz.
O yolu kapatan şey `cas.ts`'in yazılı disiplini + kod incelemesidir (bugün de öyle).
KK-B35'in sondası bu yüzden **yaptırımı olan kapıya** (`casUpdateRoom`) karşı yazılır:
`size:11` odaya 9 hücreli tahta yazma denemesi reddedilir.

İkinci kemer olarak şema doğrulayıcıları **tek alanlık aralıklara** genişletilir — bunlar
`Model.create` yolunda çalışır ve kaba bozulmayı yakalar:

| Alan               | Bugün                    | Yeni                            |
| ------------------ | ------------------------ | ------------------------------- |
| `board`            | `hasExactLength(9)`      | `hasLengthBetween(9, 121)`      |
| `moves`            | `hasAtMostLength(9)`     | `hasAtMostLength(121)` (KK-B69) |
| `moveSchema.index` | `min:0 max:8`            | `min:0 max:120`                 |
| `result.line`      | `isNullOrExactLength(3)` | `isNullOrLengthBetween(3, 6)`   |
| yerel `BOARD_SIZE` | `9`                      | **SİLİNİR** (KK-B36)            |

### 4. Konfigürasyon yalnız oda **oluşturulurken** yazılır (KK-B19)

`createRoom(owner, config)` `size`, `winLength` ve `cellCount(config)` uzunluğunda boş
tahtayı **tek** `Room.create` çağrısında yazar. `rooms` koleksiyonunda bu iki alanı güncelleyen
**başka hiçbir yol yoktur**. `startRematch` tahtayı sıfırlarken uzunluğu odanın **kendi**
`resolveBoardConfig` sonucundan türetir; `size`/`winLength` alanlarına dokunmaz.
Sonda: `startRematch` sonrası iki alan bit düzeyinde aynıdır.

`waiting` durumunda bile değişiklik yoktur (AS-B03 varsayımı (a) benimsendi). Geri dönüş
yolu: değişiklik istenirse `seats.O === null` koşulu **CAS filtresinin parçası** yapılır ve
`version` artırılır — bugün bu yol açılmıyor.

### 5. Geri dolum betiği YOK — ne `rooms` ne `games` (KK-B33/B34)

`rooms` `updatedAt` üzerinde `expireAfterSeconds = ROOM_TTL_SECONDS (7200)` TTL indeksine
sahiptir: canlı oda kümesinin tamamı deploy'dan en geç **2 saat** sonra kendiliğinden boşalır.
Kendini silen bir koleksiyonu migrate etmek sıfır fayda karşılığı üretim yazma riskidir.

`games` kalıcıdır ama okuma tarafı varsayılanı yeterlidir. **Kritik:** `games.size`/
`winLength` bu özellikte **yazılır ama hiçbir API tarafından okunmaz**. `GET /api/matches`,
ELO hesabı ve sıralama alanlara hiç bakmaz → eski kayıtların yanıtları **baytı baytına**
değişmez (KK-B34 yapısal olarak sağlanır, bir uyum testiyle değil).

Alanların yazılmasının tek sebebi ileriye dönüktür: AS-B04 "(b) boyut başına ayrı havuz
sonradan **ucuzdur**" iddiası ancak geçmiş veri bölünebilirse doğrudur.

### 6. Yeni indeks yok, hamle başına ek Atlas işlemi yok (KK-B72)

Hiçbir sorgu `size` üzerinde filtrelemiyor → indeks gerekmiyor. Instance başına tek change
stream ve hamle başına tek CAS yazması disiplini değişmiyor. 11×11 oyunları **hamle sayısı
kadar** daha çok yazma üretir; bu beklenen bir hacim artışıdır, **ek sorgu değildir**.

`MOVE_TIMEOUT_SECONDS` tüm boyutlarda 60 sn kalır; TTL `updatedAt` üzerinde olduğu için her
hamlede tazelenir, uzun 11×11 oyunları TTL ile silinmez (KK-B73).

### 7. E-18 (bozuk veri) gürültülü kapanır

`size:11` ama `board` 9 hücre olan bir doküman okunursa: `boardFromCells(cells, config)`
uzunluk uyuşmazlığında `RangeError` atar (ADR-0011 kapısı); `apps/web` bunu yakalar,
`console.error` yazar ve istemciye `SERVER_ERROR` döner. Oda `finished` sayılmaz, sonuç
uydurulmaz.

## Gerekçe

- **Neden opsiyonel:** W1-02'nin bedeli ölçüldü (5 fixture + birleşmiş ağaç typecheck'i).
  Ayrıca `default`'a güvenmek `.lean()` yolunda gotcha örüntü 3'e düşer — okuma normalleştiricisi
  her hâlükârda gerekli olduğu için `required`/`default` **hiçbir şey kazandırmaz**, yalnız
  kırılma yüzeyi ekler.
- **Neden tek normalleştirici:** `?? 3` fallback'i her tüketiciye kopyalanırsa varsayılan
  değiştiğinde (ki değişmeyecek) ya da geçersiz veri geldiğinde her kopya farklı davranır.
  Tek kapı, KK-B32'nin gürültüsünü de tek yerde üretir.
- **Neden yazma kapısı, neden şema değil:** kanıtlanmış mongoose davranışı — çapraz-alan
  doğrulaması `findOneAndUpdate`'te **imkânsızdır**. Şemaya yazmak "kural yazılmış ama
  ateşlenmiyor" (gotcha örüntü 1) sınıfının kitabi örneği olurdu: kod incelemede güven verir,
  gerçek ihlalde hiç çalışmaz.
- **Neden `games` alanları yazılıp okunmuyor:** KK-B34'ün "baytı baytına aynı" iddiası bir
  uyum testiyle değil, **hiç okunmayarak** sağlanır. Test edilecek bir davranış farkı yoktur.

## Reddedilen alternatifler

| Alternatif                                                      | Neden reddedildi                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`/`winLength`'i `required: true` yapmak                    | W1-02'de ölçülen bedel: birleşmiş ağaç typecheck'i + 5 fixture. Ayrıca eski dokümanlar okunamaz hâle gelirdi (TTL dolmadan önceki 2 saat).                                                                             |
| `default: 3` vermek                                             | `.lean()` ve `aggregate` yollarında uygulanmaz (gotcha örüntü 3) → tip "hep dolu" der, çalışma zamanı `undefined` verir. Normalleştirici zaten gerekli.                                                                |
| `board.length === size²`'yi şema doğrulayıcısıyla dayatmak      | Mongoose çapraz-alan doğrulaması `findOneAndUpdate` yolunda çalışmaz — kural yazılır, hiç ateşlenmez.                                                                                                                  |
| `rooms` için geri dolum betiği yazmak                           | TTL 2 saatte koleksiyonu boşaltıyor; üretim yazması sıfır fayda karşılığı risk.                                                                                                                                        |
| `games` için geri dolum betiği yazmak                           | Okuma tarafı alanlara hiç bakmıyor; migrate edilecek bir davranış yok.                                                                                                                                                 |
| `games.size` üzerine indeks kurmak                              | Hiçbir sorgu filtrelemiyor. Kullanılmayan indeks yazma maliyeti ve M0'ın 100 işlem/sn bütçesinde gereksiz yük.                                                                                                         |
| Boyut başına ayrı ELO havuzu (AS-B04 (b))                       | Kullanıcı tabanı üç havuzu `LEADERBOARD_MIN_RATED_GAMES`(5) eşiğinin altında bırakır, sıralama boş görünür. Geri dönüş ucuz: `games.size` zaten yazılıyor.                                                             |
| `waiting` durumunda ayar değişikliğine izin vermek (AS-B03 (b)) | "Ayar değişikliği ↔ katılma" yarışı açar: rakip `{6,4}` özetini görüp katılırken kurucu `{11,6}`'ya çevirebilir → US-B03 doğrudan ihlal. Güvenli olduğu tek pencere, yeni oda kurmanın zaten bedava olduğu penceredir. |

## Sonuçlar

- ✅ Eski dokümanlar (alan yok) çalışmaya devam eder; TTL onları 2 saatte temizler.
- ✅ Tahta uzunluğu değişmezi, ateşlendiği kanıtlanabilen tek noktada durur.
- ✅ `GET /api/matches` ve ELO davranışı **hiç değişmez** — çünkü yeni alanlar okunmuyor.
- ⚠️ `casUpdateRoom`'un imzası değişiyor (`board` tipli kanal). Bugünkü tüm çağıranlar
  (`apply-move`, `join`, `detach`, `resign`, `rematch`, `settle`) aynı kartta güncellenir;
  `cas.ts` bu kartın çakışma kümesindedir ve **başka hiçbir kart aynı dalgada ona dokunamaz**
  (W1-03'ün `detachConnection` düzeltmesi tam bu dosyada yaşandı).
- ⚠️ `moves` şema üst sınırı 121'e çıkıyor; **oda başına** gerçek sınır `size²`'dir ve onu
  kural motoru (`isValidMove` — dolu hücreye oynanamaz) sağlar, şema değil. Bu ayrım kart
  kabul kriterine yazılır ki biri "şema 121'e izin veriyor, 3×3'te 121 hamle yazılabilir mi"
  diye sormasın: yazılamaz, çünkü 10. hamle `occupied` ile reddedilir.
