# ADR-0017 — Tahta sunumu: ölçekle/kaydırma, tek ızgara kod yolu, tek tab durağı; DESIGN-001 ile katman ayrımı

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** spec §3.6/§3.7, AS-B05, AS-B06 · KK-B49…B66 · `DESIGN-001` (Yön A)
- **Öncelik:** P0 — 121 hücre bugünkü bileşenin hiçbir varsayımını taşımıyor

## Bağlam

Bugünkü `apps/web/components/board/Board.tsx`:

- `const BOARD_SIZE = 3` bileşene gömülü (üçüncü kopya, bu kez **kenar**),
- `grid-cols-3` sabit sınıf, `w-20` sabit hücre,
- her hücre ayrı `<button>` → **9 tab durağı** (11×11'de 121 olurdu),
- `cellAriaLabel` `/3` ve `%3` ile hesaplıyor, metin bileşene gömülü,
- grid'in `aria-label`'ı **yok**, `aria-rowcount`/`aria-colindex` yok,
- hücreler memoize **değil**.

Aynı anda `DESIGN-001` (Yön A — Kağıt & Mürekkep) `apps/web/components/**` ve
`packages/ui-tokens/**`'a dokunuyor. İki kart aynı dosyada.

Yön A'nın önizlemesinde iki madde spec ile **çelişiyor** ve karara bağlanmalı:
(a) tahtada `gap: 1px` (KK-B51 ≥ 2 px istiyor),
(b) "Yakınlaştır" düğmesi ve pan/zoom demosu (KK-B50 kaydırma/yakınlaştırmayı **reddetti**),
(c) "dokunma alanı `hitSlop` ile 44pt'a tamamlanır" önerisi.

## Karar

### 1. Ölçekle, kaydırma — ve bunu **tek bir CSS ifadesi** yapar, dallanma yok

Tahta genişliğine göre kesirlidir; hücre boyutu türetilmiş bir sonuçtur, girdi değil:

```
ızgara  : grid-template-columns: repeat(var(--xox-n), minmax(0, 1fr))
tahta   : width: min(100%, var(--xox-board-max)); aspect-ratio: 1
hücre   : aspect-ratio: 1  (piksel ölçüsü YAZILMAZ)
```

`minmax(0, 1fr)` **zorunludur**: düz `1fr`'in `min-width: auto` davranışı, içeriği taşan bir
hücrede ızgarayı genişletir ve yatay kaydırma çubuğu doğurur — KK-B50'nin en olası ihlal yolu
budur. Aynı sebeple tahtanın **tüm ata elemanlarında** `min-width: 0` gerekir; bu, kartın
kabul kriterine yazılır ve 360×640'ta `scrollWidth === clientWidth` sondasıyla kanıtlanır.

**CSS'te hiçbir alt sınır (min-width/min-height) yoktur.** 28 px ve 24 px sayıları CSS'e
gömülmez; **belirtilen görünüm alanlarında ölçülen iddialardır** (360 px → hücre ≥ 28 px).
Alt sınırı CSS'e yazmak, dar ekranda taşma (yani KK-B50 ihlali) üretmenin tek yoludur.
Oyuncu asla dışlanmaz (KK-B52): ekran daralınca tahta küçülür, kaydırmaz.

### 2. `gap` TEK bir sabittir — 2 px, her boyutta aynı

`--xox-grid-line: 2px`, `ui-tokens`'ta tek token. 3×3'te de 11×11'de de aynı.

Bu, Yön A'nın "1 px hairline" önerisinden **1 piksellik bilinçli bir sapmadır**. Gerekçe:
KK-B51 komşu dokunma hedefleri arasında ≥ 2 px ayrım istiyor. Boyuta göre değişen bir gap
(3×3'te 1 px, 11×11'de 2 px) **boyuta göre dallanan ikinci bir görsel kod yolu** olurdu —
ki bu, Yön B'nin reddedilme sebebiydi ve `DESIGN-001`'in kabul kriterinde açıkça yasak.
2 px, 76 px'lik bir hücrede %2.6'dır; hâlâ hairline okunur.

Izgara çizgisi **gap'in kendisidir**: tahta arka planı `border` renginde, hücreler `surface`
renginde. Yön A'nın "kağıt-ızgara hilesi" korunur, yalnız 1 px yerine 2 px.

### 3. Kaydırma/yakınlaştırma YOK — Yön A önizlemesindeki "Yakınlaştır" düğmesi uygulanmaz

KK-B50 gerekçesi: rakibin tehdidini ve kazanan çizgiyi **tek bakışta** görmek oyunun
kendisidir; ayrıca pan/zoom jestleri ekran okuyucu ve anahtar-erişim hareketleriyle çakışır.
Önizlemedeki düğme bir demo öğesiydi, sözleşme değildir.

### 4. `hitSlop` ile 44 px'e tamamlama REDDEDİLDİ — geometrik olarak imkânsız

Yön A'nın dürüstlük notu 11×11'de 44 pt hedefi `hitSlop` ile tamamlamayı öneriyor ve
"komşuların slop'ları çakışmayacak şekilde hesaplanmalı" diyor. **Bu koşul sağlanamaz:**
hücre merkezleri 30 px arayla dizilirken 44 px'lik hedefler zorunlu olarak çakışır. Çakışan
hedefler dokunmayı **yanlış hücreye** düşürür — 28 px'lik doğru hedeften kesin olarak kötüdür.

**Karar: 11×11'de dokunma hedefi hücrenin kendisidir.** WCAG 2.2 SC 2.5.8 (AA) eşiği
24×24'tür; 360 px'te ölçülen ≥ 28 px eşiği payla geçer. 3×3 ve 6×6'da hedef ≥ 44×44'tür
(aritmetik zaten tutuyor).

### 5. Izgara `board.length`'ten değil, `config`'ten çizilir — ve ikisi **eşleşmek zorundadır**

`Board` bileşeni `config: BoardConfig` prop'u alır (`data-kazanma` `board.length`'ten
türetilemez). `cells.length !== cellCount(config)` ise bileşen **bozuk ızgara çizmez**:
hata durumu render eder ve `console.error` ile gürültü çıkarır (KK-B57, E-03/E-18).
KK-B56'nın sondası (36 hücre → 6 sütun, 121 hücre → 11 sütun) eşleşen konfigürasyonla
koşar; `grid-cols-3` gibi sabit bir sınıf adı hiçbir yerde kalmaz.

