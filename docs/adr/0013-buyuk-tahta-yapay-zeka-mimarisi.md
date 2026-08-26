# ADR-0013 — N > 3 yapay zekâsı: aday daraltma + yinelemeli derinleşme + alfa-beta + duvar saati bütçesi

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi (bütçe **sayısı** AI-SPIKE-001'e bağlı)
- **İlgili:** spec §3.5, AS-B01 · KK-B20, KK-B21, KK-B43…B48, KK-B67, KK-B68
- **Öncelik:** P0 — 11×11'de tam minimax imkânsız (121! dal)

## Bağlam

Bugünkü `ai.ts`: budamasız, derinlik sınırsız, tam minimax. 3×3'te doğru cevabı verir ve
`ai.test.ts` **tümevarımsal yenilmezlik kanıtı** taşır (X olarak, O olarak, iki mükemmel AI
beraberliği). Kapsam %100, mutasyon %98.49.

11×11'de bu yaklaşım tanımsızdır. Üstelik ölçülmüş bir uyarı da var: `moves.ts`'in yorumu
3×3 **boş tahtada** en iyi hamlenin geliştirici makinesinde **515 ms** sürdüğünü kaydediyor.
Yani bugünkü "yenilmez" yol bile 1000 ms tepki tavanının yarısını harcıyor — orta sınıf bir
Android tarayıcısında bu sayının 3–5× büyümesi beklenmelidir. Bu, bu özelliğin **ortaya
çıkardığı** (yarattığı değil) mevcut bir risktir.

Analistin ikinci uyarısı: `AI_BUDGET_MS = 800` **ölçülmüş değil, tahmindir** ve CI runner'ında
ölçmek gotcha örüntü 6'ya düşer (kapı yanlış kapsamı ölçer).

## Karar

### 1. İki ayrı kod yolu — 3×3 kanıtı korunur

```ts
chooseMove(board, player, difficulty, rng = Math.random, options: ChooseMoveOptions = {})
//   options: { config?: BoardConfig; budgetMs?: number; now?: () => number }
```

- `config.size === 3` **ve** `difficulty === 'unbeatable'` → **bugünkü `bestMove`**, satırı
  satırına aynı tam minimax. Budama yok, derinlik sınırı yok, `WIN_SCORE = 10` yorumu ve
  gerekçesi aynen yerinde. KK-B20'nin kanıtı **bu fonksiyonu** koşar.
- `config.size > 3` → `searchMove(...)`, aşağıdaki mimari.
- `easy` / `medium` şekli değişmez (rastgele / %50 en iyi); `medium`'un "en iyi"si N > 3'te
  `searchMove`'dur.

`ai.test.ts` **hiç değişmez**: yeni parametre 5. sıradadır ve varsayılanlıdır (mevcut testler
`rng`'yi 4. konumda pozisyonel geçiyor).

### 2. Aday daraltma — bütçenin ön koşulu

Boş hücreler arasından, **herhangi bir taşa Chebyshev uzaklığı ≤ `CANDIDATE_RADIUS` (2)**
olanlar. Tahta tamamen boşsa tek aday: merkez. Sonda (KK-B45): 11×11'de tek taş varken
aday sayısı 5×5−1 = **24**, 121 değil.

Yarıçap 2, K ≥ 4 olduğu için gerekli minimumdur: K−1 boşluk üzerinden kurulan bir tehdide
cevap verebilmek için en az 2 hücre uzağa bakmak şart. 3 keyfi biçimde daha pahalıdır
(7×7−1 = 48 aday, ~2× dallanma).

### 3. Taktik tarama — bütçeden BAĞIMSIZ, koşulsuz

Derinleşme döngüsünden **önce** ve bütçe kontrolüne **tabi olmadan** çalışır:

1. Bir adayla **hemen kazanıyor muyum?** → onu oyna.
2. Rakip bir adayla **hemen kazanıyor mu?** → onu blokla.

Maliyet: `adaySayısı × 4 yön × (2K−1)` okuma; 121 adayda bile alt-milisaniye. Bu, KK-B46'nın
**yapısal** garantisidir — aramanın yan ürünü değil. KK-B44'ün "bütçe 1 ms'ye düşürülünce yine
geçerli bir hamle döner" iddiası da buradan gelir: geçerli hamle her zaman taktik taramadan
ya da statik sıralamanın ilk adayından gelir.

### 4. Yinelemeli derinleşme + alfa-beta + duvar saati

```
best  ← taktik hamle ?? statik sıralamanın ilk adayı        # her zaman geçerli
for depth = 2, 3, 4, … , MAX_SEARCH_DEPTH:
    result ← alphaBeta(root, depth, -∞, +∞, deadline)
    if result.aborted: break                                # YARIM ITERASYON ATILIR
    best ← result.move
return best
```

- **Yarım kalan iterasyon ASLA kullanılmaz.** Kısmen aranmış bir derinlik, aranmamış
  kardeşler yüzünden bir öncekinden **kötü** bir hamle üretebilir.
- Süre kontrolü **her düğümde değil, her 1024 düğümde bir**: `now()` çağrısının kendisi
  ölçülebilir bir maliyettir ve 11×11'de düğüm sayısı yüz binlerdedir.
- `now` **enjekte edilir** (`options.now`, varsayılan `Date.now`) — `rng` konvansiyonuyla
  aynı disiplin. Testler sahte saatle deterministiktir; `game-core` G/Ç yapmaz, bağımlılığı
  yoktur (KK-B28 korunur).
- **Hamle sıralaması** (budama oranını belirleyen tek şey): kazandıran > bloklayan >
  statik örüntü puanı > merkeze yakınlık. Önceki iterasyonun en iyi hamlesi bir sonrakinde
  ilk denenir.
- **Berabere/eşit puanda en küçük indeks korunur** (bugünkü kesin `>` karşılaştırması).
  `unbeatable`/`hard` yolunda **hiç rastgelelik yoktur** — sunucu/istemci yeniden
  üretilebilirliği (bugünkü sözleşme) sürer.

### 5. Sezgisel değerlendirme: K'ye göre ölçeklenen **pencere ağırlığı**, örüntü sınıfı sayımı değil

Her yöndeki her K-pencere için: pencerede rakip taşı varsa **ölü** (0 puan), yoksa puan
`WINDOW_WEIGHT[penceredekiTaşSayısı]`. Toplam = `benim − DEFENSE_BIAS × rakibin`.

`WINDOW_WEIGHT` **elle yazılmış donmuş bir tablodur**, uzunluğu `K+1`'dir ve indeksi
"bu pencerede kaç taşım var"dır. Böylece **yeni bir K yeni bir örüntü sınıfı doğurmaz** —
spec §2.2(b)'nin "test yüzeyi çarpımsal büyür" endişesi bu tercihle doğrusala iner.
Açık-3 / kapalı-4 ayrımı **örtük** olarak gelir: kapalı bir dizi daha az canlı pencereye
katılır, dolayısıyla daha az puan toplar.

Değerlendirme yalnız **taşların komşuluğundaki** pencereler üzerinde koşar (aday üretimiyle
aynı yarıçap); tam tahta taraması yapılmaz.

### 6. Terminal puan değişmezi — KK-B48'in yeniden ifadesi

Bugünkü yorum (`WIN_SCORE > BOARD_SIZE`, yani > 9) **`bestMove` için aynen geçerli kalır**;
yalnız `BOARD_SIZE` adı silindiği için (ADR-0010) metin `> cellCount({3,3})` diye güncellenir.

`searchMove` için **yeni ve daha güçlü** bir değişmez yazılır:

> `TERMINAL_SCORE − MAX_SEARCH_DEPTH > MAX_HEURISTIC`
> — yani **mümkün olan en geç kazanç bile, mümkün olan en iyi sezgisel pozisyondan yüksek
> puan almalıdır.** Derinlik sınırı tek başına yetmez: sezgisel değerlendirme geldiği için
> sınır artık yalnız derinlik değil, **değerlendirmenin tavanı**dır.

`MAX_HEURISTIC` ağırlık tablosundan ve maksimum pencere sayısından türetilerek bir testte
hesaplanır ve iddia edilir. İhlal bir testle **öldürülür**: `TERMINAL_SCORE`'u
`MAX_HEURISTIC`'e indiren mutant, AI'ın 3 hamlede zorla kazanmak yerine "gelecek vaat eden"
bir hamleyi seçtiği kurulu bir pozisyonda kırmızıya döner.

### 7. Dürüstlük: N > 3'te yenilmezlik iddia edilmez

`tr.computer.unbeatable` ('Yenilmez') **yalnız `size === 3` iken** render edilir; N > 3'te
aynı zorluk değeri `tr.computer.hard` ('Zor') olarak gösterilir ve `tr.computer.strengthNote`
görünür. `Difficulty` tipi ve `zorluk-unbeatable` test-id'si **değişmez** (KK-B47).

### 8. İki ayrı kapı: düğüm bütçesi (deterministik) + duvar saati (gerçek tarayıcı)

| Kapı             | Nerede                                                    | Ne ölçer                                                                | Neden                                               |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `AI_NODE_BUDGET` | `[BİRİM]` Vitest, `game-core`                             | 200 pozisyonluk sabit korpusta **ziyaret edilen maksimum düğüm sayısı** | Makineden bağımsız, flake üretmez, CI'da anlamlıdır |
| `AI_BUDGET_MS`   | `[E2E]` `apps/e2e`, gerçek tarayıcı + CDP CPU kısıtlaması | Gerçek duvar saati                                                      | Kullanıcının hissettiği şey budur                   |

**KK-B68'in duvar saati iddiası CI runner'ının Node'unda koşulmaz.** Gotcha örüntü 6:
CI'ın hızlı Node'unda ölçülen 120 ms, orta sınıf Android tarayıcısında 900 ms olabilir;
"kapı yeşil" o durumda hiçbir şey ölçmemiş olur. Duvar saati kapısı yalnız kısıtlanmış
gerçek tarayıcıda anlamlıdır; birim kapı düğüm sayar.

### 9. `AI-SPIKE-001` — ne ölçülecek, nerede ölçülecek

**Prototip birleştirilmez.** Ayrı bir dalda kalır; çıktısı ölçüm raporu ve üç sayıdır.

**Ölçülecekler:**

1. `{6,4} {6,5} {11,4} {11,5} {11,6}` için, **taş sayısına göre katmanlanmış** 200 pozisyonluk
   sabit korpusta (0 / 4 / 12 / 30 / 60 / 100 taş — en kötü durum boş tahta **değildir**,
   aday sayısının en yüksek olduğu orta oyundur): erişilen **maksimum** düğüm sayısı,
   **ortalama derinlik**, budama kesme oranı, duvar saati **maksimumu** (ortalama değil).
2. **Bugünkü 3×3 `unbeatable` yolu aynı kısıtlanmış tarayıcıda** — `moves.ts`'in kaydettiği
   515 ms geliştirici makinesindendi. Bu, özelliğin **yaratmadığı ama ortaya çıkardığı** bir
   risktir: 3×3 zaten 1000 ms tavanını zorluyorsa ayrı bir kart açılır.

**Nerede ölçülecek — üç katman, sırayla:**

- (a) `[MANUEL]` **bir kez**: Ömer'in gerçek orta sınıf Android telefonunda, sabit bir
  kalibrasyon iş yükü (ör. 3×3 boş tahta tam minimax) koşulur ve süresi kaydedilir.
- (b) `apps/e2e` içinde aynı kalibrasyon iş yükü, CDP `Emulation.setCPUThrottlingRate` ile
  farklı `R` değerlerinde koşulur; (a)'nın süresini veren `R` **kalibrasyon çarpanı** olarak
  sabitlenir ve rapora yazılır.
- (c) Bundan sonra bütün duvar saati ölçümleri (b)'nin `R`'siyle koşar — yeniden üretilebilir,
  cihaz gerektirmez, CI'ın hızıyla değil **kullanıcının cihazıyla** kalibredir.

**Çıktılar:** `AI_BUDGET_MS`, `AI_NODE_BUDGET`, `CANDIDATE_RADIUS` doğrulaması,
`MAX_SEARCH_DEPTH`, ve AS-B02 için 11×11'in mobilde açılıp açılmayacağına dair karar girdisi.

**Sabitlerin yeri:** `packages/game-core/src/ai-config.ts`. **`packages/shared`'a KONMAZ** —
`game-core` `shared`'ı import edemez (`boundaries`, sıfır bağımlılık). SB-07'nin
"`AI_BUDGET_MS` `shared/constants.ts`'e" önerisi bu yüzden **reddedildi**.
`COMPUTER_MOVE_DELAY_MS` (sunum temposu) `shared`'da kalır.

### 10. Gecikme toplanmaz, taban olur (KK-B67)

`use-computer-game.ts` bekleme süresi `max(0, COMPUTER_MOVE_DELAY_MS − gerçekDüşünmeSüresi)`
olur. Ölçüm istemcide `performance.now()` ile alınır. `shared/constants.ts` **açılmaz**;
"toplam ≤ 1000 ms" iddiası `apps/web`'in kendi testinde yazılır (protokol paketi yeniden
dondurulduktan sonra ona dokunulmaz).

## Gerekçe

- **Neden iki kod yolu:** KK-B20 "hiçbir iddiası zayıflatılmadan" diyor. Tek bir birleşik
  fonksiyon yazıp 3×3'ü onun özel hâli yapmak, kanıtın koştuğu kodu **değiştirir** — o zaman
  kanıt eski kodu değil yeni kodu kanıtlar ve "korundu" demek olgusal olarak yanlış olur.
- **Neden yarım iterasyon atılır:** klasik hata. Derinlik 6'nın ilk üç adayı arandıysa ve
  hepsi kötüyse, derinlik 5'in cevabından daha kötü bir hamle döner.
- **Neden taktik tarama bütçe dışı:** KK-B44 (1 ms'de geçerli hamle) ile KK-B46 (kazancı
  kaçırma, blokla) aynı anda sağlanmalı. Bloklamayı aramaya bırakırsak, bütçe daralınca AI
  aptallaşır — ve bütçe tam olarak en yavaş cihazda daralır, yani hatayı en çok görecek
  kullanıcıda.
- **Neden pencere ağırlığı, örüntü sınıfı değil:** spec §2.2(b) her yeni K'nin yeni örüntü
  sınıfı ve yeni kalibrasyon gerektirdiğini söylüyor ve bunu K ≤ 6 üst sınırının
  gerekçelerinden biri sayıyor. `WINDOW_WEIGHT[taşSayısı]` formülasyonu bu bağımlılığı
  kırar: tablo K+1 uzunluktadır ve K değişince **kendiliğinden** uyar.
- **Neden düğüm bütçesi de var:** duvar saati bir CI kapısı olarak flake üretir ve yanlış
  kapsamı ölçer. Düğüm sayısı algoritmik bir gerilemeyi (budama bozuldu, aday daraltma
  gevşedi) **deterministik olarak** yakalar.

## Reddedilen alternatifler

| Alternatif                                                  | Neden reddedildi                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tek birleşik arama (3×3 dahil)                              | KK-B20'nin kanıtladığı kod değişir; "kanıt korundu" iddiası olgusal olarak yanlış olurdu. Ayrıca %98.49 mutasyon skoru bugünkü `minimax`/`bestMove` gövdesine ait.                                                                                        |
| Sabit derinlik (ör. depth 4), bütçe yok                     | Cihaz sınıfı arasında 10× fark var (spec AS-B01). Aynı derinlik bir cihazda 80 ms, diğerinde 2 s. Kullanıcının hissettiği şey derinlik değil süre.                                                                                                        |
| Duvar saati kapısını CI runner'ının Node'unda koşmak        | Gotcha örüntü 6. CI'ın hızı kullanıcının cihazını temsil etmiyor; yeşil kapı hiçbir şey kanıtlamaz.                                                                                                                                                       |
| `AI_BUDGET_MS`'i `packages/shared`'a koymak (SB-07 önerisi) | `game-core` `shared`'ı **import edemez** (boundaries `default: 'disallow'` + sıfır bağımlılık değişmezi). Ya iki kopya olurdu ya da motor bütçesini bilemezdi.                                                                                            |
| Web Worker'a taşıyıp ana ipliği serbest bırakmak            | Sorunu (yavaş cihazda uzun düşünme) çözmez, yalnız donmayı gizler; ayrıca `apps/web`'e yeni bir yapı katmanı ve `KK-027` (sayfa ağ isteği yapmaz) yüzeyine yeni bir sınır getirir. Bütçe zaten donmayı engelliyor. Ölçüm bunu gerektirirse ayrı bir kart. |
| Açılış kitabı / öğrenilmiş ağırlıklar                       | Kapsam dışı, `game-core`'un saflığına veri dosyası sokar.                                                                                                                                                                                                 |
| Renju/pro kısıtlarıyla ilk oyuncu avantajını dengelemek     | Spec §8.4 kapsam dışı bıraktı; rövanşta koltuk takası dengelemeyi zaten sağlıyor (spec §2.2).                                                                                                                                                             |
| Mutasyon eşiğini düşürmek (yeni AI kodu için)               | KK-B21 ≥ %98 diyor. Eşik düşürülürse bu kartın testleri denetlenmemiş olur. Eşik sabit; kod ona uyar.                                                                                                                                                     |

## Sonuçlar

- ✅ 3×3 yenilmezlik kanıtı **koşulan kod değişmediği için** korunur; `ai.test.ts` sıfır satır
  düzenlemeyle geçer.
- ✅ N > 3'te "kazancı kaçırma / bir hamlelik kaybı blokla" garantisi bütçeden bağımsızdır.
- ✅ Kapılar doğru kapsamı ölçer: algoritmik gerileme düğüm sayısıyla, kullanıcı deneyimi
  kısıtlanmış gerçek tarayıcıyla.
- ⚠️ **`CORE-AI-001` `AI-SPIKE-001` bitmeden başlayabilir ama bitiremez**: algoritma bütçe
  sayısından bağımsızdır, sabitin **değeri** ölçümden gelir. Spike bir dalga önce koşar.
- ⚠️ **Bundle bütçesi:** `game-core` bugün `/`, `/giris`, `/kayit`, `/oda/[kod]` rotalarına da
  sızıyor (PERF-002 ölçümü) ve ağır rotalarda bütçe payı yalnız ~20 kB gzip. Yeni arama +
  değerlendirme kodu bu payı yiyebilir. **`PERF-003` `CORE-AI-001`'den ÖNCE kapanmalı.**
- 📌 Mevcut risk açığa çıktı: 3×3 tam minimax geliştirici makinesinde 515 ms. Spike bunu
  kısıtlanmış tarayıcıda ölçer; 1000 ms tavanını zorluyorsa **ayrı bir kart** açılır
  (bu özelliğin borcu değildir, ama bu özellik onu görünür kılar).
