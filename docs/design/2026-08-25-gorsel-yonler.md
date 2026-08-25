# Görsel yönler — keşif (2026-08-25)

**Durum:** Keşif. Hiçbir kod değişmedi. Bu belge + üç HTML önizleme
(`docs/design/onizleme/yon-a.html`, `yon-b.html`, `yon-c.html`) Ömer'in seçim yapması içindir.
Seçim yapıldıktan sonra `packages/ui-tokens` + bileşen dosyalarına uygulama ayrı bir kartla gelir.

## Neden "amatör" görünüyor — bugünkü hâlin teşhisi

`apps/web/components/**` ve `packages/ui-tokens/src/**`'i okudum. Sorun kötü renk seçimi değil —
**neredeyse hiç görsel tasarım katmanı yok**:

- `Board.tsx`/`HomeActions.tsx`/`ResultPanel.tsx`/`TopBar.tsx` çıplak `<button>`/`<a>`/`<p>` —
  radius, gölge, hover/focus durumu, tipografi hiyerarşisi yok. Tarayıcının varsayılan buton
  stili görünüyor (kenarlık bile Tailwind'den değil, UA stylesheet'ten).
- Boşluk sistemi (`spacing.ts`) tanımlı ama bileşenlerde neredeyse hiç kullanılmıyor — `gap-2`,
  `gap-4`, `p-6` gibi ham Tailwind değerleri serpiştirilmiş, `packages/ui-tokens/spacing`'e
  bağlı değil.
- `globals.css`'te yalnız 10 renk değişkeni ve `body{background;color}` var; kart, buton, input,
  odak halkası gibi hiçbir bileşen katmanı token'lara bağlanmamış.
- Hareket dili sıfır — hiçbir `transition`/`animation` yok.

Yani mevcut "amatörlük" bir zevk sorunu değil, eksik bir katman. Üç yön de bu katmanı **var olan
token şemasını kırmadan** (`bg/surface/border/text/textMuted/accent/playerX/playerO/win/danger`)
doldurur; gerekirse token seti genişletir (aşağıda "Token önerileri").

## Üç yön — tek cümlelik özet

| Yön                            | Tek cümle                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Kağıt & Mürekkep**       | Sıcak, minimal, hairline-ızgaralı editoryal bir tasarım; dekorasyona değil boşluğa ve tipografiye yatırım yapar.                                |
| **B — Neon Arcade**            | Koyu-öncelikli, dolgun renkli, "oyun uygulaması" hissi veren kart tabanlı bir tasarım; enerjik ama kural gereği yoğunlukta dekorasyonunu söker. |
| **C — Sistem / Veri Izgarası** | Tüm arayüzü tek bir ızgara mantığıyla kuran, mono aksanlı, "rekabetçi/ölçülebilir" hissi veren restrained bir tasarım.                          |

Üçü de aynı fikrin tonu değil: A dekorasyonu **azaltarak** boşlukla konuşuyor, B dekorasyonu
**yoğunluğa göre koşullu** kullanıyor, C dekorasyonu zaten **hiç** kullanmıyor (ızgara kendisi
tasarım). Bu üçü, "3×3'te güzel, 11×11'de dağılan" riskine karşı üç farklı strateji temsil ediyor.

---

## Yön A — Kağıt & Mürekkep

**Gerekçe:** XOX kağıt üstünde oynanan bir oyun — bu kökeni inkâr etmek yerine rafine bir
editoryal dile çeviriyoruz. Hiç gölge/gradyan/parlama yok; tüm hiyerarşi tipografi ölçeği,
boşluk ve ince (1px) çizgilerle kuruluyor. "Profesyonel" burada "sakin ve kendinden emin" demek.

**Palet (önerilen token adları — `packages/ui-tokens/src/colors.ts` şekliyle birebir):**