### 6. Tek tab durağı: roving tabindex — 3×3'te de uygulanır

Izgara içinde **yalnız bir** hücrenin `tabIndex=0`'dır, geri kalanı `-1`. Tahtadan sonraki
odaklanabilir elemana **1** Tab basışıyla ulaşılır (KK-B59). Bu 3×3'te de bir iyileşmedir
(9 durak → 1) ve tek uygulama tutulur; boyuta göre dallanmaz (AS-B06 ile aynı mantık).

Klavye haritası (KK-B60), **kenarlarda sarma yok**:
`←→↑↓` bir hücre · `Home`/`End` satır başı/sonu · `Ctrl+Home`/`Ctrl+End` ilk/son hücre ·
`PageUp`/`PageDown` ±5 satır · `Enter`/`Space` oynar.

Bu mantık **saf bir modülde** yaşar: `apps/web/components/board/roving-grid.ts` →
`nextFocusIndex(current: number, key: KeyName, config: BoardConfig): number`. DOM'suz,
Vitest'le her tuş ayrı test edilir; bileşen yalnız çağırır. İkinci fayda: `Board.tsx`
250 satır konvansiyonunun altında kalır.

### 7. Erişilebilirlik — kazanımlar korunur, üstüne eklenir

- `role="grid"` → `role="row"` → `role="gridcell"` üçlüsü **her boyutta** korunur
  (inceleme bulgusunun düzeltmesi geri alınmaz). Satır kapsayıcıları `display: contents`
  ile görsel ızgarayı bozmadan erişilebilirlik ağacına girmeye devam eder.
- Grid'e `aria-label` eklenir: `tr.boardConfig.boardLabel` → "11×11 oyun tahtası, kazanmak
  için 5 taş yan yana". **Bugün grid'in hiç etiketi yok** — bu bir kazanç.
- `aria-rowcount`/`aria-colcount` grid'de, `aria-rowindex`/`aria-colindex` her hücrede.
- Hücre `aria-label` biçimi korunur ("3. satır 2. sütun, boş") ama satır/sütun hesabı
  **konfigürasyondan** gelir ve metin `tr.boardConfig.cellPosition`'dan üretilir; bileşene
  gömülü Türkçe kalmaz.
- `durum-metni` `role="status" aria-live="polite"` **korunur**; içerik yalnız **farkı**
  duyurur ("Rakip 4. satır 7. sütuna oynadı. Sıra sende.") — tahtanın tamamı asla okunmaz.
