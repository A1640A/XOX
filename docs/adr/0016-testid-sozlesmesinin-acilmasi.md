# ADR-0016 — `testids.ts` unfreeze: 5 `TESTID` + 3 `DATA_ATTR`, aynı kartta, aynı commit'te

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** spec §6, SB-11 · KK-B11, KK-B12, KK-B17, KK-B49, KK-B54, KK-B55
- **Öncelik:** P1 — E2E'nin gözlemleyebilirliğini belirler

## Bağlam

`packages/shared/src/testids.ts` **donmuş** bir sözleşmedir. Web `data-testid`, mobil `testID`
ve `apps/e2e` `getByTestId` **aynı sabiti** import eder. `DESIGN-001`'in kabul kriterlerinden
biri de açıkça şudur: _"test-id sözleşmesi DONMUŞ — görsel değişiklik E2E'yi kırmamalı.
Kırarsa test-id değil SINIF/YAPI değiştir."_

Tahta boyutu özelliği beş yeni kanca ve üç yeni veri niteliği istiyor. Kancasız kalan her
kriter E2E'de **DOM yapısına** (sınıf adı, sıra, metin) bağlanmak zorunda kalır — ve
`DESIGN-001` tam olarak o yapıyı değiştiriyor.

## Karar

**1. `testids.ts` bu özellik için TAM OLARAK BİR KEZ açılır — `CTR-BOARD-001` içinde.**
Aynı kart protokolü de açıyor (ADR-0015); iki donmuş sözleşme **tek pencerede** açılır ve
birlikte yeniden donar. Ayrı bir "testid kartı" açılmaz: `packages/shared`'a aynı dalgada
iki kart dokunamaz.

**2. Eklenen beş `TESTID`:**

| Anahtar           | Değer              | Nerede                         | Taşıdığı bilgi                        |
| ----------------- | ------------------ | ------------------------------ | ------------------------------------- |
| `tahtaBoyut3`     | `tahta-boyut-3`    | oda kurma + bilgisayar ekranı  | `aria-pressed`                        |
| `tahtaBoyut6`     | `tahta-boyut-6`    | aynı                           | `aria-pressed`                        |
| `tahtaBoyut11`    | `tahta-boyut-11`   | aynı                           | `aria-pressed`                        |
| `kazanmaUzunlugu` | `kazanma-uzunlugu` | aynı                           | `data-deger="<K>"`                    |
| `oyunAyariOzeti`  | `oyun-ayari-ozeti` | oda / bekleme / katılma ekranı | metin: "11×11 tahta · 5 taş yan yana" |

