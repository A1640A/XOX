# XOX — Değişken tahta boyutu ve ayarlanabilir kazanma uzunluğu (Spec)

- **Tarih:** 2026-08-25 (dosya adı lead tarafından verildi; yazım günü 2026-08-26)
- **Görev:** SPEC-BOARD-001
- **Durum:** Tamamlandı — açık sorular §9'da, ikisi `blocked`
- **Girdi:** Ömer'in pazarlıksız kararları (§0.1) + kod okuması (§0.2)
- **Çıktı tüketicisi:** `xox-architect` → `xox-planner` → uygulayan agentlar
- **Ön okuma yapıldı:** `docs/memory/gotchas.md` (tekrar eden altı örüntü), `docs/memory/decisions.md`,
  `docs/superpowers/specs/2026-08-24-xox-oyun-spec.md`
- **Kapsam:** Yalnızca tahta boyutu + kazanma uzunluğu. Lead'in verdiği kapsam **genişletilmedi**.

---

## 0. Zemin

### 0.1 Pazarlıksız girdi (tartışılmaz)

| #   | Karar                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modlar **yalnız** 3×3, 6×6, 11×11. Başka boyut yok.                                                                                                                                           |
| 2   | Kazanma uzunluğu (K) **ayarlanabilir** — boyuta gömülü sabit değil, oyuncu seçer.                                                                                                             |
| 3   | 3×3'te bugünkü **kanıtlanmış yenilmezlik korunur**. N > 3'te "güçlü ama süre sınırlı" (alfa-beta + derinlik sınırı + sezgisel değerlendirme). **Matematiksel yenilmezlik iddia edilmeyecek.** |

### 0.2 Bugünkü gerçek — okundu, varsayılmadı

Aşağıdakiler kaynak dosyalardan doğrulandı. `xox-architect` bunları okumadan şema kararı vermemeli.

| Yer                                       | Bugünkü hâl                                                                                                                                                                                                      | Sonuç                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `game-core/src/types.ts`                  | `Board = readonly [Cell ×9]` (**tuple**), `WinLine = readonly [number, number, number]` (**3'lü tuple**)                                                                                                         | İkisi de kırıcı biçimde değişmek zorunda                                                                 |
| `game-core/src/board.ts`                  | `BOARD_SIZE = 9` (**hücre sayısı**, kenar değil), `EMPTY_BOARD` 9 hücre donmuş                                                                                                                                   | Ad yanıltıcı; `size`/`cellCount` ayrımı şart                                                             |
| `game-core/src/board.ts`                  | `cellAt()` paket-özel; gerekçe yorumu "Board tuple olduğu için tüketici `board[4]` yazabilir"                                                                                                                    | Tuple gidince bu gerekçe **çöker** (`noUncheckedIndexedAccess`)                                          |
| `game-core/src/status.ts`                 | `WIN_LINES` 8 satırlık **donmuş sabit dizi**                                                                                                                                                                     | Konfigürasyona göre üretilen memoize fonksiyon olacak                                                    |
| `game-core/src/ai.ts`                     | Saf minimax, budama yok; `WIN_SCORE = 10` değişmezi `> BOARD_SIZE(9)` gerekçesiyle yazılı                                                                                                                        | Derinlik sınırı gelince bu değişmez **yeniden ifade edilmeli**                                           |
| `game-core` kanıt durumu                  | %100 kapsam, %98.49 mutasyon, `ai.test.ts` **tümevarımsal yenilmezlik** (X ve O olarak rakibin tüm oyunları + iki mükemmel AI beraberliği)                                                                       | 3×3 için **aynen korunur**, zayıflatılmaz                                                                |
| `shared/src/primitives.ts`                | `cellIndexSchema = int().min(0).max(8)`, `boardSchema = array(cell).length(9)`                                                                                                                                   | İkisi de genişleyecek                                                                                    |
| `shared/src/game-status.ts`               | `winLineSchema = z.tuple([c, c, c])`, `toTransportStatus` içinde `const [a,b,c] = status.line`                                                                                                                   | 3'lü tuple varsayımı iki yerde                                                                           |
| `shared/src/testids.ts`                   | `TESTID` + `DATA_ATTR` **DONMUŞ**; `cellTestId(i)` zaten genel (`hucre-<i>`)                                                                                                                                     | Hücre kancası değişmeye gerek duymaz; yorumdaki "0..8" güncellenir                                       |
| `shared/src/errors.ts`                    | 20 kodluk `errorCodeSchema`; `message-keys.ts` iki `tr.ts` ağacıyla **birebir** eşliği doğruluyor                                                                                                                | Yeni kod = 3 dosya tek commit'te                                                                         |
| `shared/src/constants.ts`                 | `COMPUTER_MOVE_DELAY_MS = 400`, testi "≤ 1000 ms" (KK-023)                                                                                                                                                       | Gecikme bugün **toplanır**; §3.8'de tabana çevrilir                                                      |
| `db/src/models/room.ts`                   | `const BOARD_SIZE = 9` — **shared'dan bağımsız ikinci kopya**; `board` `hasExactLength(9)`, `moves` `hasAtMostLength(9)`, `moveSchema.index` `min:0 max:8`, `result.line` `isNullOrExactLength(3)`               | Beş ayrı yerde 3×3 varsayımı                                                                             |
| `db` TTL                                  | `roomSchema.index({updatedAt:1}, {expireAfterSeconds: ROOM_TTL_SECONDS=7200})`                                                                                                                                   | **Canlı `rooms` koleksiyonu 2 saatte kendini boşaltır** — geriye dönük uyum stratejisinin dayanağı budur |
| `apps/web/components/board/Board.tsx`     | `const BOARD_SIZE = 3` bileşen içinde (**üçüncü kopya, bu kez kenar**), `grid-cols-3` sabit sınıf, `w-20` sabit hücre, her hücre ayrı `<button>` → **9 tab durağı**, `cellAriaLabel` `/3` ve `%3` ile hesaplıyor | Kenar uzunluğu tek kaynaktan gelmeli                                                                     |
| `apps/web/components/room/RoomScreen.tsx` | `durum-metni` `role="status" aria-live="polite"`                                                                                                                                                                 | Korunacak; büyük tahtada içeriği zenginleşecek                                                           |
| `apps/e2e/fixtures/room.ts`               | `playMove(page, i)` ve `expectCell(page, i, mark)` — indeks tabanlı                                                                                                                                              | İkisi de boyuttan bağımsız, **kırılmıyor**; kazanan üçlüyü elle yazan testler kırılıyor                  |
| `apps/web/app/api/rooms/route.ts`         | `POST /api/rooms` **gövde okumuyor**                                                                                                                                                                             | Opsiyonel gövde eklenecek                                                                                |

---

## 1. Kullanıcı hikayeleri

| ID     | Hikaye                                                                                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-B01 | **Oyuncu** olarak oda kurarken 3×3, 6×6 ve 11×11 arasından seçmek istiyorum, çünkü 3×3 birkaç oyundan sonra hep berabere bitiyor ve sıkılıyorum.                                                                     |
| US-B02 | **Oyuncu** olarak kaç taşı yan yana getirince kazanacağımı kendim seçmek istiyorum, çünkü aynı tahtada hızlı (4 taş) ve uzun (5–6 taş) oyunlar farklı zevkler.                                                       |
| US-B03 | **Odaya katılan oyuncu** olarak tahtaya oturmadan önce hangi boyutta ve kaç taşla oynayacağımı görmek istiyorum, çünkü anlaşmadığım bir oyuna zorlanmak istemiyorum.                                                 |
| US-B04 | **Oyuncu** olarak seçtiğim ayarın oyun başladıktan sonra değişmeyeceğinden emin olmak istiyorum, çünkü kural ortada değişirse oyun anlamını kaybeder.                                                                |
| US-B05 | **Rövanş isteyen oyuncu** olarak aynı ayarla tekrar oynamak istiyorum, çünkü rövanş "aynı oyunu bir daha" demektir.                                                                                                  |
| US-B06 | **Oyuncu** olarak bilgisayara karşı da büyük tahtada oynamak istiyorum, çünkü rakip beklemeden 11×11 denemek istiyorum.                                                                                              |
| US-B07 | **Oyuncu** olarak bilgisayarın büyük tahtada ne kadar güçlü olduğunu dürüstçe öğrenmek istiyorum, çünkü "yenilmez" yazıp yenilen bir rakip beni aldatır.                                                             |
| US-B08 | **Telefondan oynayan oyuncu** olarak 11×11 tahtanın tamamını ekranda görmek ve hücrelere yanlışlıkla değil isteyerek basmak istiyorum, çünkü kaydırmalı tahtada rakibin tehdidini göremem.                           |
| US-B09 | **Ekran okuyucu kullanan oyuncu** olarak 11×11 tahtada da nerede olduğumu, rakibin nereye oynadığını ve kazanan çizginin nerede olduğunu duymak istiyorum, çünkü 121 hücreyi tek tek dinlemek oyunu oynanamaz kılar. |
| US-B10 | **Klavyeyle oynayan oyuncu** olarak tahtayı ok tuşlarıyla gezmek istiyorum, çünkü "Pes et" düğmesine ulaşmak için 121 kez Tab'a basmak istemiyorum.                                                                  |
| US-B11 | **Mevcut oyuncu** olarak bu değişiklikten sonra eski alışkanlığımla (3×3) hiçbir ek adım olmadan oynamaya devam etmek istiyorum, çünkü yeni seçenekler eski akışı bozmamalı.                                         |

---

## 2. Kararın kalbi — boyut × kazanma uzunluğu tablosu

### 2.1 İzin verilen kombinasyonlar (sözleşme)

| Tahta | Hücre | İzinli K      | **Varsayılan K** | Kazanma hattı sayısı (K varsayılanda) |
| ----- | ----- | ------------- | ---------------- | ------------------------------------- |
| 3×3   | 9     | **{3}**       | **3**            | 8                                     |
| 6×6   | 36    | **{4, 5}**    | **4**            | 2·(6·3) + 2·3² = 54                   |
| 11×11 | 121   | **{4, 5, 6}** | **5**            | 2·(11·7) + 2·7² = 252                 |

Bu tablo **elle yazılmış donmuş bir sabittir** (`BOARD_MODES`), bir formülden türetilmez.
Gerekçe: gotcha örüntü 2 — beklentiyi sabitten türetmek sabit değişikliğine kör yapar. Formül
(§2.2) yalnız gerekçeyi anlatır, kodda kaynak değildir.

### 2.2 Sınırların gerekçesi (keyfi sayı yok)

**Alt sınır K ≥ 3 — mutlak.**
K=1'de ilk hamle oyunu kazanır. K=2'de ilk oyuncu ikinci hamlesinde çift tehdit kurar ve en geç
üçüncü hamlesinde kazanır. İkisi de oyun değil, animasyon.

**Alt sınır K ≥ 4 — N > 3 olan her tahtada.**
m,n,3 oyunu, kenarlardan biri ≥ 4 olan her tahtada **ilk oyuncunun zorla kazandığı** bir oyundur
ve kazanma tekniği (çatal / çift tehdit) birkaç oyunda kendiliğinden keşfedilir. Yani 6×6 veya
11×11'de K=3 seçilirse oyun teorik olarak değil **pratikte de** bozulur: ikinci oyuncu her seferinde
kaybeder ve bunu ilk akşam fark eder. Lead'in "11×11'de 3 taş seçilirse oyun bozulur mu" sorusunun
cevabı: **evet, bozulur — bu yüzden seçilemez.**

**K = 3 yalnız 3×3'te.**
3×3 + 3 taş, iki taraf da doğru oynarsa **beraberlik**tir (klasik XOX). Bu, bugünkü tümevarımsal
yenilmezlik kanıtının dayandığı gerçektir. 3×3'te K=3 dışında anlamlı bir değer **yoktur**: K=1/2
oyunu öldürür, K>3 imkânsızdır. Bu yüzden 3×3'te kazanma uzunluğu bir seçim değil, **sabit bir
bilgi** olarak gösterilir (§3.6, KK-B49).

**Üst sınır K ≤ N − 1 — N > 3 olan her tahtada.**
K = N, kazanan hattın bir satırın/sütunun/ana köşegenin tamamını kaplaması demektir. 6×6'da bu
yalnız 14 hattır ve her biri tek bir rakip taşıyla ölür — beraberlik fiilen zorunludur. Kararlı
sonuç üretemeyen bir seçenek oyun modu değildir. Bu kural 6×6'dan K=6'yı düşürür; 11×11'de K=6
hâlâ 204 hat bırakır, kararlı kalır.

**Üst sınır K ≤ 6 — mutlak.**
(a) 5 taş insan standardıdır (freestyle gomoku); 6 taşın da yerleşik bir oyun kültürü vardır;
7+ için yoktur. (b) Sezgisel değerlendirme, K'ye bağlı örüntü sınıflarıyla çalışır (açık-2,
açık-3, açık-4, kapalı-4…). Her yeni K, yeni bir örüntü sınıfı ve yeni bir ağırlık kalibrasyonu
demektir; test yüzeyi doğrusal değil çarpımsal büyür. (c) 11×11'de K ≥ 7 beraberlik bölgesini
hızla büyütür.