- Oyun bitince kazanan çizginin **koordinatları** duyurulur (KK-B65).
- `axe` denetimi 3×3, 6×6, 11×11'de **sıfır ihlal** (KK-B66).

### 8. Kazanan çizgi: üç sinyal, renkten bağımsız

(a) kazanan hücrelerde `data-kazanan="true"`;
(b) kazanan **olmayan** hücrelerde ≥ %40 opaklık düşüşü;
(c) kazanan hücrelerde **renkten bağımsız** ≥ 3 px dış çizgi (WCAG 1.4.1).

(b) için **yeni bir veri niteliği eklenmez**: bileşen zaten `winningLine`'ı prop olarak
alıyor; kazanan olmayan hücrelere bir sınıf verilir. E2E hesaplanmış `opacity` değerini
ölçer. Sözleşme yüzeyi büyümez.

**Son hamle** (KK-B55) her boyutta gösterilir (AS-B06): `data-son-hamle="true"`, tek uygulama.

### 9. Yeniden render bütçesi (KK-B71)

`CellButton` `React.memo` ile sarılır; `onCellPress` `useCallback` ile referans-kararlı olur;
tüm prop'lar ilkel değerdir. Bir `state`/`move:applied` mesajı **≤ 2** hücre bileşenini
yeniden render eder (değişen hücre + bekleyen hücre). Sayaç tabanlı bir testle ölçülür —
"hızlı hissettiriyor" kriter değildir.

### 10. `DESIGN-001` ile katman ayrımı — kart bölünür, dosya kümeleri ayrık olur

Döngüsel bağımlılık var: `DESIGN-001` `Board.tsx`'i yeniden yazmak istiyor; `UI-BOARD-001`
tokenlara ihtiyaç duyuyor; Yön A'nın 11×11 iddiaları değişken boyut olmadan doğrulanamıyor.
Çözüm **özelliğe göre değil katmana göre bölmek**:

| Kart                                             | Sahip olduğu dosyalar                                                                                                                                   | Sıra                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **DESIGN-001a** — tasarım dili + tokenlar        | `packages/ui-tokens/**`, `apps/web/app/globals.css`, `apps/web/lib/generate-globals-css.ts`, `docs/design/**` · `apps/web/components/**`'a **DOKUNMAZ** | önce                   |
| **UI-BOARD-001** — tahta bileşeni                | `apps/web/components/board/**` **yalnız** · `RoomScreen.tsx`/`ComputerGameScreen.tsx`'te yalnız prop bağlama satırları                                  | sonra                  |
| **DESIGN-001b** — diğer bileşenlerin görsel dili | `apps/web/components/**` **eksi** `board/**`, eksi `RoomScreen.tsx`, eksi `ComputerGameScreen.tsx` · `apps/web/app/**/page.tsx`                         | UI-BOARD-001'den sonra |

`DESIGN-001a` `UI-BOARD-001`'in **sert ön koşuludur** (hücre/ızgara tokenları, odak halkası,
`surfaceRaised`, `--xox-grid-line` oradan gelir). `DESIGN-001b` `UI-BOARD-001`'den **sonra**
gelir ki iki kart aynı `components/**` ağacında buluşmasın.

## Gerekçe

- **Neden CSS'te alt sınır yok:** bir `min-width` her zaman ya taşma ya kaydırma üretir.
  KK-B50 mutlaktır; 28/24 px sayıları **hedeftir**, ölçülen iddialardır. Bu ayrım
  yapılmazsa E-15 (280 px ekran) ile KK-B50 birbirini iptal eder.
- **Neden tek `gap` sabiti:** boyuta göre dallanan görsel kod yolu, `DESIGN-001`'in açık
  yasağı. 1 px'lik estetik farkın bedeli, iki kod yolu ve iki test matrisidir.
- **Neden roving tabindex 3×3'te de:** boyuta göre dallanan bir davranış, "3×3'te 9 durak"
  varsayımını kilitleyen bir test doğurur ve o test yarın yanlış davranışı korur
  (gotcha: "bir test hatayı kilitleyebilir").
- **Neden `config` prop'u, neden yalnız `board.length`:** `data-kazanma` uzunluktan
  türetilemez; ayrıca uzunluk/konfigürasyon uyuşmazlığı (bayat reducer, E-03) tespit
  edilebilir hâle gelir.