| Token                    | Açık      | Koyu      | Not                                     |
| ------------------------ | --------- | --------- | --------------------------------------- |
| `bg`                     | `#f7f4ee` | `#14120f` | sıcak kağıt / mürekkep hokkası          |
| `surface`                | `#ffffff` | `#1e1b17` |                                         |
| `surfaceRaised` _(yeni)_ | `#fbf9f5` | `#262220` | gölgesiz "yükselti" — hover/aktif zemin |
| `border`                 | `#8a8478` | `#786d5f` | hairline                                |
| `text`                   | `#241f1a` | `#f2ede4` |                                         |
| `textMuted`              | `#6b6255` | `#b3a998` |                                         |
| `accent`                 | `#1d4ed8` | `#93b4ff` | mevcut değerle aynı — değişmedi         |
| `playerX`                | `#243b5c` | `#aac0ea` | koyu ince "ink" lacivert                |
| `playerO`                | `#7a2e2e` | `#e6a8a2` | bordo "ink"                             |
| `win`                    | `#2f6b3a` | `#8ccb98` |                                         |
| `danger`                 | `#a13d2c` | `#e2897c` |                                         |

**Kontrast ölçümleri** (WCAG, `contrast.ts` ile aynı formül, script ile hesaplandı):

Açık: text/bg 14.88, textMuted/bg 5.46, accent/bg 6.10, playerX/bg 10.31, playerO/bg 8.47,
win/bg 5.82, danger/bg 5.94, border/bg 3.38 (UI eşiği 3:1 ✓), hepsi `surface` üzerinde de eşit/daha
iyi. Koyu: text/bg 16.03, textMuted/bg 8.05, accent/bg 9.09, playerX/bg 10.18, playerO/bg 9.34,
win/bg 9.89, danger/bg 7.21, border/bg 3.70. **Tüm metin çiftleri ≥4.5:1, border ≥3:1 — iki temada
da geçiyor.**

**Tipografi:** Fraunces (başlık, serif — "ink" karakteri) + Inter (arayüz) + JetBrains Mono
(oda kodu, süre, koordinat). Mevcut `fontSize` ölçeği (`xs12…display44`) aynen kullanılıyor;
yalnızca `display` daha seyrek (yalnızca ana sayfa hero'su) kullanılıyor — çoğu metin `base/sm`de,
satır yüksekliği 1.6 (okunabilirlik önceliği).

**Boşluk:** Üretken bolluk — bölümler arası `xl/xxl`, kart içi `lg`. Tahtada `gap` YOK; hücreler
1px `border` rengiyle ayrılan klasik kağıt-ızgara hilesiyle (`gap:1px`, arka plan=border, hücre
arka planı=surface) birbirine bitişik. Bu, hiçbir ek "kart" dekoru gerektirmediği için 11×11'e
doğrudan taşınır.

**Tahta/taş:** Taş çizgileri ince (X strokeWidth 2.5–3, O strokeWidth 1.8–2) — kalın çift çizgi
yerine zarif ama hâlâ şekil+kalınlıkla ayırt edilir (X: iki çizgi, O: tek çember — mevcut DOM
ayrımı korunuyor).

**Hareket:** Hamle: fade+scale 150ms ease-out. Kazanan çizgi: `stroke-dashoffset` ile 200ms'de
"çizilir" (kalem hissi). `prefers-reduced-motion`'da anında görünür.

**11×11 çözümü:** Bu yönün tahtası zaten kart/gölge içermediği için (yalnız hairline + düz zemin)
boyut büyüdükçe **hiçbir dekor kaldırılmaz** — yalnızca hücre/işaret ölçüsü küçülür (76px → 52px →
34px). Önizlemede canlı 3×3/6×6/11×11 geçişi var.

**Dokunma hedefi dürüstlüğü:** 11×11'de görsel hücre ~34pt'a düşer, yani <44pt. Bu, hiçbir yönde
"çözülmüş" değil — matematiksel olarak 11×44pt = 484pt, çoğu telefon genişliğini (375–430pt) aşıyor.
Önerilen gerçek çözüm: görsel hücre küçük kalır, **dokunma alanı** RN `hitSlop` / web'de görünmez
dolgu ile 44pt'a tamamlanır (komşu hücrelerin slop'ları çakışmayacak şekilde hesaplanmalı — bu,
uygulama kartında ayrıca doğrulanması gereken bir ayrıntı). Önizlemede ek olarak bir
"Yakınlaştır" düğmesi var (harita usulü pan/zoom demosu).