**11×11 + 5 = standart freestyle gomoku** olduğu için 11×11'in varsayılanıdır.
**6×6 + 4** varsayılandır çünkü 6×6'da K=5 belirgin biçimde beraberliğe kayar (54 → 32 hat) ve
K=4 "yerçekimsiz Connect Four" hissiyle kararlı, tanıdık bir oyun verir.

**Dürüstlük notu — ilk oyuncu avantajı.** Strateji-çalma argümanı gereği hiçbir m,n,k oyununda
ikinci oyuncunun kazanma stratejisi yoktur; yani her mod ya beraberlik ya ilk-oyuncu galibiyetidir.
6×6+4 ve 11×11+5 mükemmel oyunda büyük olasılıkla ilk oyuncu lehinedir. Bu **kabul edilir**, çünkü
(i) gerekli oyun derinliği insan ve bizim AI'mız için ulaşılamaz, (ii) rövanşta koltuklar zaten
takas ediliyor (W1-02 kararı), yani avantaj çift bazında dengeleniyor. Kriter: KK-B18.

### 2.3 Kazanma kuralı: **freestyle** — K veya **daha fazlası** kazanır

K=5 iken 6'lı bir dizi de galibiyettir (overline sayılır). Renju/pro yasakları (3-3, 4-4, swap2)
**yok**. Bu bilinçli bir karardır çünkü aksi hâlde "tam K, fazlası değil" kuralı kazanma tespitini
pencere taramasından uzunluk ölçmeye çevirir ve `data-kazanan` işaretlenecek hücre kümesi
belirsizleşir. Kriter: KK-B24.

---

## 3. Kabul kriterleri

Her kriter gözlemlenebilir. `[BİRİM]` Vitest, `[E2E]` Playwright (`apps/e2e`), `[MANUEL]` insan.
Numaralandırma `KK-B<nn>` — mevcut `KK-<nnn>` uzayıyla çakışmaz.

### 3.1 Konfigürasyon sözleşmesi

- **KK-B01** `[BİRİM]` `BOARD_MODES` sabiti tam olarak üç boyut içerir: `3`, `6`, `11`. Test bu üç
  sayıyı **çıplak** yazar, sabitten türetmez. Dördüncü bir boyut eklenirse test kırmızıya döner.
- **KK-B02** `[BİRİM]` İzinli kazanma uzunlukları tam olarak: 3 → `[3]`, 6 → `[4,5]`, 11 → `[4,5,6]`.
  Test bu üç diziyi **elle yazılmış beklenti tablosundan** doğrular (gotcha örüntü 2: kendine
  referanslı test silmeyi göremez).
