# AI-SPIKE-001 — AI süre bütçesi ölçümü

- **Kart:** AI-SPIKE-001 [P0/P1] · **Agent:** xox-perf · **Durum:** ölçüm tamam, **(a) [MANUEL] adımı YAPILMADI**
- **İlgili:** ADR-0013 §9, spec D7/D8, `docs/superpowers/specs/2026-08-25-xox-tahta-boyutu-tasarim.md`
- **Prototip:** bu branch'te (`feat/AI-SPIKE-001`) kaldı, **main'e girmedi**. Ölçüm betikleri
  (`spike-tmp/`, `apps/e2e/.spike-tmp/`) ölçüm bitince **silindi** — repoda iz yok.
  `packages/**`/`apps/**` altında **hiçbir üretim dosyası değiştirilmedi**.

## ÖZET — ilk okunacak

| Sabit              | Değer                  | Durum                                               |
| ------------------ | ---------------------- | --------------------------------------------------- |
| `CANDIDATE_RADIUS` | **2** (doğrulandı)     | Ölçüldü, ADR-0013'ün seçimi doğru                   |
| `MAX_SEARCH_DEPTH` | **6**                  | Ölçüldü — pratikte tavan değil, güvenlik            |
| `AI_NODE_BUDGET`   | **30 000** düğüm/hamle | Ölçüldü, **kalibrasyon R=6 varsayımına bağlı**      |
| `AI_BUDGET_MS`     | **1000 ms**            | **DOĞRULANMAMIŞ** — R=6 VARSAYIMI, gerçek cihaz yok |

**Kırmızı bayrak — yeni kart açılmalı:** Bugünkü 3×3 `unbeatable` (`bestMove`, DEĞİŞMEYECEK
kod) **gerçek bundle'lanmış hâliyle**, CDP R=6 throttle altında **1982–2265 ms** sürüyor —
1000 ms tavanının **iki katı**. `AI_BUDGET_MS` bunu düzeltemez (3×3 yolu bütçe almıyor,
ADR-0013 §1'in tasarım gereği). ADR-0013 §9'un öngördüğü ayrı kart **açılmalı**
(bkz. "Kırmızı bayrak" bölümü).

---

## Metodoloji — nerede, nasıl ölçüldü

### (a) [MANUEL] — YAPILMADI

Ömer'in gerçek orta sınıf Android cihazı şu an yok. **Lead kararı gereği bu kart
durmadı.** Aşağıdaki tüm sayılar **R=6 varsayımıyla** üretildi ve **DOĞRULANMAMIŞ**
olarak işaretlidir. Ömer cihazda kalibrasyon iş yükünü (3×3 boş tahta tam minimax)
bir kez çalıştırıp süresini bildirdiğinde, bu rapordaki **her** ms değeri (R=6
varsayımına dayananlar) yeniden ölçeklenmelidir — ölçümler doğrusal olduğu için
(bkz. aşağıdaki R-duyarlılık tablosu) yeniden ölçekleme basit bir çarpandır.

### (b) `apps/e2e` içinde CDP throttle — YAPILDI, ama prototip main'e girmedi

Playwright'ın kendi `chromium.launch()`'ı doğrudan kullanıldı (test runner'ı DEĞİL —
`playwright test` global-setup/webServer gerektirir, bu ölçüm onlara ihtiyaç duymaz).
`CDPSession.send('Emulation.setCPUThrottlingRate', { rate })` ile R ∈ {1,2,3,4,6,8}
denendi. Sayfa `about:blank`, kod `page.addScriptTag({ content })` ile enjekte edildi.

**Önemli metodoloji notu — iki farklı kod, iki farklı doğruluk seviyesi:**

1. **3×3 `bestMove` için GERÇEK üretim kodu kullanıldı.** `packages/game-core/src/ai.ts` +
   `board.ts` **değiştirilmeden**, `esbuild` ile tarayıcı için IIFE'e derlendi (bundle'landı)
   ve tarayıcıda bu bundle çalıştırıldı. Bu, gerçek `apps/web` bundle'ının davranışına
   en yakın ölçümdür.
2. **N>3 `searchMove` için PROTOTİP kod kullanıldı** (CORE-AI-001 henüz yazılmadı,
   `packages/game-core/src/**`'e bu kart dokunamaz — ADR-0013 §9, "prototip birleştirilmez").
   Bu kod ADR-0013'ü taklit eder (aday daraltma r≤2, taktik tarama, yinelemeli derinleşen
   alfa-beta, pencere-ağırlık sezgisel) ama üretim kalitesinde değildir.

