# CORE-AI-001 — Büyük tahta AI (N > 3)

> **Bu raporu lead yazdı, kartı yürüten ajan değil.** Ajan işi bitirip commit'ledi ama
> raporu yazamadan oturum limitine takılıp düştü (sıfırlanma 13.5 saat sonra). Aşağıdaki
> her sayı lead'in kendi ölçümüdür; ajanın beyanları doğrulanmadan aktarılmadı.

## Ne yapıldı

`packages/game-core/src/search.ts` (407 satır): N > 3 için aday daraltma (`CANDIDATE_RADIUS`),
taktik tarama, alfa-beta, iteratif derinleşme ve iki katmanlı bütçe (düğüm + duvar saati).

**3×3 yolu dokunulmadan bırakıldı — ADR-0013 §1'in iki-kod-yolu kararı:**

```ts
if (config.size === 3) return bestMove(board, player)
return searchMove(board, player, { config, ... })
```

Kanıt: `ai.test.ts` **hiçbir satırı değişmedi** (`git diff main...HEAD -- ai.test.ts` boş) ve
geçiyor. Yenilmezlik garantisi tam minimaxa dayanmaya devam ediyor; yeni arama onu
etkilemiyor.

## Ölçüm — bütçe içinde ulaşılan derinlik

`AI_NODE_BUDGET = 30_000`, `AI_BUDGET_MS = 1000` ile, merkeze yakın açılış pozisyonlarında:

| Konfigürasyon | Derinlik | Düğüm  | Süre   |
| ------------- | -------- | ------ | ------ |
| 6×6 K=4       | 5        | 30 000 | 67 ms  |
| 6×6 K=5       | 4        | 30 000 | 62 ms  |
| 11×11 K=4     | 4        | 30 000 | 105 ms |
| 11×11 K=5     | 4        | 30 000 | 100 ms |
| 11×11 K=6     | 4        | 30 000 | 133 ms |

### İki bulgu — ikisi de kartın metnini düzeltiyor

**1. Kart yanlıştı, uygulama daha iyi çıktı.** Kartta (spike'ın projeksiyonundan aktarılmış)
"11×11 derinlik 3'ü bütçede bitiremez, derinlik 2 ≤ 260 ms" yazıyordu. Gerçek: **11×11
derinlik 4'e ~100–133 ms'de ulaşıyor.** Aday daraltma + alfa-beta + taktik tarama birlikte
projeksiyonu ikiye katladı. Kart metni ölçümden ÖNCE yazılmış bir tahmindi; ölçüm onu
geçersiz kıldı.

**2. `AI_BUDGET_MS`'in DOĞRULANMAMIŞ olması pratikte bağlayıcı DEĞİL.** Beş koşunun
beşi de **tam 30 000 düğümde** durdu ve hiçbiri 1000 ms'ye yaklaşmadı (en yavaşı 133 ms).
Yani sınırı **düğüm bütçesi** çiziyor, duvar saati değil. `ai-config.ts:102`'deki
`⚠️ DOĞRULANMAMIŞ — R = 6 VARSAYIMI` damgası **yerinde duruyor** ve durmalı: duvar saati
ancak ~8× daha yavaş bir cihazda devreye girer, ve `AI-SPIKE-001`'in `[MANUEL]` gerçek-Android
adımı hâlâ koşulmadı. Ama bugünkü masaüstü davranışı o varsayıma bağlı değil.

`MAX_SEARCH_DEPTH = 6` hiçbir 11×11 koşusunda ulaşılmadı — üst sınır olarak duruyor, pratikte
düğüm bütçesi önce bağlıyor.

## Kapılar

| Kapı        | Sonuç                                  |
| ----------- | -------------------------------------- |
| `typecheck` | temiz                                  |
| `lint`      | temiz                                  |
| `test`      | **241 geçti** (`main`'de 179 idi, +62) |
| `mutation`  | **%98.02** (eşik ≥%98)                 |

### Mutasyon dağılımı

| Dosya                                                                 | Skor      | Hayatta kalan                      |
| --------------------------------------------------------------------- | --------- | ---------------------------------- |
| `ai.ts`                                                               | 100.00    | 0                                  |
| `ai-config.ts` · `config.ts` · `moves.ts` · `errors.ts` · `status.ts` | 100.00    | 0                                  |
| `board.ts`                                                            | 98.48     | 1                                  |
| `evaluate.ts`                                                         | 97.58     | 5                                  |
| `search.ts`                                                           | 95.51     | 11                                 |
| **Toplam**                                                            | **98.02** | **17** (800 öldürüldü, 41 timeout) |

### Hayatta kalan mutantlar KOVALANMADI — gerekçe

`search.ts`'teki hayatta kalanların çekirdeği alfa-beta pencere muhasebesinde:

```
src/search.ts:315   if (best < high) high = best
                 →  if (true) high = best
                 →  if (best <= high) high = best
```

Bu mutantlar **budamanın ne kadar agresif olduğunu** değiştirir, aramanın **döndürdüğü
değeri** değil — alfa-beta'nın tanımlayıcı özelliği tam olarak budur. Yani çoğu davranışsal
olarak eşdeğer mutanttır: onları "öldürmek" için yazılacak test, ürünün doğruluğunu değil
**dahili düğüm sayısını** sabitler ve gelecekte her sıralama iyileştirmesinde kırılır.

Eşik zaten karşılandığı için bu satırlar bilinçli olarak açık bırakıldı. `ai.ts`'in %100'ü
ve 3×3 yolunun dokunulmamışlığı, ürün garantisinin bulunduğu yerde boşluk olmadığını
gösteriyor.

## Bilinen açık

`AI-SPIKE-001`'in gerçek-Android `[MANUEL]` ölçümü hâlâ Ömer'i bekliyor. Yukarıdaki tablo
masaüstünde alındı; mobilde düğüm bütçesi aynı kalsa da **süre** büyür. Düğüm bütçesi
bağlayıcı olduğu için davranış aynı derinlikte kalır, yalnız yanıt gecikir — bu yüzden
gerçek ölçüm bir **kalibrasyon** meselesi, bir doğruluk meselesi değil.