- **KK-B03** `[BİRİM]` Varsayılanlar tam olarak: 3 → 3, 6 → 4, 11 → 5. Çıplak sayılarla yazılır.
- **KK-B04** `[BİRİM]` Her boyutun varsayılan K değeri, o boyutun izinli K listesinin **üyesidir**
  (tablo-içi tutarlılık; bu kriter türetilmiş olabilir, KK-B02/B03'ün yerine geçmez).
- **KK-B05** `[BİRİM]` `parseBoardConfig(x)` şu girdilerin **hepsini** reddeder ve reddetme sebebi
  ayırt edilebilir: `{size:4,winLength:3}` (boyut listede yok), `{size:3,winLength:4}` (K > N),
  `{size:3,winLength:2}` (K < 3), `{size:6,winLength:3}` (N>3'te K<4), `{size:6,winLength:6}`
  (K = N), `{size:11,winLength:7}` (K > 6), `{size:11.5,winLength:5}` (tam sayı değil),
  `{size:-3,winLength:3}`, `{size:'11',winLength:'5'}` (tip), `{}` + `null` + `undefined` (§3.4'te
  varsayılana düşer, hata değildir).
- **KK-B06** `[BİRİM]` `parseBoardConfig` başarılı sonucu **donmuş** (`Object.isFrozen === true`)
  bir nesnedir — `EMPTY_BOARD`/`WIN_LINES` ile aynı gerekçe: uzun ömürlü bir sunucu sürecinde tek
  bir yazma sonraki tüm oyunları bozar.
- **KK-B07** `[BİRİM]` `winLines(config)` her konfigürasyon için beklenen **sayıda** hat üretir:
  (3,3)→8, (6,4)→54, (6,5)→32, (11,4)→304, (11,5)→252, (11,6)→204. Sayılar çıplak yazılır.
- **KK-B08** `[BİRİM]` `winLines({size:3,winLength:3})` **bugünkü `WIN_LINES` dizisiyle birebir
  aynı sekiz hattı, aynı sırada** üretir. Beklenti bugünkü sabitin **kopyalanmış elle yazılmış
  hâlidir**, `WIN_LINES`'a referans değildir.
- **KK-B09** `[BİRİM]` `winLines(config)` dönüşü ve içindeki her hat `Object.isFrozen === true`.
- **KK-B10** `[BİRİM]` `winLines(config)` aynı konfigürasyon için **aynı referansı** döner
  (memoizasyon), farklı konfigürasyonlar için farklı referans döner.

### 3.2 Oda kurma, katılma, rövanş

- **KK-B11** `[E2E]` Ana sayfada oda kurarken tahta boyutu üç seçenek olarak görünür ve seçilen
  boyut `tahta-boyut-<n>` kancasında `aria-pressed="true"` taşır.
- **KK-B12** `[E2E]` Boyut 6 seçildiğinde kazanma uzunluğu seçenekleri tam olarak `4` ve `5`;
  boyut 11 seçildiğinde `4`, `5`, `6`; boyut 3 seçildiğinde **hiç seçenek yoktur**, yerine
  "3 taş (3×3 tahtada sabit)" metni görünür.
- **KK-B13** `[E2E]` Boyut 11 + K 6 seçiliyken boyut 6'ya değiştirilirse K **otomatik olarak 6×6'nın
  varsayılanına (4) düşer**; geçersiz bir kombinasyon ekranda hiçbir anda görünmez.
- **KK-B14** `[BİRİM]` `POST /api/rooms` gövdesi `{size, winLength}` kabul eder; **gövde yoksa ya da
  boşsa** oda `{3,3}` ile kurulur ve 201 döner (eski istemci kırılmaz).
- **KK-B15** `[BİRİM]` `POST /api/rooms` gövdesinde yalnız `{size:11}` gelirse oda `{11,5}` ile
  kurulur (eksik alan varsayılana düşer, reddedilmez).
- **KK-B16** `[BİRİM]` `POST /api/rooms` KK-B05'teki geçersiz kombinasyonların her biri için
  **HTTP 400** ve `code: 'INVALID_BOARD_CONFIG'` döner; oda **oluşturulmaz** (`rooms` sayısı artmaz).
  İstemci doğrulaması tek savunma değildir.
- **KK-B17** `[E2E]` `GET /api/rooms/[code]` yanıtı `size` ve `winLength` taşır; katılma ekranı
  koltuğa oturmadan önce `oyun-ayari-ozeti` kancasında "11×11 tahta · 5 taş yan yana" metnini
  gösterir.
- **KK-B18** `[E2E]` Rövanş kabul edildiğinde yeni tahta **aynı** `size`/`winLength` ile boş
  başlar; `tahta` elementinin `data-boyut` ve `data-kazanma` değerleri değişmez, koltuklar
  (mevcut davranış) takas edilir.
- **KK-B19** `[BİRİM]` Oda `state:'playing'` iken `size`/`winLength` alanlarını değiştirmeye çalışan
  hiçbir yazma yolu **yoktur**: `rooms` koleksiyonuna bu iki alanı güncelleyen tek CAS yolu
  `createRoom`'dur ve o da yalnız doküman oluştururken yazar. Sonda: `startRematch` çağrıldıktan
  sonra dokümandaki iki alan değişmemiştir.

### 3.3 Kural motoru (`packages/game-core`)

- **KK-B20** `[BİRİM]` **3×3 yenilmezlik kanıtı bozulmadan geçer.** `ai.test.ts`'teki tümevarımsal
  koşu (X olarak, O olarak, iki mükemmel AI) **hiçbir iddiası zayıflatılmadan** yeşil kalır ve
  numaralandırdığı oyun sayısı değişmez. İzin verilen tek düzenleme: yeni konfigürasyon
  parametresinin varsayılanla geçilmesi. Bir iddia silinir ya da gevşetilirse kriter ihlal edilmiştir.
- **KK-B21** `[BİRİM]` `pnpm mutation` sonrası `game-core` mutasyon skoru **≥ %98** kalır
  (bugün %98.49). Düşerse yeni kod test edilmemiş demektir.
- **KK-B22** `[BİRİM]` `evaluateStatus(board, config)` her konfigürasyonda `won` / `draw` /
  `playing` üçlüsünü doğru döner; `won.line` **tam olarak K indeks** içerir ve hepsi kazananın
  taşını taşır.
- **KK-B23** `[BİRİM]` Bir hamle **aynı anda iki hattı** tamamlıyorsa (ör. 11×11'de kesişen yatay ve
  dikey beşli) sonuç **deterministiktir**: `winLines(config)` sırasında ilk bulunan hat döner.
  Aynı tahta iki kez değerlendirildiğinde aynı `line` gelir.
- **KK-B24** `[BİRİM]` **Freestyle:** K=5 iken 6 taşlık kesintisiz dizi de galibiyettir; dönen
  `line` bu dizinin **ilk 5 indeksidir** (pencere tarama sırası gereği) ve bu davranış testle
  kilitlenir — kural sessizce "tam 5" olarak değiştirilemez.
- **KK-B25** `[BİRİM]` Tahta tamamen doluyken ve hiçbir hat tamamlanmamışken sonuç `draw`'dır;
  11×11 için bu 121 taşlık bir tahtayla test edilir.
- **KK-B26** `[BİRİM]` `wouldWin(board, index, player, config)` hızlı yolu (son taş etrafında dört
  yön taraması) ile `evaluateStatus` tam taraması, en az 500 pozisyonluk sabit bir korpusun
  **tamamında** aynı sonucu verir. İki uygulama birbirinden türetilmez; korpus rastgele değil
  tohumlu üreteçle sabittir (yeniden üretilebilirlik).
- **KK-B27** `[BİRİM]` `applyMove` aralık dışı indeksi konfigürasyonun **kendi** hücre sayısına göre
  reddeder: `{3,3}` tahtasında indeks 9 → `out-of-range`; `{11,5}` tahtasında indeks 120 geçerli,
  121 → `out-of-range`.
- **KK-B28** `[BİRİM]` `game-core` hâlâ **sıfır bağımlılıklı** ve saf: `package.json`'da
  `dependencies` boş, `"sideEffects": false` korunur, hiçbir dosya G/Ç yapmaz.
- **KK-B29** `[BİRİM]` `game-core` **kapsamı %100 kalır**. Yeni eklenen hiçbir dal kapsam dışı
  değildir; ulaşılamaz hâle gelen bir dal varsa **sessizce silinmez**, gürültülü bırakılır
  (gotcha örüntü 2 nüansı, W1-02 `room-view.ts` örneği).

### 3.4 Geriye dönük uyum

- **KK-B30** `[BİRİM]` `RoomDoc` arayüzünde `size` ve `winLength` **opsiyoneldir**
  (`size?: number`). Zorunlu (`required: true`) **değildir**. Gerekçe: 2026-08-25'te `RoomDoc`'a
  zorunlu alan eklemek birleşmiş ağacın typecheck'ini ve `apps/web`'de 5 fixture'ı kırdı; ayrıca
  `.lean()`/`aggregate` okumalarında mongoose varsayılanı uygulanmaz → tip doğru, çalışma zamanı
  yalan söyler (gotcha örüntü 3).
- **KK-B31** `[BİRİM]` `size`/`winLength` alanı **olmayan** bir `rooms` dokümanı okunduğunda
  `resolveBoardConfig(doc)` `{size:3, winLength:3}` döner. Bu tek normalleştirici, `apps/web`'in
  oda okuma yolunda **tek geçiş kapısıdır**; hiçbir tüketici `doc.size ?? 3` yazmaz (sabitin
  ikinci kopyası olur).
- **KK-B32** `[BİRİM]` `size`/`winLength` alanı olan ama **geçersiz** (`{size:4}`) bir doküman
  okunduğunda `resolveBoardConfig` `{3,3}`'e **sessizce düşmez**: `console.error` ile gürültü
  çıkarır ve `{3,3}` döner. Sessiz düşüş, bozuk veriyi görünmez kılar.
- **KK-B33** `[BİRİM]` **`rooms` için geri dolum (backfill) betiği YOKTUR ve yazılmayacaktır.**
  Sonda: `roomSchema`'nın `updatedAt` TTL indeksi `ROOM_TTL_SECONDS`(7200) ile kuruludur, yani canlı
  oda kümesinin tamamı deploy'dan en geç 2 saat sonra kendiliğinden boşalır. Kendini silen bir
  koleksiyonu migrate etmek sıfır fayda karşılığı üretim yazma riskidir.
- **KK-B34** `[BİRİM]` `games` (kalıcı) koleksiyonunda `size`/`winLength` **opsiyoneldir**; alanı
  olmayan eski kayıtlar 3×3/3 olarak okunur. `GET /api/matches` ve ELO hesabı, alanı olmayan
  kayıtlarda **hiçbir davranış değişikliği göstermez** — sonda: alan eklemeden önceki ve sonraki
  yanıt gövdeleri eski kayıtlar için baytı baytına aynıdır.
- **KK-B35** `[BİRİM]` `board.length === size²` değişmezi **şema doğrulayıcısıyla değil, tek yazma
  kapısıyla** (`createRoom` + `cas.ts`) sağlanır. Gerekçe: mongoose doküman doğrulayıcısı
  `findOneAndUpdate`/`bulkWrite` yolunda atlanır ve çapraz-alan doğrulaması `runValidators` altında
  `this`'e erişemez (gotcha: "Mongoose doküman hook'u `updateOne` ile ATLANIR"). Sonda: `updateOne`
  ile 9 hücreli bir tahtayı `size:11` odaya yazmayı **deneyen** bir test vardır ve yazma reddedilir.
- **KK-B36** `[BİRİM]` `db/src/models/room.ts` içindeki yerel `const BOARD_SIZE = 9` **silinir**;
  hücre sayısı `@xox/shared`'dan gelir. Sonda: repoda `BOARD_SIZE`/`9` hücre varsayımının ikinci
  bir kopyası kalmadığını gösteren grep (yorum satırları elenerek:
  `grep -vE '^\s*(\*|//|/\*)'`).
- **KK-B37** `[BİRİM]` `boardSchema` 9–121 arası uzunluk kabul eder; **tam uzunluk** kontrolü
  sunucuda odanın kendi `size²`'sine karşı yapılır. Gerekçe: zod şeması bir şekil koruyucusudur,
  kural motoru değildir; ayrıştırma anında oda konfigürasyonu erişilebilir değildir.
- **KK-B38** `[BİRİM]` `cellIndexSchema` 0–120 arası tam sayı kabul eder; oda boyutuna göre
  daraltma sunucudadır ve aşan indeks **mevcut** `move:rejected` `reason:'out-of-range'` ile
  reddedilir — protokole yeni bir reddetme sebebi **eklenmez**.
- **KK-B39** `[BİRİM]` `winLineSchema` 3–6 uzunlukta indeks dizisi kabul eder (tuple değil).
  `toTransportStatus` artık `[a,b,c]` destructuring yapmaz; hattı **kopyalayarak** döner (motorun
  donmuş iç dizisine referans taşımama gerekçesi korunur).
- **KK-B40** `[E2E]` Eski (güncellenmemiş) bir istemci 11×11 odaya bağlanırsa **sessizce bozuk
  tahta çizmez**: `boardSchema` ihlali `INVALID_MESSAGE` sayılır ve 3 ihlalden sonra bağlantı 4400
  ile kapanır. Bu **kabul edilen** davranıştır — gürültülü başarısızlık, sessiz bozulmaya tercih
  edilir. Şart: web ve mobil aynı sürümde yayınlanır.
- **KK-B41** `[E2E]` **Mevcut 3×3 E2E senaryolarının tamamı değiştirilmeden geçer.**
  `playMove`/`expectCell` imzaları korunur; boyut parametresi **opsiyonel** eklenir. Kırılması
  beklenen tek sınıf: kazanan üçlüyü elle yazan iddialar — bunlar konfigürasyondan üretilen
  yardımcıya taşınır.

### 3.5 Bilgisayara karşı oyun ve yapay zekâ

- **KK-B42** `[E2E]` Bilgisayar ekranında boyut ve kazanma uzunluğu **oda akışından bağımsız**
  seçilir (sunucuya istek gitmez, oda kurulmaz); varsayılan `{3,3}`'tür, yani bugünkü akış tıklama
  sayısı olarak **değişmez**.
- **KK-B43** `[BİRİM]` `{3,3}` + `unbeatable`: bugünkü **tam minimax** yolu çalışır (budama/derinlik
  sınırı devreye girmez) ve KK-B20'nin tümevarımsal kanıtı bu yolu kapsar.
- **KK-B44** `[BİRİM]` N > 3'te `chooseMove` alfa-beta budama + **yinelemeli derinleşme** kullanır
  ve **duvar saati bütçesiyle** kesilir (sabit derinlikle değil). Sonda: bütçe 1 ms'ye
  düşürüldüğünde fonksiyon yine **geçerli bir hamle** döner ve hata fırlatmaz.
- **KK-B45** `[BİRİM]` N > 3'te aday hamleler, mevcut taşlara Chebyshev uzaklığı ≤ 2 olan boş
  hücrelerle sınırlıdır (tahta tamamen boşsa merkez). Sonda: 11×11'de tek taş varken aday sayısı
  ≤ 24'tür, 121 değil. Bu daraltma olmadan hiçbir süre bütçesi tutturulamaz.
- **KK-B46** `[BİRİM]` N > 3'te AI, **hemen kazanabileceği** hamleyi kaçırmaz ve rakibin **bir
  hamlede kazanacağı** hattı bloklar. Her (N,K) kombinasyonu için en az 10 kurulmuş pozisyonla
  doğrulanır. Bu, "yenilmez" iddiası değil, **asgari yeterlilik** iddiasıdır.
- **KK-B47** `[BİRİM]` **Hiçbir metin, hiçbir yerde N > 3 için yenilmezlik iddia etmez.** Sonda:
  `tr.computer.unbeatable` ('Yenilmez') etiketi yalnız `size === 3` iken render edilir; N > 3'te
  aynı zorluk değeri `tr.computer.hard` ('Zor') olarak gösterilir ve `tr.computer.strengthNote`
  görünür. **`Difficulty` tipi ve `zorluk-unbeatable` test-id'si değişmez** (sözleşme donuk) —
  değişen yalnız etikettir.
- **KK-B48** `[BİRİM]` `ai.ts`'teki `WIN_SCORE > BOARD_SIZE` değişmezi **yeniden ifade edilir**:
  derinlik sınırı geldiği için sınır artık hücre sayısı değil, `maxDepth`tir. Yeni değişmez kodda
  yazıyla belgelenir ve ihlali (ör. `WIN_SCORE = maxDepth`) bir testle **öldürülür** — bugünkü
  yorumun gerekçesi (eşit/altında kalırsa geç kazanç beraberliğe düşer) aynen geçerlidir.

### 3.6 Arayüz — 11×11 gerçeği

- **KK-B49** `[E2E]` `tahta` elementi `data-boyut="3|6|11"` ve `data-kazanma="3|4|5|6"` taşır;
  hücre sayısı `data-boyut`ün karesine **eşittir** (`hucre-0` … `hucre-<n²−1>` tamamı DOM'da).
- **KK-B50** `[E2E]` **Tahtanın tamamı her zaman görünürdür.** 360×640 CSS px görünüm alanında
  11×11 tahtada `tahta` elementinin `scrollWidth === clientWidth` ve `scrollHeight ===
clientHeight`; sayfada yatay kaydırma çubuğu oluşmaz. **Karar: ölçekle, kaydırma.**
  Reddedilen: kaydırılabilir/yakınlaştırılabilir tahta — rakibin tehdidini ve kazanan çizgiyi tek
  bakışta görmek oyunun kendisidir; ayrıca pan/zoom, ekran okuyucu ve anahtar-erişim
  hareketleriyle çakışır.
- **KK-B51** `[E2E]` Hücre dokunma hedefi: 3×3 ve 6×6'da **≥ 44×44 CSS px**; 11×11'de
  **≥ 28×28 CSS px** ve hücreler arası boşluk **≥ 2 px**. Aritmetik: 360 px genişlikte 16 px yan
  dolgu düşünce 344 px kalır; 11×28 + 10×2 = 328 ≤ 344. 28, WCAG 2.2 SC 2.5.8'in 24×24 (AA)
  eşiğini payla aşar.
- **KK-B52** `[E2E]` Görünüm alanı 11×11'de 24 px hücreyi bile karşılayamayacak kadar darsa
  (< ~290 px) tahta **yine oynanabilir** kalır (kilitlenmez) ve `tr.boardConfig.narrowScreen`
  ipucu görünür. Oyuncu katıldığı bir oyundan asla dışlanmaz.
- **KK-B53** `[E2E]` X ve O işaretleri en küçük render boyutunda hücre genişliğinin **≥ %60**'ını
  kaplar ve hücre arka planına karşı kontrast oranı **≥ 4.5:1**'dir (ölçüm `ui-tokens` değerleriyle,
  eşik değerin seçilme gerekçesiyle aynı sayı — gotcha: "testin eşiği gerekçeyle aynı olmalı").
- **KK-B54** `[E2E]` Kazanan çizgi 11×11'de **üç sinyalle birden** işaretlenir: (a) kazanan
  hücrelerde `data-kazanan="true"`, (b) kazanan olmayan tüm hücrelerde en az %40 opaklık düşüşü,
  (c) kazanan hücrelerde **renkten bağımsız** ≥ 3 px dış çizgi (WCAG 1.4.1 — renk tek ayırt edici
  olamaz).
- **KK-B55** `[E2E]` **Son hamle işaretlenir.** Rakibin en son oynadığı hücre `data-son-hamle="true"`
  taşır ve yeni bir hamle gelene kadar kalır. 6×6 ve 11×11'de **zorunludur**: 121 hücrede bu işaret
  olmadan "rakibin hamlesini anında görmek" (US-P0-08) gözlemlenemez hâle gelir. 3×3'te de
  gösterilir (tek uygulama).
- **KK-B56** `[BİRİM]` Izgara sütun sayısı `board.length`'ten türetilir, sabit bir sınıf adından
  (`grid-cols-3`) değil. Sonda: bileşene 36 hücre verildiğinde 6 sütun, 121 hücre verildiğinde
  11 sütun oluşur.
- **KK-B57** `[BİRİM]` `board.length` `{9, 36, 121}` kümesinin dışındaysa bileşen **bozuk ızgara
  çizmez**: hata durumu render eder ve `console.error` ile gürültü çıkarır. (Yeniden bağlanan bir
  istemcinin bayat reducer'ı bu duruma düşebilir.)

### 3.7 Erişilebilirlik — kazanımlar kaybedilemez

- **KK-B58** `[BİRİM]` `role="grid"` → `role="row"` → `role="gridcell"` üçlüsü **her boyutta**
  korunur (bugünkü inceleme bulgusunun düzeltmesi geri alınmaz).
- **KK-B59** `[BİRİM]` Tahta **tek bir tab durağıdır** (roving tabindex): grid içinde yalnız bir
  hücrenin `tabIndex=0`, geri kalanının `tabIndex=-1` değeri vardır. Sonda: 11×11'de tahtadan
  sonraki odaklanabilir elemana ulaşmak **1** Tab basışı alır, 121 değil. Bu değişiklik **3×3'te de
  uygulanır** (tek uygulama; orada da 9 durak → 1 durak iyileşmesidir).
- **KK-B60** `[BİRİM]` Klavye gezinmesi: `←→↑↓` bir hücre; `Home`/`End` satır başı/sonu;
  `Ctrl+Home`/`Ctrl+End` ilk/son hücre; `PageUp`/`PageDown` ±5 satır; `Enter`/`Space` oynar.
  **Kenarlarda sarma yoktur** (yanlışlıkla karşı kenara atlamayı önler). Her tuş ayrı test edilir.
- **KK-B61** `[BİRİM]` Grid elementi `aria-label` taşır: "11×11 oyun tahtası, kazanmak için 5 taş
  yan yana". Bugün grid'in **hiç etiketi yok**; bu bir kazanç, gerileme değil.
- **KK-B62** `[BİRİM]` Grid `aria-rowcount`/`aria-colcount`, her hücre `aria-rowindex`/
  `aria-colindex` taşır — ekran okuyucu 121 hücreyi okumadan konumu bildirebilsin.
- **KK-B63** `[BİRİM]` Hücre `aria-label`'ı bugünkü biçimi korur ("3. satır 2. sütun, boş") ama
  satır/sütun hesabı **konfigürasyondan** gelir; bileşen içindeki `const BOARD_SIZE = 3` kopyası
  silinir. Metin `tr` ağacından gelir, bileşene gömülü kalmaz.
- **KK-B64** `[BİRİM]` `durum-metni` `role="status" aria-live="polite"` **korunur** ve içeriği
  büyük tahtada zenginleşir: sıra değişiminde yalnız **fark** duyurulur —
  "Rakip 4. satır 7. sütuna oynadı. Sıra sende." Tahtanın tamamı **asla** okunmaz.
- **KK-B65** `[BİRİM]` Oyun bittiğinde kazanan çizginin **koordinatları** duyurulur:
  "Kazandın! 5 taş: 3. satır 4. sütundan 3. satır 8. sütuna." Ekran okuyucu kullanıcısı kazancın
  nerede olduğunu görsel olmayan yoldan öğrenir.
- **KK-B66** `[BİRİM]` Otomatik erişilebilirlik denetimi (`axe`) 3×3, 6×6 ve 11×11 tahtalarda
  **sıfır ihlal** verir.

### 3.8 Süre ve performans

- **KK-B67** `[BİRİM]` **1000 ms tepki üst sınırı korunur** ve gecikme artık **toplanmaz, taban
  olur**: bilgisayarın hamlesi `max(0, COMPUTER_MOVE_DELAY_MS − gerçekDüşünmeSüresi)` kadar
  bekletilir. Sonda: `{3,3}`'te toplam gecikme ≈ 400 ms (bugünkü his değişmez), `{11,5}`'te
  düşünme 800 ms sürerse toplam **≈ 800 ms**, 1200 ms değil.
- **KK-B68** `[BİRİM]` `chooseMove` **her** desteklenen (N,K) için, ≥ 200 pozisyonluk sabit
  korpusun **tamamında**, `AI_BUDGET_MS` içinde geçerli bir hamle döner. Ölçüm maksimumdur,
  ortalama değil. `AI_BUDGET_MS` önerisi **800**; kesin değer AS-B01'in ölçümüyle sabitlenir.
- **KK-B69** `[BİRİM]` `moves` dizisinin üst sınırı `size²`dir (3×3→9, 6×6→36, 11×11→121);
  `hasAtMostLength(9)` sabiti kaldırılır. Sonda: 121 hamleli bir 11×11 oyunu kaydedilebilir.
- **KK-B70** `[BİRİM]` `state` mesajının serileştirilmiş boyutu 11×11 dolu tahtada **< 4 KiB**
  kalır (WS `maxPayload` 8 KiB'ın yarısı). Ölçüm gerçek `JSON.stringify` çıktısı üzerindedir.
- **KK-B71** `[BİRİM]` Bir `state`/`move:applied` mesajı 11×11'de **≤ 2 hücre** bileşenini yeniden
  render eder (değişen hücre + bekleyen hücre). Hücreler memoize edilir. Sayaç tabanlı bir testle
  ölçülür — "hızlı hissettiriyor" gözlemi kriter değildir.
- **KK-B72** `[BİRİM]` Özellik, hamle başına **hiçbir ek Atlas işlemi** getirmez: instance başına
  tek change stream ve hamle başına tek CAS yazması disiplini korunur (M0'da 100 işlem/sn bütçesi).
  11×11 oyunları hamle sayısı kadar daha çok yazma üretir; bu **beklenen**dir, ek sorgu **değildir**.
- **KK-B73** `[BİRİM]` `MOVE_TIMEOUT_SECONDS` **tüm boyutlarda 60 saniye** kalır (AS-B02'de
  gerekçelendirildi). `ROOM_TTL_SECONDS` TTL'i `updatedAt` üzerindedir ve her hamlede tazelenir,
  dolayısıyla uzun 11×11 oyunları TTL ile silinmez. Sonda: 100 hamlelik simüle bir oyunda oda
  dokümanı hâlâ vardır.

---

## 4. Edge case listesi

| #    | Durum                                                                       | Beklenen davranış                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | **Rakip 11×11 oyunun ortasında sekmeyi kapatır**                            | Mevcut davranış aynen: 30 sn grace (`DISCONNECT_GRACE_SECONDS`), sonra `abandon` ile kalan oyuncu kazanır. Boyut hiçbir şeyi değiştirmez; `result.line` `null` kalır.                                                                  |
| E-02 | **Aynı kullanıcı iki sekmede aynı 11×11 odaya katılır**                     | Mevcut takeover: eski bağlantı `SESSION_TAKEOVER` (4409) ile kapanır, yeniden bağlanma **denenmez**. Yeni sekme tam `state` alır ve 121 hücreyi çizer. Konfigürasyon odadan gelir, sekmeden değil — iki sekme farklı boyut gösteremez. |
| E-03 | **Ağ koptu, sıra karşı taraftaydı, bağlantı geri geldi**                    | `state` mesajı tam tahtayı taşır. İstemci sütun sayısını **`board.length`'ten** türetir (KK-B56); bayat bir 9-hücre varsayımıyla çizmez. Uzunluk beklenmedikse KK-B57 hata yolu.                                                       |
| E-04 | **Oda kodu çakışır (E11000)**                                               | Değişmedi: `ROOM_CREATE_MAX_ATTEMPTS`(5) yeniden deneme, sonra `CODE_GENERATION_FAILED`. Konfigürasyon her denemede aynı gövdeden taşınır, yeniden okunmaz.                                                                            |
| E-05 | **Hamle süresi dolar**                                                      | Değişmedi: `timeout` sebebiyle karşı taraf kazanır, `line: null`. 11×11'de bir oyun 121 hamle sürebilir; her hamlede TTL tazelendiği için oda silinmez (KK-B73).                                                                       |
| E-06 | **Kurucu `{size:11, winLength:3}` gönderir**                                | HTTP 400 `INVALID_BOARD_CONFIG`. Oda oluşturulmaz. Arayüz bu kombinasyonu zaten sunmaz (KK-B12), sunucu **ayrıca** reddeder.                                                                                                           |
| E-07 | **Kurucu gövdesiz `POST /api/rooms` yapar (eski istemci)**                  | `{3,3}` oda kurulur, 201. Eski mobil sürüm kırılmaz.                                                                                                                                                                                   |
| E-08 | **Kurucu 11×11 seçer, katılan eski sürümdedir**                             | Katılanın istemcisi `boardSchema`yı geçemez → `INVALID_MESSAGE` × 3 → 4400 kapanış. **Kabul edilen** davranış: gürültülü hata, sessiz bozuk tahtadan iyidir. Azaltma: web + mobil aynı sürümde yayınlanır (KK-B40).                    |
| E-09 | **Boyut seçiliyken K değiştirilir, sonra boyut değiştirilir**               | K, yeni boyutun izinli listesinde değilse **o boyutun varsayılanına** düşer (KK-B13). Ekranda hiçbir anda geçersiz kombinasyon görünmez.                                                                                               |
| E-10 | **Tek hamle iki hattı birden tamamlar**                                     | Deterministik: `winLines` sırasındaki ilk hat kazanır (KK-B23). İşaretlenen hücreler o hattır; ikinci hat vurgulanmaz.                                                                                                                 |
| E-11 | **K=5 iken 6 taşlık dizi oluşur (overline)**                                | Galibiyettir (freestyle, §2.3). `line` ilk 5 indekstir (KK-B24).                                                                                                                                                                       |
| E-12 | **11×11 K=4 oyununda tahta dolar, kazanan yok**                             | `draw`. `moves` 121 kayıt taşır (KK-B69).                                                                                                                                                                                              |
| E-13 | **Rövanş teklifi 11×11 odada verilir, karşı taraf ayrılır**                 | Değişmedi: `rematch:cancelled` `reason:'opponent-left'`. Konfigürasyon odada kalır.                                                                                                                                                    |
| E-14 | **WS 300 sn'de planlı rotasyona girer (4499), oyun 11×11 ve tahta doludur** | En büyük `state` yükü bu yolda taşınır; KK-B70 bunu ölçer. Yeniden bağlanma davranışı değişmez.                                                                                                                                        |
| E-15 | **Ekran 280 px genişliğinde, oyuncu 11×11 odaya katılmış**                  | Oyun oynanabilir kalır; hücreler 24 px tabanına iner, `narrowScreen` ipucu görünür (KK-B52). Oyuncu dışlanmaz.                                                                                                                         |
| E-16 | **Klavye kullanıcısı 11×11'de tahtaya girer, `Tab`'a basar**                | Tahtadan **çıkar** (tek durak). Grid içi gezinme yalnız ok tuşlarıyladır (KK-B59/B60).                                                                                                                                                 |
| E-17 | **Ekran okuyucu 11×11'de sıra değişimini duyar**                            | Yalnız fark okunur ("Rakip 4. satır 7. sütuna oynadı. Sıra sende."), 121 hücre okunmaz (KK-B64).                                                                                                                                       |
| E-18 | **`rooms` dokümanında `size:11` var ama `board` 9 hücre (bozuk veri)**      | Tek yazma kapısı bunu üretemez (KK-B35); okuma tarafında yakalanırsa `console.error` + oda `finished` sayılmaz, istemciye `SERVER_ERROR`. Sessiz düşüş yok.                                                                            |
| E-19 | **Bilgisayara karşı 11×11 oyunda kullanıcı çok hızlı üst üste tıklar**      | İstemci `interactive=false` iken `onCellPress` çağrılmaz (mevcut sözleşme). AI düşünürken tahta kilitlidir; bütçe aşımı olsa bile (KK-B44) bir hamle döner, oyun donmaz.                                                               |
| E-20 | **Aynı oyuncu 3×3'te yenilmez AI'yı yenmeye çalışır**                       | Bugünkü kanıt geçerli: yenemez (KK-B20). 11×11'de **yenebilir** ve bu bir hata değildir (KK-B47 metni bunu önceden söyler).                                                                                                            |

---

## 5. Türkçe metin ağacına eklenecek anahtarlar

`apps/web/messages/tr.ts` **ve** mobil karşılığı. `message-keys.ts` iki ağacın eşliğini
doğruluyor — biri eksik kalırsa test kırmızıya döner.

### 5.1 Yeni grup: `boardConfig`

```
boardConfig: {
  title: 'Oyun ayarı',
  size: 'Tahta boyutu',
  size3: '3×3',
  size6: '6×6',
  size11: '11×11',
  winLength: 'Kazanma uzunluğu',
  winLengthOption: '{n} taş',
  winLengthFixed: '3 taş (3×3 tahtada sabit)',
  summary: '{boyut} tahta · {n} taş yan yana',
  hint11: '11×11 tahtada 5 taş standart gomoku kuralıdır.',
  hint6: '6×6 tahtada 4 taş hızlı ve kararlı bir oyun verir.',
  narrowScreen: 'Tahtayı daha rahat görmek için cihazını yatay çevir.',
  boardLabel: '{boyut} oyun tahtası, kazanmak için {n} taş yan yana',
  cellPosition: '{satir}. satır {sutun}. sütun, {icerik}',
  cellEmpty: 'boş',
  cellStone: '{tas} taşı',
}
```

### 5.2 `game` grubuna eklenecekler

```
opponentPlayed: 'Rakip {satir}. satır {sutun}. sütuna oynadı.',
youPlayed: '{satir}. satır {sutun}. sütuna oynadın.',
winningLineAnnounce: '{n} taş: {baslangicSatir}. satır {baslangicSutun}. sütundan {bitisSatir}. satır {bitisSutun}. sütuna.',
lastMove: 'Son hamle',
```

### 5.3 `computer` grubuna eklenecekler

```
hard: 'Zor',
strengthNote: '3×3 tahtada bilgisayar yenilmezdir. Daha büyük tahtalarda güçlü oynar ama yenilmez değildir.',
thinkingBig: 'Bilgisayar büyük tahtada düşünüyor…',
```

> `unbeatable: 'Yenilmez'` **silinmez** — 3×3'te hâlâ doğru ve gösterilecek metin odur.

### 5.4 `errors` grubuna eklenecek

```
INVALID_BOARD_CONFIG: 'Seçilen tahta boyutu ve kazanma uzunluğu birlikte geçerli değil.',
```

> ⚠️ Bu anahtar **üç dosyada tek commit'te** değişmeli: `packages/shared/src/errors.ts`
> (`errorCodeSchema`), `apps/web/messages/tr.ts`, `apps/mobile/messages/tr.ts`. Biri eksik
> kalırsa `message-keys.test.ts` birebir eşlik iddiası kırılır.

---

## 6. Gereken test-id ve veri nitelikleri — **LİSTE, ekleme değil**

`packages/shared/src/testids.ts` **DONMUŞ**. Aşağıdakiler ihtiyacın envanteridir; unfreeze kararı
lead'e aittir ve ayrı bir kart gerektirir.

### 6.1 Yeni `TESTID` anahtarları (5)

| Kimlik             | Nerede                                     | Ne                                     |
| ------------------ | ------------------------------------------ | -------------------------------------- |
| `tahta-boyut-3`    | oda kurma + bilgisayar ekranı              | 3×3 seçim düğmesi. `aria-pressed`      |
| `tahta-boyut-6`    | aynı                                       | 6×6 seçim düğmesi                      |
| `tahta-boyut-11`   | aynı                                       | 11×11 seçim düğmesi                    |
| `kazanma-uzunlugu` | aynı                                       | K seçici kapsayıcı. `data-deger="<K>"` |
| `oyun-ayari-ozeti` | oda ekranı, bekleme ekranı, katılma ekranı | "11×11 tahta · 5 taş yan yana"         |

### 6.2 Yeni `DATA_ATTR` anahtarları (3)

| Nitelik          | Nerede  | Değerler                         |
| ---------------- | ------- | -------------------------------- |
| `data-boyut`     | `tahta` | `"3"` \| `"6"` \| `"11"`         |
| `data-kazanma`   | `tahta` | `"3"` \| `"4"` \| `"5"` \| `"6"` |
| `data-son-hamle` | hücre   | `"true"` ya da nitelik yok       |

### 6.3 Değişmeyenler (bilerek)

- `cellTestId(index)` — zaten genel; `hucre-0` … `hucre-120` kendiliğinden çalışır.
  **Yalnız yorum satırı** güncellenir ("0..8" → "0..N²−1"). Kod değişmez.
- `zorluk-unbeatable` — N > 3'te etiketi "Zor" olsa bile **kancası değişmez** (§3.5, KK-B47).
- `tahta`, `durum-metni`, `sira-gostergesi`, `data-tas`, `data-kazanan`, `data-bekliyor` — aynen.

---

## 7. Sözleşme boşlukları — `xox-architect` bunları karara bağlamadan iş dağıtılmamalı

| #     | Yer                                          | Bugün                                                                                                                                               | Olması gereken                                                                     | Risk sınıfı                                                                                                                                                                                         |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SB-01 | `game-core/types.ts` `Board`                 | 9'lu **tuple**                                                                                                                                      | `readonly Cell[]`                                                                  | `noUncheckedIndexedAccess` altında `board[4]` artık `Cell \| undefined`. `cellAt`'in "tuple olduğu için gerekmez" gerekçesi çöker → **`cellAt` dışa aktarılmalı**. Bu, `index.ts` yüzeyini büyütür. |
| SB-02 | `game-core/types.ts` `WinLine`               | `[number, number, number]`                                                                                                                          | `readonly number[]`                                                                | `toTransportStatus`'taki `const [a,b,c]` kırılır; `RoomResult.line`, `isNullOrExactLength(3)` etkilenir.                                                                                            |
| SB-03 | `game-core/board.ts` `BOARD_SIZE`            | `9` (hücre sayısı, adı kenarı çağrıştırıyor)                                                                                                        | Kaldırılıp `cellCount(config)` ile değiştirilmeli; **kenar** için ayrı ad (`size`) | Ad karışıklığı üç dosyada üç farklı anlamla kopyalanmış (`game-core`=9, `db`=9, `Board.tsx`=3). Tek kaynak şart. `knip` kullanılmayanı yakalar.                                                     |
| SB-04 | `shared/primitives.ts`                       | `cellIndexSchema` 0..8, `boardSchema` `.length(9)`                                                                                                  | 0..120 / 9..121                                                                    | Protokol **kırıcı** genişleme. `packages/shared` donmuş — unfreeze kararı gerekir.                                                                                                                  |
| SB-05 | `shared/game-status.ts` `winLineSchema`      | 3'lü tuple                                                                                                                                          | 3..6 uzunlukta dizi                                                                | `TransportStatus` tipi değişir → `RoomDoc.result` ve `room-view.ts` etkilenir.                                                                                                                      |
| SB-06 | `shared/errors.ts`                           | 20 kod                                                                                                                                              | +`INVALID_BOARD_CONFIG` (21)                                                       | Üç dosya tek commit (§5.4). Alternatif: `INVALID_MESSAGE` yeniden kullanmak — **reddedildi**, sebebi ayırt edilemez olur ve kullanıcıya doğru metin gösterilemez.                                   |
| SB-07 | `shared/constants.ts`                        | `COMPUTER_MOVE_DELAY_MS` toplanan gecikme                                                                                                           | Taban gecikme + yeni `AI_BUDGET_MS`                                                | `constants.test.ts`'teki "400 ve ≤ 1000" iddiası **korunur**, üstüne "toplam ≤ 1000" iddiası eklenir.                                                                                               |
| SB-08 | `db/models/room.ts`                          | `board` `hasExactLength(9)`, `moves` `hasAtMostLength(9)`, `moveSchema.index` `max:8`, `result.line` `isNullOrExactLength(3)`, yerel `BOARD_SIZE=9` | Hepsi konfigürasyona bağlı                                                         | Çapraz-alan doğrulaması `findOneAndUpdate`'te çalışmaz → değişmez **yazma kapısında** dayatılmalı (KK-B35).                                                                                         |
| SB-09 | `rest-contract.ts` `roomStateResponseSchema` | `size`/`winLength` yok                                                                                                                              | Eklenecek                                                                          | Katılan oyuncu ayarı göremiyor (US-B03).                                                                                                                                                            |
| SB-10 | `ws-protocol.ts` `stateMessageSchema`        | `size`/`winLength` yok                                                                                                                              | Eklenecek (opsiyonel değil, **zorunlu**)                                           | İstemci `board.length`'ten kenarı türetebilir ama K'yi türetemez; kazanma uzunluğunu göstermek için gerekli.                                                                                        |
| SB-11 | `testids.ts`                                 | Donmuş                                                                                                                                              | §6'daki 5 + 3 giriş                                                                | Lead kararı.                                                                                                                                                                                        |
| SB-12 | `e2e/fixtures/room.ts`                       | Boyut varsayımı yok ama kazanan üçlüyü elle yazan testler var                                                                                       | Konfigürasyondan hat üreten yardımcı                                               | `playMove`/`expectCell` imzaları **korunur** (KK-B41).                                                                                                                                              |

---

## 8. Kapsam dışı — bilinçli olarak yapılmayacaklar

1. **3, 6, 11 dışında tahta boyutu.** 4×4, 5×5, 9×9, 15×15 yok. Serbest sayı girişi yok.
2. **K ≥ 7 ve K ≤ 2.** §2.2'de gerekçelendirildi.
3. **6×6'da K=6.** Beraberliği fiilen zorunlu kılıyor (§2.2).
4. **Renju / pro gomoku kuralları.** 3-3, 4-4, uzun-dizi yasakları, swap / swap2 açılışları,
   handikap. Yalnız freestyle (§2.3).
5. **Oyun başladıktan sonra ayar değişikliği.** Hatta `waiting` durumunda bile — §9 AS-B03'te
   gerekçelendirildi.
6. **Rövanşta ayar değiştirme.** Rövanş "aynı oyunu bir daha"dır; farklı ayar bir müzakere
   arayüzü (teklif ayarı taşısın, karşı taraf farklı bir oyunu görüp onaylasın) gerektirir.
7. **`rooms` için geri dolum betiği.** TTL 2 saatte koleksiyonu boşaltıyor (KK-B33).
8. **`games` için geri dolum betiği.** Okuma tarafı varsayılanı yeterli (KK-B34).
9. **Boyuta göre ayrı ELO havuzu / ayrı sıralama.** §9 AS-B04.
10. **Boyuta göre farklı hamle süresi.** 60 sn her boyutta (KK-B73).
11. **Eşleştirme (matchmaking) ve sıralamada boyut filtresi.**
12. **Tablet/geniş ekrana özel yerleşim.** Mevcut duyarlı düzen ölçeklenir, ayrı tasarım yok.
13. **Tahtayı yakınlaştırma/kaydırma jesti.** §3.6 KK-B50'de reddedildi.
14. **11×11 için ayrı bir AI zorluk kademesi.** `easy/medium/unbeatable` üçlüsü korunur; N > 3'te
    yalnız üçüncüsünün **etiketi** değişir.
15. **Animasyonlu kazanan çizgi çizimi.** Görsel yön paralel tasarımcı ajanın işi; bu spec yalnız
    ayırt edilebilirlik gereksinimini (KK-B54) koyar.

---

## 9. Açık sorular

### AS-B01 · 11×11'de gerçekçi AI süre bütçesi nedir? — `blocked`

**Neden blocked:** `AI_BUDGET_MS = 800` önerimin CI runner'ında ve Vercel fonksiyonunda
tutturulabilir olduğunu **ölçmeden** bilemem. Bilgisayara karşı oyun bugün istemci tarafında
koşuyor; 11×11'de alfa-beta'nın tek düğüm maliyeti cihaz sınıfına göre 10× değişir.

**Kilidi açacak iş (ayrı kart, `AI-SPIKE-001`):** aday daraltmalı (Chebyshev ≤ 2) alfa-beta +
yinelemeli derinleşme prototipi ile, `{11,5}` ve `{11,4}` için 200 pozisyonluk sabit korpusta
ulaşılan **maksimum** süre ve o sürede erişilen **ortalama derinlik** ölçülsün. Ölçüm en yavaş
hedefte (orta sınıf Android, `react-native-web`) yapılmalı — CI'daki hızlı sonuç yanıltır
(gotcha örüntü 6: kapı yanlış kapsamı ölçer).

**Tahmin etmiyorum.** Ölçüm gelene kadar KK-B68'in sabiti `AI_BUDGET_MS` adıyla tek yerde durur;
değer spike sonrası yazılır.

### AS-B02 · 11×11 mobilde 121 basılabilir eleman kare bütçesini tutar mı? — `blocked`

**Neden blocked:** `apps/mobile` tahta uygulamasının orta sınıf bir Android cihazda 121
`Pressable` ile kaç ms'de render ettiği ölçülmedi ve bu oturumda gerçek cihaz erişimi yok.
Metro tree-shaking yapmaz, RN'de düğüm sayısı doğrudan maliyettir.

**Kilidi açacak iş:** Expo Go ile gerçek cihazda `[MANUEL]` ölçüm — 11×11 tahtada ilk render
ve hamle sonrası yeniden render süresi.

**Başarısız olursa kabul edilebilir çıkış:** özelliğin 11×11 kolu **web'de** yayınlanır, mobilde
3×3 + 6×6 ile sınırlanır ve 11×11 seçeneği mobilde gizlenir. Bu, spec'i geçersiz kılmaz; KK-B49–B57
web kriterleridir, KK-B51 mobilde 6×6'ya kadar zaten geçerlidir.

### AS-B03 · `waiting` durumunda ayar değiştirmeye izin verilsin mi? — `varsayımla ilerliyor`

**İki yorum:**
(a) _Hiç değişmez_ — kurucu yanlış seçtiyse yeni oda kurar.
(b) _Rakip oturmadan değişebilir_ — `state === 'waiting'` ve `seats.O === null` iken serbest.

**Varsaydığım: (a).** Gerekçe: (b)'nin güvenli olduğu tek pencere, tam olarak yeni bir oda kurmanın
bedava olduğu penceredir — oda kodu üretmek `ROOM_CREATE_MAX_ATTEMPTS` denemeli tek bir yazma.
Buna karşılık (b), "ayar değişikliği ile katılma arasındaki yarış" adında yeni bir CAS kenar durumu
açar: rakip `{6,4}` özetini görüp katılırken kurucu `{11,6}`'ya çevirirse, katılan onaylamadığı bir
oyuna oturur. Bu, US-B03'ün doğrudan ihlalidir.

**Geri dönüş yolu:** (b) sonradan istenirse, ayar değişikliği CAS'ının `seats.O === null` koşulunu
**yazma koşulunun parçası** yapması ve `version` artırması yeterlidir.

### AS-B04 · ELO tüm boyutlarda tek havuz mu? — `varsayımla ilerliyor`

**İki yorum:** (a) tek havuz — 11×11 galibiyeti 3×3 galibiyetiyle aynı puanı hareket ettirir;
(b) boyut başına ayrı puan ve ayrı sıralama.

**Varsaydığım: (a).** Gerekçe: kullanıcı tabanı bugün ölçek üretecek büyüklükte değil; üç ayrı
havuz her birini `LEADERBOARD_MIN_RATED_GAMES`(5) eşiğinin altında bırakır ve sıralama boş görünür.
(b) sonradan **ucuzdur** çünkü `games` dokümanı `size` alanını zaten taşıyacak (KK-B34) — geçmiş
veri bölünebilir. Bugün bölmek, geri alınması pahalı bir karardır.

**Not:** Bu, KK-B34'ün "eski kayıtlar için yanıt baytı baytına aynı" iddiasıyla uyumludur.

### AS-B05 · 11×11'de hücre tabanı 28 px mi, 24 px mi? — `varsayımla ilerliyor`

**Varsaydığım: hedef 28 px, mutlak taban 24 px.** Gerekçe: WCAG 2.2 SC 2.5.8 (AA) 24×24 istiyor;
28 payla geçer ve 360 px genişlikte aritmetik tutuyor (KK-B51). Paralel çalışan tasarımcı ajanın
görsel yönü 28'i karşılayamıyorsa, feda edilecek şey **hücre boşluğu** (2 px'e kadar) olmalı,
dokunma hedefi değil.

### AS-B06 · Son hamle işareti 3×3'te de görünsün mü? — `varsayımla ilerliyor`

**Varsaydığım: evet** (KK-B55). Gerekçe: tek uygulama, tek test yolu, boyuta göre dallanan bir
görünürlük kuralı yok. 3×3'te gereksiz ama zararsız; boyuta bağlı gizleme, "3×3'te `data-son-hamle`
yok" varsayımını kilitleyen bir test doğurur ve bu test yarın 6×6'ya geçildiğinde yanlış davranışı
korur (gotcha: "bir test hatayı kilitleyebilir").

---

## 10. Kriter özeti

| Bölüm                          | Kriter          | Sayı   |
| ------------------------------ | --------------- | ------ |
| 3.1 Konfigürasyon sözleşmesi   | KK-B01 … KK-B10 | 10     |
| 3.2 Oda kurma, katılma, rövanş | KK-B11 … KK-B19 | 9      |
| 3.3 Kural motoru               | KK-B20 … KK-B29 | 10     |
| 3.4 Geriye dönük uyum          | KK-B30 … KK-B41 | 12     |
| 3.5 Bilgisayara karşı / AI     | KK-B42 … KK-B48 | 7      |
| 3.6 Arayüz / 11×11             | KK-B49 … KK-B57 | 9      |
| 3.7 Erişilebilirlik            | KK-B58 … KK-B66 | 9      |
| 3.8 Süre ve performans         | KK-B67 … KK-B73 | 7      |
| **Toplam**                     |                 | **73** |

Etiket dağılımı: `[BİRİM]` 58 · `[E2E]` 15 · `[MANUEL]` 0 (AS-B02 kilidi açılırsa 1 eklenir).
Numaralar 1–73 arasında **boşluksuz ve tekrarsızdır** (mekanik olarak doğrulandı).