**Kalibrasyon sapması ölçüldü (önemli bulgu):** Aynı 3×3 algoritmasının (a) elle
yazılmış basit bir JS kopyası ile (b) gerçek `esbuild`-bundle'lanmış üretim kodu
arasında **~3× fark** var — ikisi de AYNI düğüm sayısını (549 945) geziyor, ama
üretim kodu (tip doğrulama, `boardFromCells`, `Object.freeze`, modül sarmalama)
düğüm başına daha pahalı:

| Ölçüm                                     | R=1 (throttle yok) | R=6 (varsayım)   |
| ----------------------------------------- | ------------------ | ---------------- |
| Elle yazılmış basit kopya (tarayıcı)      | 119.3 ms           | 610.7 ms         |
| **Gerçek `bestMove` bundle'ı (tarayıcı)** | **355.7–388.2 ms** | **1982–2265 ms** |
| Oran (gerçek / basit kopya)               | ~2.98×             | ~3.25–3.7×       |

**Sonuç:** N>3 `searchMove` prototipimin ölçtüğü sayılar da muhtemelen benzer bir
faktörle (~3×) iyimser — çünkü prototip de "basit kopya" tarzında yazıldı (doğrulama,
freeze, marka tipleri yok). Aşağıdaki `AI_BUDGET_MS` önerisi bu **×3 tutucu düzeltmeyi**
prototipin ham sayılarına uygulayarak hesaplandı. **CORE-AI-001 gerçek kodu yazınca bu
düzeltme geçersiz olur — gerçek kodla yeniden ölçülmeli.**

### (c) Sonraki tüm ölçümler R=6 ile — bu raporun geri kalanı

---

## 3×3 `unbeatable` yolu — D7 / moves.ts:59 iddiasının doğrulanması

| Kaynak                                                   | Süre                        |
| -------------------------------------------------------- | --------------------------- |
| `moves.ts` yorumu (iddia, "geliştirici makinesi")        | 515 ms                      |
| Bu makine, Node + tsx (gerçek kod, doğrulama)            | 624–717 ms                  |
| Bu makine, tarayıcı + esbuild bundle, **throttle YOK**   | 355.7–388.2 ms              |
| Bu makine, tarayıcı + esbuild bundle, **R=2**            | 770.6 ms                    |
| Bu makine, tarayıcı + esbuild bundle, **R=3**            | 1181.8 ms ⚠️ 1000 ms AŞILDI |
| Bu makine, tarayıcı + esbuild bundle, **R=4**            | 1511.8 ms                   |
| Bu makine, tarayıcı + esbuild bundle, **R=6 (VARSAYIM)** | **1982–2265 ms**            |
| Bu makine, tarayıcı + esbuild bundle, **R=8**            | 3039.8 ms                   |

**Doğrulandı, D7 iddiası gerçek:** 3×3 tam minimax gerçekten pahalı. R-throttle ile
doğrusal ölçekleniyor (kesişim noktası **R≈2.6**'da 1000 ms'yi aşıyor). Yani orta sınıf
bir Android'in CPU'su geliştirici makinesinin **2.6 katından** daha yavaşsa (ki bu,
literatürdeki mobil throttle katsayılarının — Lighthouse varsayılanı 4× — çok altında bir
eşiktir) bugünkü "Yenilmez" yol zaten 1000 ms tavanını aşıyor demektir.

**Bu, `AI_BUDGET_MS`'in ele alamayacağı bir sorundur** — ADR-0013 §1 gereği 3×3 yolu
(`bestMove`) bütçe parametresi ALMIYOR, budama yok, derinlik sınırı yok (KK-B20'nin
kanıtladığı gövde aynen korunuyor). **Ayrı bir kart açılmalı** (öneri: `PERF-00X` — 3×3
minimax'a alfa-beta ekleme ya da transposition/memoizasyon; kural motorunun DAVRANIŞI
değişmez, yalnız arama HIZLANIR — KK-B20'nin yenilmezlik kanıtı etkilenmez çünkü sonuç
aynı kalır, yalnız daha az düğüm gezilir). Bu, **bu özelliğin borcu değil**, bu özelliğin
(throttle ölçümünün) **ortaya çıkardığı** bir risktir (ADR-0013, tam bu cümleyle öngörülmüştü).

---

## N>3 `searchMove` — korpus × derinlik matrisi