---

## Yön B — Neon Arcade

**Gerekçe:** XOX'ta ELO, rövanş, emoji tepkisi, arkadaş ekleme gibi oyunlaştırma katmanları var —
bu "rekabetçi ama eğlenceli mobil oyun" konumlanmasına en yakın dil, dolgun renkli koyu-öncelikli
kart tabanlı bir "oyun uygulaması" hissidir (bkz. Duolingo/mobil oyun estetiği ailesi, ama
Türkçe/XOX'a özgü paletle). "Profesyonel" burada "özenle cilalanmış, tutarlı bir oyun ürünü" demek.

**Palet:**

| Token                    | Koyu (birincil)       | Açık                                  | Not                                                                                    |
| ------------------------ | --------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `bg`                     | `#0b0f19`             | `#f2f0fb`                             |                                                                                        |
| `surface`                | `#131a2b`             | `#ffffff`                             |                                                                                        |
| `surfaceRaised` _(yeni)_ | `#1b2440`             | `#e9e5fb`                             |                                                                                        |
| `border`                 | `#5f71a0`             | `#7d72b8`                             | _(orijinal aday `#4a5a86` 2.82:1 ile UI eşiğini geçemedi, `#5f71a0`'a açıklaştırıldı)_ |
| `text`                   | `#eef1fb`             | `#171126`                             |                                                                                        |
| `textMuted`              | `#9aa6c6`             | `#544b73`                             |                                                                                        |
| `accent`                 | `#9c86ff`             | `#5b3df0`                             |                                                                                        |
| `playerX`                | `#4fe0ff` (camgöbeği) | `#00768f` (koyulaştırılmış camgöbeği) |                                                                                        |
| `playerO`                | `#ff7fb8` (pembe)     | `#b0105f` (koyulaştırılmış)           |                                                                                        |
| `win`                    | `#5cf0ae`             | `#157a4e`                             |                                                                                        |
| `danger`                 | `#ff8080`             | `#c81e1e`                             |                                                                                        |

Açık temada neon tonlar **doğrudan kullanılmadı** — beyaz zeminde camgöbeği/pembe kontrastı
düşük kalıyordu, bu yüzden aynı hue'nun koyulaştırılmış hâli kullanıldı. Bu, "koyu tema açığın
naif tersi olamaz" kuralının tam da B için kritik olduğu yer: neon paleti kelimenin tam anlamıyla
tersine çevrilirse (beyaz zeminde parlak neon) kontrast çöker.

**Kontrast ölçümleri:** Koyu: text/bg 16.97, textMuted/bg 7.88, accent/bg 6.63, playerX/bg 12.25,
playerO/bg 8.19, win/bg 13.25, danger/bg 7.89, border/bg 3.97 (güncellenmiş değerle). Açık:
text/bg 16.28, textMuted/bg 7.08, accent/bg 5.53, playerX/bg 4.67, playerO/bg 6.04, win/bg 4.75,
danger/bg 5.09, border/bg 3.75. **Tümü eşiği geçiyor** (playerX/win açık temada 4.67/4.75 ile en
dar marj — kabul edilebilir ama uygulamada tekrar ölçülmeli).

**Tipografi:** Fredoka (başlık, skor, oda kodu — yuvarlak/oyuncu hissi) + Sora (arayüz).

**Boşluk/şekil:** Kartlar `radius.lg`(20), butonlar `radius.full` (hap), tahta hücreleri 3×3'te
`radius.md`(12) + hafif gölge — "kart" hissi. `gap.sm`(8) hücreler arası.

**Hareket:** Hamle: 180ms `cubic-bezier(.34,1.56,.64,1)` "zıplama" pop-in. Kazanan çizgi 200ms'de
parlayarak çizilir; **sürekli döngü/pulsing YOK** — kural "200ms'yi geçmesin" gereğini net karşılasın
diye kazanma vurgusu tek seferlik bir "flash-in", sonrasında statik bir glow'a oturuyor (animasyon
değil, sabit box-shadow).

**11×11 çözümü — "yassılaştırma kuralı" (bu yönün en kritik gerekçesi):** 3×3'teki kart görünümü
(köşe yuvarlama + gölge + parlama) 121 hücrede **kesinlikle çalışmaz** — gölgeler görsel çamura
dönüşür, köşe yuvarlama küçük boyutta bulanıklık gibi görünür. Bu yüzden n≥6'da **kart modundan
düz moda geçiş** kurallı: köşe yuvarlama 12px→3px, gölge/parlama tamamen kalkar, `gap` 8px→2px.
Dekorasyon yalnızca **geri bildirim anlarında** (kazanan hat, son hamle) `outline` olarak kalır.
Önizlemede 3×3/6×6/11×11 arası geçişte bu kural canlı görülüyor — 6×6 ve 11×11 görsel olarak C'ye
yakınsıyor (kasıtlı: dinlenme durumunda dekorasyon, yoğunlukla ters orantılı).

**Dokunma hedefi dürüstlüğü:** Aynı 44pt gerginliği burada da var; ek olarak bu yön "odak bölgesi"
(son hamle etrafında büyütülmüş mini-radar) fikrini öneriyor — tam tahtayı her an 44pt tutma
zorunluluğunu, oyunun zaten "son hamle" merkezli akışıyla hizalayarak gevşetiyor.

---

## Yön C — Sistem / Veri Izgarası

**Gerekçe:** XOX rekabetçi bir oyun — ELO, geçmiş, sıralama var. Bu yön tüm arayüzü **tek bir
ızgara metaforu** üzerine kuruyor: tahta zaten bir ızgara, sayfa düzeni de aynı mantıkla (hizalı
paneller, mono aksanlı durum etiketleri, spreadsheet tarzı bitişik hücreler) kuruluyor. "Profesyonel"
burada "ölçülebilir, güvenilir, dağınık olmayan" demek — bu yön en az "amatör" riski taşıyan,
en "kurumsal rekabetçi oyun" hissi veren seçenek.

**Palet:**

| Token                    | Açık                     | Koyu      | Not                                                             |
| ------------------------ | ------------------------ | --------- | --------------------------------------------------------------- |
| `bg`                     | `#eef0f2`                | `#0d1117` | (koyu, GitHub-benzeri kanıtlanmış bir "sistem" paleti soyundan) |
| `surface`                | `#ffffff`                | `#151b23` |                                                                 |
| `surfaceRaised` _(yeni)_ | `#f7f8fa`                | `#1c2530` |                                                                 |
| `border`                 | `#5b6472`                | `#64768a` | _(koyu aday `#4b5b6d` 2.72:1 idi, `#64768a`'ya açıklaştırıldı)_ |
| `text`                   | `#10151a`                | `#e6edf3` |                                                                 |
| `textMuted`              | `#4c5566`                | `#9aa7b5` |                                                                 |
| `accent`                 | `#0f6f66` (teal)         | `#3ddbc4` |                                                                 |
| `playerX`                | `#0e4f9c` (çelik mavisi) | `#6bb1ff` |                                                                 |
| `playerO`                | `#a3480a` (amber-kahve)  | `#f0954f` |                                                                 |
| `win`                    | `#136534`                | `#6bdc78` |                                                                 |
| `danger`                 | `#a91d1d`                | `#f97066` |                                                                 |

**Kontrast ölçümleri:** Açık: text/bg 16.06, textMuted/bg 6.57, accent/bg 5.27, playerX/bg 7.02,
playerO/bg 5.27, win/bg 6.25, danger/bg 6.38, border/bg 5.24 (en geniş marjlı border — bu yönün
"her yerde görünür ince çizgi" felsefesinin doğal sonucu). Koyu: text/bg 16.02, textMuted/bg 7.72,
accent/bg 10.93, playerX/bg 8.43, playerO/bg 8.22, win/bg 10.93, danger/bg 6.79, border/bg 4.06
(güncellenmiş değerle). **Üç yön arasında en geniş ortalama kontrast marjı bu yönde** — "veri
okunabilirliği" önceliğinin doğal sonucu.

**Tipografi:** IBM Plex Sans (arayüz/başlık) + IBM Plex Mono (oda kodu, durum etiketleri, süre,
koordinatlar — "SIRA: SEN", "[00:14]", "[ 7F-K2-9Q ]" gibi). Mono kullanımı yalnızca _kodlanmış_
bilgide (kimlik, süre, durum) — düz yazıda değil, bu yüzden okunabilirlik kaybı yok.

**Boşluk/şekil:** Radius yalnızca `sm`(6) veya yok; tahtada `gap:0`, hücreler kenarlıklarını
paylaşıyor (klasik spreadsheet ızgarası — `border-right`/`border-bottom` + dış çerçeve). Genel
sayfa arka planında çok hafif (opaklık ~%12) bir ızgara deseni var — "ızgara" kavramını tahtanın
dışına, tüm sayfaya taşıyor.

**Hareket:** En kısıtlı hareket dili — 120ms `fade`, kazanan hat 120ms'de "flaş" gibi belirir,
zıplama/eğri yok (linear/ease-out). Bu yön zaten "restraint" vaat ediyor; `prefers-reduced-motion`
ile arasındaki fark neredeyse sıfır.

**11×11 çözümü — bu yönün asıl iddiası:** Sıfır kural değişikliği. Tahta zaten bir veri ızgarası
olduğu için 3×3→6×6→11×11 arasında **hiçbir dekor kaldırılmıyor** çünkü kaldırılacak dekor hiç
yok — yalnızca hücre kenar uzunluğu küçülüyor (70px→48px→32px). Bu, üç yön arasında "büyük tahtada
en az mühendislik riski taşıyan" seçenek.

**Dokunma hedefi dürüstlüğü + ek öneri:** Aynı 44pt gerginliği (11×11'de ~32pt görsel hücre) burada
da var ve `hitSlop` ile çözülmesi gerekiyor — AMA bu yön ayrıca **klavye/ok-tuşu gezinme**yi
birincil alternatif etkileşim biçimi olarak öneriyor (zaten var olan `tabIndex`/`role=gridcell`
klavye erişilebilirliğinin doğal uzantısı): ok tuşlarıyla hücreden hücreye gezinip Enter ile
işaretleme. Bu, "veri ızgarası" felsefesiyle tutarlı tek yön — diğer ikisinde klavye gezinme bir
"ekstra", burada üçüncü bir ana etkileşim modu.

---

## Kontrast özet tablosu (tüm ölçümler, script: WCAG göreli parlaklık formülü)

| Tema   | text/bg | textMuted/bg | accent/bg | playerX/bg | playerO/bg | win/bg | danger/bg | border/bg (≥3) |
| ------ | ------- | ------------ | --------- | ---------- | ---------- | ------ | --------- | -------------- |
| A-açık | 14.88   | 5.46         | 6.10      | 10.31      | 8.47       | 5.82   | 5.94      | 3.38           |
| A-koyu | 16.03   | 8.05         | 9.09      | 10.18      | 9.34       | 9.89   | 7.21      | 3.70           |
| B-koyu | 16.97   | 7.88         | 6.63      | 12.25      | 8.19       | 13.25  | 7.89      | 3.97           |
| B-açık | 16.28   | 7.08         | 5.53      | 4.67       | 6.04       | 4.75   | 5.09      | 3.75           |
| C-açık | 16.06   | 6.57         | 5.27      | 7.02       | 5.27       | 6.25   | 6.38      | 5.24           |
| C-koyu | 16.02   | 7.72         | 10.93     | 8.43       | 8.22       | 10.93  | 6.79      | 4.06           |

Tüm metin token'ları ≥4.5:1 (WCAG AA), tüm `border` ≥3:1 (WCAG 1.4.11, "anlamlı UI bileşeni").
`playerX`/`playerO` hiçbir yönde birbirinden **yalnızca renkle** ayrılmıyor — üçünde de X iki
çizgi + O tek çember DOM yapısı korunuyor, yalnızca çizgi kalınlığı yöne göre değişiyor
(A: ince/zarif 2.5–3, B: kalın/oyuncu 4.5–5, C: orta/keskin `stroke-linecap:square` 2.5–3.5).

Hesaplama script'i: `contrast.ts`'teki aynı WCAG göreli parlaklık formülü; ham hesap dosyası
oturum içi geçici script olarak çalıştırıldı, kalıcı bir dosya bırakılmadı (istenirse
tekrarlanabilir — formül `packages/ui-tokens/src/contrast.ts`'in birebir aynısı).

## 11×11 karşılaştırma — kısa özet

| Yön | Boyut büyüdükçe ne değişir                          | Dekor riski                                         | Ek öneri                                    |
| --- | --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| A   | Yalnızca ölçü (hairline zaten boyuttan bağımsız)    | Yok                                                 | Yakınlaştır/pan                             |
| B   | n≥6'da kart modundan düz moda geçiş (kural gerekli) | Orta — kural unutulursa 121 kart/gölge "çamur" olur | Yakınlaştır/pan + "odak bölgesi" mini-radar |
| C   | Yalnızca ölçü (ızgara zaten dekor içermiyor)        | Yok                                                 | Ok tuşu gezinme (üçüncü etkileşim modu)     |

**Dokunma hedefi (44×44pt) üçünde de aynı matematiksel duvara çarpıyor:** 11 hücre × 44pt =
484pt, yaygın telefon genişliklerini (375–430pt) aşıyor. Hiçbir görsel yön bunu "güzelce" çözemez
— çözüm görsel değil etkileşim katmanındadır (`hitSlop` / pan-zoom / klavye-gezinme). Bunu üç
önizlemede de açıkça yazdım, gizlemedim.

## Token önerileri (uygulama kartına devredilecek, burada yalnız PROPOSAL)

- `surfaceRaised` — üç yönün de ihtiyaç duyduğu, gölgesiz "yükselti" zemin token'ı. `colors.ts`'e
  eklenmeli, `contrast.test.ts`'e (`meetsTextContrast` benzeri) yeni bir kilit eklenmeli.
- `fontFamily` (yeni `typography.ts` alanı) — hangi yön seçilirse seçilsin, web `next/font` +
  mobil `expo-font`/`@expo-google-fonts` ile aynı üç font adını (display/ui/mono) tek yerden
  besleyecek bir token grubu gerekiyor. Şu an `typography.ts`'te yalnızca `fontSize`/`fontWeight`
  var, `fontFamily` yok.
- `motionDuration` (yeni, ör. `{ fast: 120, base: 180, max: 200 }`) — "200ms'yi geçmesin" kuralı
  şu an hiçbir yerde tek kaynaktan gelmiyor; web/mobil ayrı ayrı sabit yazarsa kayma riski var
  (tıpkı renk gibi). Küçük ama "tek kaynak" ilkesiyle tutarlı bir ek.

Bu üçü de yalnızca öneri — seçim netleşince ilgili karta (muhtemelen `xox-dev-ui-tokens` veya
eşdeğeri) devredilir, bu kart hiçbir token dosyasına dokunmadı.

## Uygulama (DESIGN-001a, 2026-08-26) — Ömer Yön A'yı seçti, tokenlar yazıldı

Yukarıdaki üç token önerisi (`surfaceRaised`, `fontFamily`, `motionDuration`) **birebir
`packages/ui-tokens`'a uygulandı** (bkz. `docs/board/reports/DESIGN-001a.md` — tam token
listesi, kontrast tablosu, KK-084 sondası). Bu bölüm yalnız ADR-0017'nin (ARCH-002, tahta
boyutu kartı) Yön A önizlemesinden **BİLİNÇLİ SAPTIĞI** üç noktayı kayda geçirir — amaç,
tasarımcı ajanın bunları ileride "uygulanmamış, geri getirilmesi gerek" sanmasını önlemek:

1. **Izgara boşluğu 1 px değil, 2 px.** Bu belgenin "Boşluk" bölümü `gap:1px` öneriyordu.
   ADR-0017 §2 bunu KK-B51'in (komşu dokunma hedefleri arası ≥2 px ayrım) gereğiyle 2 px'e
   çıkardı — gerekçe: boyuta göre değişen bir `gap` (3×3'te 1px, 11×11'de 2px) tam da bu
   belgenin altında imzaladığım "tek görsel kod yolu, boyuta göre dallanmaz" ilkesini ihlal
   ederdi. `packages/ui-tokens/src/board.ts` → `board.gridLine = 2` (`--xox-grid-line: 2px`),
   TÜM boyutlarda tek değer. 76 px'lik bir hücrede %2.6 — hâlâ hairline okunuyor.
2. **"Yakınlaştır" düğmesi UYGULANMAZ.** Önizlemedeki pan/zoom demosu bir sözleşme değil,
   bir demo öğesiydi. ADR-0017 §3 (KK-B50) bunu reddetti: rakibin tehdidini ve kazanan
   çizgiyi tek bakışta görmek oyunun kendisi; pan/zoom ekran okuyucu ve anahtar-erişim
   hareketleriyle çakışır. Token katmanında bu maddenin hiçbir karşılığı YOK (bilinçli yokluk).
3. **`hitSlop` ile 44 pt'a tamamlama REDDEDİLDİ.** Bu belgenin "dokunma hedefi dürüstlüğü"
   notu 11×11'de görünür hücrenin (~34pt) dokunma alanını `hitSlop` ile 44pt'a tamamlamayı
   öneriyordu. ADR-0017 §4 bunun **geometrik olarak imkânsız** olduğunu gösterdi: hücre
   merkezleri ~30px arayla dizilirken 44px'lik hedefler zorunlu olarak çakışır, çakışan
   hedef dokunmayı yanlış hücreye düşürür — 28px'lik doğru hedeften kesin olarak kötü.
   Karar: 11×11'de dokunma hedefi hücrenin KENDİSİDİR (WCAG 2.2 SC 2.5.8 eşiği 24×24, ölçülen
   ≥28px payla geçer). Token katmanı bu yüzden `minCellSize`/`hitSlop` GİBİ bir token
   TANIMLAMAZ — `board.test.ts` bunu açıkça kilitler ("hiçbir token için alt sınır
   TANIMLANMAZ").

Yeni token'lar (bu belgenin önerdiklerinin ötesinde, uygulama sırasında ihtiyaç çıktı):
`board.boardMax` (`--xox-board-max: 480px` — önizlemedeki kart genişliğiyle aynı),
`board.focusRingWidth/Offset`, `board.winningOutlineWidth` (ADR-0017 §8c, renkten bağımsız
kazanan sinyali), `board.fadedOpacity` (ADR-0017 §8b, kazanan olmayan hücreler), `board.markStrokeX/O`
(X/O'yu yalnızca renkle değil kalınlıkla da ayırt etmek için — X=3px, O=2px).

## Öneri

Üçü de üretime çıkarılabilir kalitede; seçim Ömer'e ait. Benim eğilimim **Yön C (Sistem/Veri
Izgarası)**'dan yana, üç gerekçeyle: (1) 11×11'e **sıfır özel kural** ile taşınıyor — en düşük
mühendislik/E2E kırılma riski, (2) altı ölçümün hepsinde en geniş kontrast marjı, (3) ELO/sıralama/
geçmiş gibi zaten var olan "ölçülebilir rekabet" özellikleriyle görsel dil örtüşüyor. **Yön A**
güçlü bir ikinci seçenek — eğer hedef kitle "sıcak/arkadaşça" bir ton istiyorsa (aile/arkadaş
arası oyun hissi) C'den daha davetkâr. **Yön B** en yüksek "vitrin" etkisine sahip ama tek yön
bu ki büyük tahtada dekorasyonun bilinçli ve disiplinli şekilde geri çekilmesini **gerektiriyor**
— uygulama kartı bu kuralı atlarsa (kart-görünümü her boyutta korunursa) 11×11'de risk gerçekleşir;
seçilirse bu kısıt kart tanımına açıkça yazılmalı.