Üç boyut düğmesi **ayrı ayrı** anahtarlardır, `boardSizeTestId(n)` fonksiyonu **değildir**:
izinli boyutlar donmuş bir üçlüdür (spec §0.1 #1, "başka boyut yok") ve fonksiyon,
listede olmayan bir boyutun kancasını da üretebilir görüntüsü verirdi. `cellTestId(i)`
fonksiyondur çünkü hücre sayısı gerçekten değişkendir.

**3. Eklenen üç `DATA_ATTR`:**

| Anahtar    | Nitelik          | Nerede  | Değerler                         |
| ---------- | ---------------- | ------- | -------------------------------- |
| `boyut`    | `data-boyut`     | `tahta` | `"3"` \| `"6"` \| `"11"`         |
| `kazanma`  | `data-kazanma`   | `tahta` | `"3"` \| `"4"` \| `"5"` \| `"6"` |
| `sonHamle` | `data-son-hamle` | hücre   | `"true"` ya da nitelik **yok**   |

`data-son-hamle` yokluk-tabanlıdır (`"false"` yazılmaz) — `data-kazanan` ve `data-bekliyor`
ile aynı konvansiyon; `Board.tsx` bugün `undefined` vererek niteliği hiç yazmıyor.

**4. Değişmeyenler — bilerek:**

- `cellTestId(index)` **kodu değişmez**. `hucre-0 … hucre-120` kendiliğinden çalışır.
  Yalnız yorum satırındaki "0..8" → "0..N²−1" güncellenir.
- `zorluk-unbeatable` **değişmez**: N > 3'te etiket "Zor" olsa bile kanca aynıdır (KK-B47).
  `Difficulty` tipi de değişmez.
- `tahta`, `durum-metni`, `sira-gostergesi`, `data-tas`, `data-kazanan`, `data-bekliyor`,
  `data-sira` aynen korunur.

**5. Mevcut E2E senaryolarının tamamı değiştirilmeden geçer (KK-B41).**
`playMove(page, i)` / `expectCell(page, i, mark)` imzaları **korunur**; boyut parametresi
**opsiyonel** eklenir. Kırılması beklenen tek sınıf: kazanan üçlüyü elle yazan iddialar
(`result-rematch.spec.ts`'te 0-1-2 dizisi). Bunlar konfigürasyondan hat üreten bir yardımcıya
taşınır (`winningLineFor(config)`), ve o yardımcı `@xox/shared` üzerinden `winLines`'a
ulaşır — `apps/e2e` `@xox/game-core`'u import **edemez** (`boundaries` politikası yalnız
`e2e → shared`).

## Gerekçe

- **Neden yeni kanca, neden DOM yapısı değil:** `DESIGN-001` aynı dosyaları yeniden yazıyor.
  Kancasız bir E2E, tasarım kartıyla birlikte kırılır ve iki kart birbirini suçlar.
  Kanca, iki kartın **paralel** gidebilmesinin ön koşuludur.
- **Neden `data-boyut` ve `data-kazanma` ayrı iki nitelik:** tek bir `data-ayar="11x5"`
  ayrıştırma gerektirirdi ve E2E'de string parçalama üretirdi. İki nitelik iki bağımsız
  iddiaya izin verir (KK-B18 rövanşta ikisinin de değişmediğini iddia ediyor).
- **Neden `oyun-ayari-ozeti` tek kanca, üç ekranda:** aynı bilgi, aynı biçim, tek metin
  şablonu (`tr.boardConfig.summary`). Ekrana göre üç ayrı kanca, aynı iddianın üç kopyasını
  doğururdu.
- **Neden `kazanma-uzunlugu` kapsayıcıya, seçeneklere değil:** izinli K kümesi boyuta göre
  değişiyor (KK-B12). Kapsayıcıdaki `data-deger` seçili değeri, içindeki düğmeler de
  mevcut seçenekleri gözlemlenebilir kılar; K başına ayrı kanca (`kazanma-4`, `kazanma-5`,
  `kazanma-6`) üç anahtar daha ekler ve KK-B13'ün "geçersiz kombinasyon hiçbir anda görünmez"
  iddiasını kolaylaştırmaz.

## Reddedilen alternatifler

| Alternatif                                                    | Neden reddedildi                                                                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ayrı bir `TESTID-UNFREEZE` kartı açmak                        | `packages/shared`'a aynı dalgada iki kart dokunamaz (ADR-0015 tek pencere kuralı); ayrı dalgaya koymak protokol penceresini ikiye böler.                                                      |
| `boardSizeTestId(n)` fonksiyonu                               | İzinli boyutlar donmuş bir üçlü; fonksiyon, var olmayan bir boyutun kancasını üretebilir görüntüsü verir ve "başka boyut yok" değişmezini bulandırır.                                         |
| `data-son-hamle="false"` yazmak                               | `data-kazanan`/`data-bekliyor` konvansiyonundan sapar; Playwright'ta `toHaveAttribute` ile "yok" iddiası zaten `not.toHaveAttribute`.                                                         |
| `zorluk-unbeatable`'ı `zorluk-zor` olarak yeniden adlandırmak | Kanca **davranışa** değil **seçeneğe** bağlı; `Difficulty` tipi değişmiyor. Yeniden adlandırma mevcut E2E'yi ve mobil paritesini kırar, hiçbir kriteri karşılamaz (KK-B47 açıkça yasaklıyor). |
| Kancaları eklemeyip E2E'yi metin/rol ile yazmak               | Türkçe metin `tr.ts`'ten geliyor ve `DESIGN-001` tipografiyi/yapıyı değiştiriyor; metin tabanlı seçiciler iki kaynaktan birden kırılır.                                                       |

## Sonuçlar

- ✅ E2E, tasarım kartından bağımsız hâle gelir; iki iş paralel gidebilir.
- ✅ `TESTID` 26 → 31, `DATA_ATTR` 8 → 11. `testids.test.ts`'in elle yazılmış anahtar sayısı
  iddiaları bu sayılara güncellenir (çıplak sayı korunur, türetilmiş hâle getirilmez).
- ⚠️ Mobil bu kancaların hiçbirini bugün **render etmiyor** (`apps/mobile` yalnız statik bir
  ana sayfa içeriyor). Sözleşme yazılır, mobil tüketimi W2-03'ün işidir.
- 📌 Kalıcı kural: donmuş bir sözleşmeyi açan kart, aynı commit'te onu **yeniden dondurur** —
  yani kartın kabul kriteri "bu dalgadan sonra `packages/shared` bu özellik için bir daha
  açılmaz" cümlesini içerir.