**Korpus:** `{6,4} {6,5} {11,4} {11,5} {11,6}`, taş sayısına göre katmanlı, tohumlu
(mulberry32) üreteçle yeniden üretilebilir. Hedef 200/kombinasyon; 6×6'da (36 hücre)
60/100 taş kovaları **sığmadığı için** hariç tutuldu (4 kova × 50 = 200); 11×11'de
(121 hücre) 6 kova × ~33 = 200. **Pratik ölçüm alt-kümesi:** kova başına 8 örnek (200'ün
tamamı değil — CORE-AI-001 gerçek kodu yazınca Vitest'te 200'ün tamamı koşulmalı;
bu spike'ın amacı büyüklük mertebesini bulmak, nihai kapıyı değil).

### Aday sayısı — CANDIDATE_RADIUS doğrulaması (yarıçap 1/2/3 karşılaştırması)

| Kombinasyon | taş | aday r=1 | aday r=2 | aday r=3 | düğüm r=1 | düğüm r=2 | düğüm r=3 |
| ----------- | --- | -------- | -------- | -------- | --------- | --------- | --------- |
| 6×6 K4      | 4   | 17       | 30       | 32       | 1 068     | 2 389     | 2 425     |
| 6×6 K5      | 12  | 18       | 24       | 24       | 2 564     | 6 078     | 6 078     |
| 11×11 K4    | 12  | 66       | 98       | 109      | 535       | 874       | 962       |
| 11×11 K5    | 30  | 85       | 91       | 91       | 1 266     | 1 327     | 1 326     |
| 11×11 K6    | 30  | 85       | 91       | 91       | 1 728     | 1 849     | 1 848     |

**Doğrulama:** r=1→2 sıçraması gerçek (%40–48 daha fazla aday, K≥4 tehditlerini
kaçırmamak için gerekli — ADR'nin K−1 boşluk argümanı ölçümle tutarlı). r=2→3
sıçraması ADR'nin öngördüğü "~2× dallanma" kadar dramatik **değil** (ölçülen: %0–11
ek aday) — çünkü çok-taşlı pozisyonlarda komşuluklar zaten örtüşüyor, tek-taş sonu
senaryosu (ADR'nin 24 vs 48 örneği) daha uç bir durum. **Sonuç: CANDIDATE_RADIUS=2
doğrulandı** — r=1'in kaçırdığı tehditleri yakalıyor, r=3'ün getirisi düşük ama maliyeti
de düşük (bu spike'ta); ADR'nin r=2 kararı korunmalı.

### Maksimum düğüm sayısı / duvar saati / budama oranı — sabit hedef derinlikte (deadline YOK, dev makine)

_Not: "aborted" olmadığı için bu tablo saf algoritmik maliyeti gösterir; makine hızından
bağımsız olan şey düğüm sayısı sütunlarıdır, ms sütunları bu makineye özeldir._

| Kombinasyon | derinlik | MAKS düğüm | MAKS ms (dev, throttle yok) | budama kesme oranı |
| ----------- | -------- | ---------- | --------------------------- | ------------------ |
| 6×6 K4      | 2        | 222        | 5                           | 0.34               |
| 6×6 K4      | 3        | 2 389      | 12                          | 0.49               |
| 6×6 K4      | 4        | 10 592     | 48                          | 0.52               |
| 6×6 K4      | 5        | 84 319     | 317                         | 0.52               |
| 6×6 K5      | 2        | 405        | 1                           | 0.49               |
| 6×6 K5      | 3        | 6 078      | 17                          | 0.61               |
| 6×6 K5      | 4        | 46 201     | 136                         | 0.66               |
| 6×6 K5      | 5        | 298 795    | 958                         | 0.64               |
| 11×11 K4    | 2        | 874        | 13                          | 0.32               |
| 11×11 K4    | 3        | 22 528     | 219                         | 0.38               |
| 11×11 K4    | 4        | 80 278     | 1 241                       | 0.43               |
| 11×11 K5    | 2        | 1 327      | 16                          | 0.50               |
| 11×11 K5    | 3        | 38 670     | 428                         | 0.54               |
| 11×11 K5    | 4        | 188 441    | 2 910                       | 0.61               |
| 11×11 K6    | 2        | 1 849      | 20                          | 0.59               |
| 11×11 K6    | 3        | 54 873     | 575                         | 0.63               |
| 11×11 K6    | 4        | 855 763    | 8 679                       | 0.71               |

**En kötü durum boş tahta DEĞİL — doğrulandı.** Her kombinasyonda maksimum düğüm sayısı
`taş=0` (boş tahta) kovasında DEĞİL, orta oyun kovalarında (4/12/30 taş) çıktı — örnek:
11×11 K4 derinlik 3'te boş tahta 212 düğüm, 12-taş kovası 22 528 düğüm (106×). ADR-0013'ün
öngördüğü aday-sayısı tepe noktası doğrulandı.

**Derinlik 4, 11×11'de zaten pratik değil** (K6'da 855 763 düğüm, 8.7 saniye throttle'sız
dev makinede). **Derinlik 5-6, 11×11'de hiç denenmedi** — derinlik 4'ün maliyeti zaten
her bütçe senaryosunun çok üzerinde olduğu için anlamsız.

### Gerçek duvar saati — R=1 / R=6, en kötü pozisyon, ham prototip (×3 düzeltme UYGULANMADI — aşağıdaki tabloda ayrı gösteriliyor)

| Kombinasyon | derinlik | ms (R=1, ham) | ms (R=6, ham) | ms (R=6, ×3 tutucu düzeltmeli) |
| ----------- | -------- | ------------- | ------------- | ------------------------------ |
| 6×6 K4      | 2        | 4.6           | 19.0          | 57                             |
| 6×6 K4      | 3        | 8.3           | 47.9          | 144                            |
| 6×6 K4      | 4        | 40.6          | 251.1         | 753                            |
| 6×6 K5      | 2        | 1.0           | 6.7           | 20                             |
| 6×6 K5      | 3        | 14.5          | 81.4          | 244                            |
| 6×6 K5      | 4        | 54.3          | 345.0         | 1 035 ⚠️                       |
| 11×11 K4    | 2        | 9.8           | 57.7          | 173                            |
| 11×11 K4    | 3        | 183.1         | 1 085.3       | 3 256 ⚠️                       |
| 11×11 K5    | 2        | 13.0          | 62.2          | 187                            |
| 11×11 K5    | 3        | 289.1         | 1 505.0       | 4 515 ⚠️                       |
| 11×11 K6    | 2        | 15.3          | 82.1          | 246                            |
| 11×11 K6    | 3        | 399.5         | 2 078.0       | 6 234 ⚠️                       |

**Okuma:** derinlik 2, tutucu düzeltmeyle bile her kombinasyonda **< 260 ms** — her zaman
güvenli. Derinlik 3, 11×11'in her K değerinde tutucu tahminle **3.2–6.2 saniyeye**
sıçrıyor — herhangi bir gerçekçi bütçeyle asla tam bitmeyecek, **kısmi** kalıp
yarım-iterasyon-atma kuralıyla derinlik 2'nin sonucuna düşecek (bu, tasarımın **istediği**
davranış — ADR-0013 §4, "yarım iterasyon asla kullanılmaz"). 6×6 derinlik 4 sınırda
(K5'te 1035 ms, bütçeyi az aşıyor) — yine düşüşle ele alınıyor, sorun değil.

---

## Öneriler — CORE-AI-001'in doğrudan kullanacağı sayılar

### `AI_NODE_BUDGET = 30 000` (düğüm/hamle, Vitest, deterministik)

**Gerekçe:** 11×11 K4'ün orta-oyun tepe değerini (22 528, derinlik 3) tam kapsıyor
(o kombinasyon derinlik 3'ü her zaman bitirir); K5 (38 670) ve K6 (54 873) tepe
değerlerini **kasıtlı olarak** aşıyor — bu iki kombinasyon derinlik 3'ün ortasında
güvenli şekilde kesilip derinlik 2'nin sonucuna düşecek (yarım iterasyon atma kuralı).
Bu, wall-clock bütçesinin **gerçek cihazda yapacağı şeyin deterministik/CI-güvenli
eşdeğeri** — aynı `deadline`/`now()` mekanizması `now: () => stats.nodes` enjekte
edilerek Vitest'te düğüm sayısına, tarayıcıda `Date.now()`/`performance.now()`
enjekte edilerek gerçek zamana bağlanabilir (tek mekanizma, iki `now` implementasyonu
— öneri, uygulama CORE-AI-001'in kararı).

**Uyarı:** Bu sayı benim prototip kodumun düğüm-başına-maliyetiyle DEĞİL, saf düğüm
SAYISIYLA ilgili olduğu için ×3 düzeltmesi buraya uygulanmadı (düğüm sayısı algoritmanın
KENDİSİNE ait, kod kalitesine değil — CORE-AI-001 aynı aday daraltma + alfa-beta +
sıralama şemasını uygularsa düğüm sayıları benzer çıkmalı). Yine de CORE-AI-001 kendi
200-pozisyonluk gerçek korpusuyla bu sayıyı **doğrulamalı**, tahminle kalmamalı — bu
sayı bir başlangıç noktasıdır.

### `AI_BUDGET_MS = 1000` (ms, tarayıcı, **DOĞRULANMAMIŞ — R=6 VARSAYIMI**)

**Gerekçe:** ×3 tutucu düzeltmeli R=6 verisinde derinlik 2 her kombinasyonda ≤ 260 ms —
1000 ms bütçesi derinlik 2'yi HER ZAMAN rahatça bitirir ve kalan ~750 ms'lik payı
derinlik 3'ün BİR KISMINA (taktik olarak faydalı, tam bitmese de en iyi-sıralı adaylar
zaten önce denendiği için) ayırır. 11×11'in hiçbir K değeri derinlik 3'ü 1000 ms'de tam
bitiremeyecek (tutucu tahmin 3.2–6.2 s) — bu **beklenen ve kabul edilebilir** bir durum,
çünkü yarım iterasyon atılıyor ve derinlik 2'nin sonucu zaten taktik olarak sağlam
(kazan/blokla taraması bütçeden bağımsız, KK-B46).

**1000 ms seçildi (1200 ms değil) çünkü:** bugünkü `COMPUTER_MOVE_DELAY_MS` tavanıyla
(sunum temposu) hizalı kalıyor — kullanıcı deneyimi "Zor" zorlukta bile bugünkünden daha
uzun beklemiyor. Daha yüksek bir bütçe (1200-1500 ms) derinlik 3'ü daha sık tamamlatabilir
ama bu ölçüm bunu doğrulayamıyor (R=6 kalibrasyonsuz); **muhafazakar kalındı.**

**Bu sayı R'ye DOĞRUSAL bağlıdır** (bkz. 3×3 R-duyarlılık tablosu — R1→R8 arası ölçüm
gürültüsü dışında düz bir çizgi). Ömer'in gerçek R'si ölçüldüğünde: `yeni_AI_BUDGET_MS =
1000 × (gerçek_R / 6)`. R gerçekte 6'dan düşükse (cihaz beklenenden hızlı) bütçe
düşürülüp derinlik kaybı olmadan tepki hızlandırılabilir; R yüksekse (cihaz daha yavaş)
bütçe zaten derinlik-2 tabanını koruyacak şekilde büyütülmeli.

### `MAX_SEARCH_DEPTH = 6`

**Gerekçe:** Pratikte bir tavan değil, bir güvenlik sınırı — 11×11'in hiçbir
kombinasyonu gerçekçi bir bütçede 3'ün ötesine geçemiyor, 6×6 bile 5'in ötesinde
(K5, 958 ms ham R6'da) zorlanıyor. 6 seçildi çünkü (a) ADR'nin örnek sözde kodunda
üst sınır olarak yer alıyor, (b) 6×6'nın en kolay pozisyonlarında (boş tahta, az taş)
derinlik 5-6'ya ulaşmak hâlâ ucuz (6×6 K4 derinlik 5: 317 ms ham R6, boş tahta çok
daha ucuz) — tavanı düşürmek bu kolay durumlarda gereksiz güç kaybettirir. Derinlik
7-8 denenmedi (zaten 6'nın pratikte hiç dolmadığı görüldüğü için ek ölçüm gereksiz
kaynak harcardı).

### AS-B02 girdisi — 11×11 mobilde

Bu ölçüm masaüstü sınıfı Chromium'da (throttle ile simüle edilmiş) yapıldı. Gerçek
mobil tarayıcılar (özellikle WebView, düşük bellek) genelde daha yavaştır ve JIT
ısınma davranışı farklıdır. `apps/mobile` bugün hiçbir oyun ekranı içermediği için
(D3, tasarım dokümanı) bu bulgu **şu an uygulanabilir değil** — W2-03 mobil paritesini
yazarken bu raporu ve CORE-AI-001'in gerçek (bundle'lanmış) ölçümünü tekrar dikkate
almalı. Karar bu kartın kapsamı dışında (tasarım belgesi böyle diyor); yalnızca girdi
sağlanıyor: **11×11 + derinlik≥3 arama mobilde muhtemelen masaüstünden daha maliyetli
olacak, ayrı bir throttle profiliyle yeniden ölçülmeli.**

---

## CORE-AI-001'e bırakılan notlar

1. **`AI_NODE_BUDGET=30000`, `AI_BUDGET_MS=1000` (DOĞRULANMAMIŞ), `MAX_SEARCH_DEPTH=6`,
   `CANDIDATE_RADIUS=2` (doğrulandı) — bu kartın çıktısı, `ai-config.ts`'e YAZILACAK
   sayılar bunlar.** Bu spike `packages/game-core/src/**`'e dokunmadı; dosya CORE-AI-001'de
   ilk kez açılıyor.
2. **`now()` enjeksiyonunu ikili kullan:** `AI_NODE_BUDGET` testi Vitest'te
   `now: () => visitedNodeCount` (sahte, düğüm sayan bir saat) ile, `AI_BUDGET_MS`
   tarayıcıda gerçek `Date.now()`/`performance.now()` ile aynı `deadline` parametresine
   bağlanabilir — tek mekanizma, iki `now` implementasyonu. Uygulama detayı, karar
   CORE-AI-001'in.
3. **Kırmızı bayrak — 3×3 `bestMove` R=6'da 1000 ms tavanını ~2× aşıyor
   (1982–2265 ms, gerçek bundle'lanmış kod).** `AI_BUDGET_MS` bunu düzeltemez (3×3 yolu
   bütçesiz, ADR-0013 §1 gereği). **Ayrı bir kart açılmalı** — öneri kapsamı: 3×3
   `minimax`'a alfa-beta budaması eklemek (KK-B20'nin yenilmezlik SONUCUNU değiştirmez,
   yalnızca düğüm sayısını azaltır — 549 945 düğümün çoğu zaten kaybedici dallardır).
   Bu, `AI-SPIKE-001`'in ürettiği değil, **ortaya çıkardığı** bir borç (ADR-0013,
   önceden öngörülmüştü).
