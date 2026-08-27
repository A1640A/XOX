# PERF-004 — Paylaşılan paket sızıntısı

> **Bu kartın asıl teslimatı bir kod değişikliği değil, bir düzeltmedir:** `PERF-002`'den beri
> belgelenmiş olan "minimax sızıntısı" teorisi **suçluyu yanlış tespit etmiş.** Aşağıdaki
> ölçüm parça (chunk) düzeyinde yapıldı — daha önce hiç yapılmamıştı.

## Yanlış çıkan teori

`.size-limit.mjs`'in yorumu, `PERF-003`'ün raporu, bu kartın gerekçesi, ölçüm ajanının kök
neden analizi ve lead'in varsayımı — **hepsi** şu zinciri suçluyordu:

```
components/** → @xox/shared → export * from './room-client'
              → room-client.ts → @xox/game-core (ana barrel)
              → index.ts → ai.ts'i koşulsuz yeniden dışa verir  ⟹ minimax her rotada
```

Zincirin **her halkası gerçek**. Ama ölçülen etkisi teorinin öngördüğünün otuzda biri çıktı.

## Ölçüm — parça düzeyinde, ilk kez

`/giris` (ağır, 216 kB) ile `/_not-found` (hafif, 145 kB) arasındaki ilk-yükleme parça
listeleri karşılaştırıldı:

|                                 |                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ağıra **özel** parça            | `35i951b20_045.js` — **275.6 kB ham / 68.7 kB gzip**                                                    |
| İçeriği                         | **485 `zod` izi, SIFIR minimax izi** (`bestMove`/`alphaBeta`/`TERMINAL_SCORE`/`WINDOW_WEIGHT` aranarak) |
| Hafif rotaların ortak parçaları | ne zod ne minimax                                                                                       |

**68.7 kB gzip ≈ ağır (216) ile hafif (146) arasındaki 70 kB'lik farkın tamamı.**

Yani ağır rotaları ağır yapan şey **`zod`**; `@xox/shared`'ın barrel'ı zod şemalarının
tamamını istemci paketine sokuyor. `game-core`/minimax bu farkın içinde **hiç yok**.

### Teoriyi ampirik olarak da eledik

İki değişiklik denendi ve ölçüldü:

| Değişiklik                                            | `/profil` | `/oda/[kod]` |
| ----------------------------------------------------- | --------- | ------------ |
| başlangıç                                             | 219.27 kB | 222.08 kB    |
| `room-client.ts` alt yola geçti                       | 217.15 kB | 222.34 kB    |
| \+ `index.ts`'ten `ai` yeniden dışa verimi kaldırıldı | 217.15 kB | 220.34 kB    |

Toplam kazanç **~4 kB**. Teori doğru olsaydı ~70 kB beklenirdi.

## Yapılan (kalan) değişiklik

1. `packages/game-core/package.json` — **eklemeli**: `"./board"` ve `"./status"` alt yolları.
2. `packages/shared/src/room-client.ts` — `boardFromCells`/`evaluateStatus` artık alt yoldan.

**Hiçbir dışa verim adı kaybolmadı**: `@xox/shared`'ın çalışma zamanı dışa verim listesi
öncesi ve sonrası **103 ad, birebir aynı** (`diff` boş). `UI-CFG-001` aynı dalgada koşuyordu
ve bu şart onun için kondu.

Kazanç küçük ama kuplaj gerçek: `@xox/shared`'ın `@xox/game-core`'un **ana barrel'ına**
bağlı olmaması doğru durum ve ileride `ai.ts` büyüdüğünde bu satır bizi korur.

## GERİ ALINAN değişiklik ve nedeni

`packages/game-core/src/index.ts`'ten `bestMove`/`chooseMove`/`AI_BUDGET_MS`… yeniden
dışa verimlerini kaldırmıştım. **`src/index.test.ts` bunu yakaladı** — barrel yüzeyi
bilerek **dondurulmuş** ve elle yazılmış bir listeyle karşılaştırılıyor.

Test haklı, ben değil: ölçüm o kaldırmanın yalnız **2 kB** kazandırdığını gösteriyor.
Bilinçli olarak dondurulmuş bir kamu yüzeyini 2 kB için kırmak yanlış takas. Geri alındı.

(Not: o satırlardan geçen **tüketici yok** — `game-engine.ts` `PERF-003`'ten beri
`@xox/game-core/ai` kullanıyor. Yani köprü boş, ama yüzey sözleşmesi ayrı bir karar ve
onu bu kart değiştirmez.)

## `sideEffects: false` — eklenmedi

Ölçüm ajanı iki `package.json`'da da bu alanın olmadığını doğru tespit etti. Eklenmedi:
gerçek bir davranış değişikliği (yanlış işaretlenirse yan etkili modüller silinir) ve
**asıl maliyet zod olduğu için** faydası ölçülemeden alınacak bir risk olurdu. Zod işi
yapılırken birlikte değerlendirilmeli.

## `/profil` hafif gruba DÖNMEDİ — kartın bu şartı karşılanamadı

`.size-limit.mjs`'teki borç açık kalıyor ve yorumu bu raporu işaret edecek şekilde
güncellenmeli. `/profil` 217.15 kB; hafif bütçe 158 kB. **Aradaki fark zod'dur** ve
bu kartın kapsamındaki hiçbir değişiklik onu kapatamaz.

## Devam kartı — gerçek iş

`@xox/shared`'ın barrel'ı istemciye zod sokuyor. Çözüm yönü: şema modüllerini
istemci yolundan ayırmak (sabitler/tipler ayrı giriş, şemalar ayrı) — `TESTID`,
`DISPLAY_NAME_MAX`, `ErrorCode` gibi şeyler için bir istemci dosyasının zod'u
indirmemesi gerekir.

Bu **çok sayıda tüketici dosyasına** dokunur (`UI-CFG-001`, `UI-COMP-001` ve diğer
kartların kümeleri) — bu yüzden ayrı bir kart ve kendi dalgası olmalı, bu kartın
içine sıkıştırılmamalı.