- **Neden katmana göre bölme:** özelliğe göre bölünürse iki kart `Board.tsx`'i paylaşır ve
  paralel gidemez; sıralanırsa biri diğerinin işini yeniden yazar. Katman ayrımında
  `ui-tokens` sözleşmesi ikisinin ortak dili olur ve dosya kümeleri gerçekten ayrıktır.

## Reddedilen alternatifler

| Alternatif                                                                                            | Neden reddedildi                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kaydırılabilir / yakınlaştırılabilir tahta (Yön A önizlemesindeki "Yakınlaştır")                      | KK-B50: rakibin tehdidini tek bakışta görmek oyunun kendisi; pan/zoom ekran okuyucu ve anahtar-erişim hareketleriyle çakışır.                                                                |
| `hitSlop` ile dokunma hedefini 44 px'e tamamlamak                                                     | Geometrik olarak çakışmayan slop imkânsız (merkezler 30 px arayla); çakışan hedef dokunmayı yanlış hücreye düşürür — 28 px'lik doğru hedeften kötü.                                          |
| Boyuta göre gap (1 px / 2 px)                                                                         | `DESIGN-001`'in "boyuta göre dallanan ikinci görsel kod yolu YAZILMAZ" kısıtının ihlali; Yön B'nin reddedilme sebebi.                                                                        |
| JS ile ölçüp hücre boyutunu hesaplamak (`ResizeObserver`)                                             | Layout thrash + SSR'de yanlış ilk boyut (FOUC) + `prefers-reduced-motion` ile ilgisiz bir yeniden çizim kaynağı. Kesirli ızgara aynı sonucu CSS'te, sıfır JS ile verir.                      |
| Hücreleri `<button>` yerine tek bir `<canvas>`/SVG'ye çizmek                                          | 121 `gridcell` rolü, `aria-rowindex`, `data-tas`, `cellTestId` ve klavye odağı kaybolur; erişilebilirlik ve E2E gözlemlenebilirliği çöker.                                                   |
| `DESIGN-001`'i tek kart bırakıp tahta boyutundan **önce** koşturmak                                   | Yön A'nın 11×11 iddiaları (hücre ≥28, dekor sökülmüyor) değişken boyut olmadan doğrulanamaz; ayrıca `Board.tsx` iki kez yazılırdı.                                                           |
| `DESIGN-001`'i tahta boyutundan **sonraya** ertelemek                                                 | Ömer önceliği açıkça yükseltti ("artık sonraki dalgalara ertelenmiyor"); ayrıca `UI-BOARD-001` tokensız yazılırsa ham Tailwind değerleri serpiştirilir ve `DESIGN-001` onları yeniden söker. |
| Yeni bir `data-*` niteliğiyle "oyun bitti, kazanan var" durumunu DOM'a yazıp dimming'i CSS'e bırakmak | Sözleşme yüzeyini gereksiz büyütür; bileşen `winningLine` prop'una zaten sahip ve E2E hesaplanmış `opacity`'yi ölçebiliyor.                                                                  |

## Sonuçlar

- ✅ Tek görsel kod yolu: 3×3 ile 11×11 arasında **hiçbir** dal yok, yalnız `--xox-n` değişiyor.
  Yön A'nın en güçlü iddiası (dekor sökülmez, yalnız ölçü küçülür) korunur.
- ✅ Erişilebilirlik net kazançla çıkar: 9 tab durağı → 1, grid'e etiket, satır/sütun indeksleri,
  fark tabanlı canlı duyuru.
- ⚠️ Yön A'dan iki bilinçli sapma (gap 1 → 2 px; "Yakınlaştır" uygulanmaz) ve bir düzeltme
  (`hitSlop` önerisi geometrik olarak imkânsız). Üçü de `docs/design/2026-08-25-gorsel-yonler.md`'ye
  not düşülür ki tasarımcı ajan bunları "uygulanmamış" sanıp geri getirmesin.
- ⚠️ `DESIGN-001` **üç karta** bölünüyor (a / tahta / b). Board'daki tek kart üç satıra
  dönüşür; `xox-planner` bunu uygular.
- ⚠️ `UI-BOARD-001` `RoomScreen.tsx` ve `ComputerGameScreen.tsx`'te **yalnız prop bağlama**
  satırlarına dokunur. Bu iki dosya aynı dalgada başka hiçbir kartın çakışma kümesinde
  olamaz.