4. **Kalibrasyon-sapma uyarısı:** Bu spike'ın N>3 sayıları "basit kopya" tarzı prototip
   kodla ölçüldü; gerçek kodun aynı 3×3 için ölçülenden ~3× daha pahalı çıktığı gözlendi
   (doğrulama, `Object.freeze`, marka tipleri, modül sarmalama maliyeti). `AI_BUDGET_MS`
   önerisi bu ×3 payını **zaten** içeriyor (yukarıdaki "×3 tutucu düzeltmeli" sütunu),
   ama CORE-AI-001 gerçek kodu yazıp bundle'layınca **yeniden ölçmeli** — bu düzeltme
   bir tahmin, gerçek ölçüm değil.
5. **`WINDOW_WEIGHT`/`DEFENSE_BIAS` prototipte KEYFİ seçildi**
   (`[0,1,8,40,200,1000,5000,25000]`, `DEFENSE_BIAS=1.1`) — yalnızca ölçüm iş yükü
   üretmek için, oyun gücü/dengeyle ilgili HİÇBİR iddiaları yok. CORE-AI-001 kendi
   tablosunu bağımsız tasarlamalı.
6. **(a) [MANUEL] adımı hâlâ açık.** Ömer gerçek cihazda kalibrasyon iş yükünü
   çalıştırdığında: (i) R yeniden hesaplanır, (ii) bu rapordaki tüm ms sayıları
   `× (gerçek_R/6)` ile yeniden ölçeklenir, (iii) `AI_BUDGET_MS` CORE-AI-001'in
   kodunda güncellenir. `AI_NODE_BUDGET` R'den bağımsızdır, kalibrasyon onu etkilemez.

## Dokunulan / dokunulmayan dosyalar

- **Değiştirilen:** `docs/board/reports/AI-SPIKE-001.md` (bu dosya) — main'e girecek TEK dosya.
- **Oluşturulup silinen (main'e hiç girmedi):** `spike-tmp/{engine,corpus,run-node-sweep,
run-fixed-depth-sweep,select-worst,bundle-real-ai}.mjs`, `apps/e2e/.spike-tmp/{engine,
corpus,throttle-measure,throttle-real-ai,real-ai-bundle}.{mjs,js}` — hepsi ölçüm
  bitince silindi, `git status` temiz.
- **Dokunulmadı:** `packages/game-core/src/**`, `packages/ui-tokens/**`,
  `apps/web/next.config.ts`, `.size-limit.mjs` (kart kısıtı gereği).
