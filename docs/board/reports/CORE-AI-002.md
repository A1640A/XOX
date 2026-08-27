# CORE-AI-002 — 3×3 minimax'a alfa-beta

```yaml
task: CORE-AI-002
status: done
summary: >
  3×3 `bestMove`e alfa-beta budaması eklendi. Boş tahtada 549 945 → 20 865 düğüm
  (26.4×); esbuild bundle + CDP R=6 throttle altında 1230 ms → 48 ms, KK-023'ün
  1000 ms tavanının çok altında. Seçilen hamle ULAŞILABİLİR 9040 (pozisyon ×
  oyuncu) çiftinin HEPSİNDE budamasız hâlle birebir aynı; 642 oyunluk yenilmezlik
  koşusu ve `ai.test.ts`'in tek bir beklentisi değişmedi.
files_changed:
  - packages/game-core/src/ai.ts
  - packages/game-core/src/ai.test.ts
  - docs/board/reports/CORE-AI-002.md
tests: { added: 7, passing: 248, coverage: '%100', mutation: '%98.05' }
decisions:
  - karar: Alfa-beta, `bestMove`in KENDİ gövdesine eklendi; `search.ts` motoruna delege edilmedi.
    gerekçe: >
      ADR-0013 §1 3×3 yolunu bilerek ayrı tutuyor. `searchMove` aday daraltma +
      sezgisel değerlendirme + derinlik sınırı da getirir; bunlar minimax DEĞERİNİ
      değiştirir ve KK-B20'nin yenilmezlik kanıtı yeniden kurulmak zorunda kalırdı.
      Alfa-beta ise değeri değiştirmeyen tek müdahaledir.
    reddedilen_alternatif: 3×3'ü `searchMove`e bağlamak (ADR-0013 §1'i iptal ederdi).
  - karar: Düğüm sayacı GEZİCİ bir `Visits` nesnesi; modül düzeyinde sayaç yok.
    gerekçe: >
      Modül durumu Stryker `perTest` altında testler arası sızar (gotcha 2026-08-26:
      yalnız test sırası değişince skor %94.04 → %84.25). Gezici nesne her çağrıda
      sıfırdan başlar; `ai.test.ts` bunu ayrıca iddia ediyor.
    reddedilen_alternatif: modül düzeyi `let nodes = 0` + `resetNodes()`.
  - karar: Sayaç `bestMoveStats` ile ai.ts'ten dışa verildi, `index.ts` yüzeyine EKLENMEDİ.
    gerekçe: >
      ADR-0013 §9 dış yüzeyi dar tutuyor ve `index.test.ts` onu elle yazılmış bir
      listeyle donduruyor. Sayaç bir test gözlemidir, paket sözleşmesi değil.
      knip temiz çıktı (kullanım `ai.test.ts`'te).
    reddedilen_alternatif: `chooseMove`a `onStats` callback'i (üç alanlı `ChooseMoveOptions` sözleşmesini bozardı).
  - karar: Hamle sıralaması (killer/merkez-önce) EKLENMEDİ.
    gerekçe: >
      Doğal indeks sırasıyla bile 26.4× kazanç var ve R=6'da 48 ms — tavana 20×
      pay. Sıralama ek mutant yüzeyi ve ek karmaşıklık getirirdi, ölçülebilir bir
      ihtiyaç yok.
    reddedilen_alternatif: statik hamle sıralaması.
gotchas:
  - >
    Budamayı kapatan sonda, düğüm sayılarını TAM OLARAK kart öncesindeki değerlere
    (549945/59704/55504/1096) geri döndürdü. Yani sonda aynı anda testin "budamasız"
    sütununu da doğruluyor — beklenti tablosunun dışarıdan geldiğinin mekanik kanıtı.
  - >
    Worktree'de `pnpm gates` `apps/web/lib/realtime/presence.test.ts`te KIRMIZI verir:
    worktree repo kökündeki `.env.local`i almaz (gotcha 2026-08-24), `MONGODB_URI`
    tanımsız kalır. Bu artık yalnız `packages/db`yi değil `pnpm gates`in tamamını
    düşürüyor. Dosya KOPYALAMADAN çözümü:
    `set -a; . <ana-checkout>/.env.local; set +a; pnpm gates`.
  - >
    ADR-0013 §1 ve `search.ts`in başlık yorumu 3×3 için "budama yok" diyor —
    ARTIK YANLIŞ. `ai.ts` içindeki kopya bu kartta düzeltildi; ADR ve `search.ts`
    çakışma kümem dışındaydı, sahipsiz kaldı (bkz. next_suggestions).
blocked_reason: null
next_suggestions:
  - ADR-0013 §1'in "Budama yok, derinlik sınırı yok, bütçe yok" cümlesini düzelt — budama artık var, sonuç değişmiyor.
  - '`search.ts` başlık yorumu (satır ~20) "bugünkü tam minimaxa gider" diyor; alfa-beta notu eklenmeli.'
  - AI-SPIKE-001 (a) [MANUEL] hâlâ açık — gerçek cihazda R ölçülünce bu rapordaki ms değerleri yeniden ölçeklenmeli.
  - '`AI_BUDGET_MS = 1000` hâlâ DOĞRULANMAMIŞ (N>3 yolu); bu kart yalnız 3×3 yolunu kapattı.'
```

---

## 1. Sorun ve çözümün sınırı

`AI-SPIKE-001` kırmızı bayrağı: 3×3 `unbeatable` yolu (`bestMove`) **budamasız tam
minimax** koşuyor, boş tahtada **549 945 düğüm** geziyor ve gerçek bundle'da CDP R=6
throttle altında **1982–2265 ms** sürüyordu — KK-023'ün **1000 ms** tavanının iki katı.
Darboğaz yalnız **açılış pozisyonu** (dallanma 9); lead'in ölçümü de bunu gösteriyordu
(boş tahta 211 ms, ilk hamleden sonra 21 ms).

Alfa-beta **minimax değerini değiştirmez, yalnız budar**. Kökün kararını artık
etkileyemeyecek dallar atlanır. Bu teorinin bu repodaki mekanik kanıtı §3'te.

---

## 2. Ne değişti

`packages/game-core/src/ai.ts`:

- `minimax` artık `alpha`/`beta` penceresi alıyor ve `low >= high` olunca döngüyü kesiyor.
  `low`/`high` parametrelerin **yerel kopyalarıdır** (`no-param-reassign`).
- `bestMoveStats(board, player) → { move, nodes }` eklendi. `bestMove` artık onun ince
  sarmalayıcısı: `bestMoveStats(board, player).move`. Kök penceresi `(alpha, +∞)`,
  `alpha` her çocuktan sonra `Math.max` ile yükselir.
- Ziyaret sayacı gezici `Visits` nesnesi.
- `strongMove`un "Budama yok" yorumu düzeltildi.

`packages/game-core/src/ai.test.ts`: **yalnızca ekleme**. Diff'te silinen TEK satır
import satırıdır:

```
$ git diff -U0 packages/game-core/src/ai.test.ts | grep -E "^-[^-]"
-import { bestMove, chooseMove } from './ai'
```

Yani hiçbir beklenti gevşetilmedi, hiçbir oyun sayısı ve hiçbir eşik değiştirilmedi.

---

## 3. Yenilmezlik kanıtı — 642 oyun DEĞİŞMEDEN yeşil

```
✓ unbeatable zorluk > X olarak oynayan AI, rakibin bütün oyunlarında kaybetmez
  ve kural dışı hamle yapmaz                                              16ms
✓ unbeatable zorluk > O olarak oynayan AI, rakibin bütün oyunlarında kaybetmez
  ve kural dışı hamle yapmaz                                              36ms
✓ unbeatable zorluk > iki mükemmel AI karşılaşırsa beraberlik olur         14ms

Test Files  1 passed (1)
     Tests  39 passed (39)
```

Bu iki test `losses: 0, illegal: 0` **ve** `games: 73` / `games: 569` (toplam **642**)
iddialarını değişmeden taşıyor. Oyun sayısı eşitlik-bozma kuralını da çiviler: motor
eşdeğer başka bir hamle seçseydi ağaç başka sayıda yaprak verirdi.

### 3.1 Diferansiyel denklik sondası — 642'den DAHA GÜÇLÜ (repo dışı, tek seferlik)

642 oyunluk koşu yalnız **AI'nın kendi oynadığı hatları** gezer. Ek olarak, kart
öncesi commit'teki (`8a2c906`) budamasız `bestMove` ile bugünkü alfa-beta'lı
`bestMove` **esbuild ile ayrı ayrı bundle'lanıp** ulaşılabilir **her** pozisyonda,
**her iki taş** için karşılaştırıldı:

```json
{ "benzersizOynanabilirPozisyon": 4520, "karsilastirma": 9040, "uyusmazlik": 0, "ms": 1226 }
```

**9040 karşılaştırma, 0 uyuşmazlık.** 9040 sayısı `ai.ts`'teki `WIN_SCORE`
yorumunun bağımsız olarak andığı "9040 ulaşılabilir (konum × oyuncu) çifti" ile
birebir aynı — sayımın doğruluğunun bağımsız çapraz kontrolü.

**Sondanın kendisi de sınandı (negatif kontrol).** Eşitlik-bozmayı `>` yerine `>=`
yapan geçici bir değişiklikle aynı sonda **3567 uyuşmazlık** raporladı
(`......... X: budamasız 0 → alfabeta 8`). Yani "0 uyuşmazlık" boş bir yeşil değil.
Değişiklik `git checkout --` ile geri alındı, `git status --porcelain` boş.

---

## 4. Sonda (8. kriter) — budamayı kapatan mutasyon düğüm iddiasını KIRAR

Sıra: **commit (`5cf63c0`) → sonda → `diff -q` ile değişimi doğrula → koş →
`git checkout --` → `git status --porcelain` boş.** Üçünde de `diff -q` "differ" dedi
(sonda gerçekten uygulandı).

| Sonda  | Değişiklik                                  | Sonuç                                                                 |
| ------ | ------------------------------------------- | --------------------------------------------------------------------- |
| **P1** | `if (low >= high) break` **silindi**        | **5 test KIRMIZI**, 34 yeşil. Düğümler: 549945 / 59704 / 55504 / 1096 |
| **P2** | `low = Math.max(low, best)` → `low = alpha` | **5 test KIRMIZI**, 34 yeşil. Düğümler: 113524 / 13063 / 8486 / 335   |
| **P3** | `alpha = Math.max(...)` → `Math.min(...)`   | **4 test KIRMIZI**, 35 yeşil. Düğümler: 34202 / 6304 / 8465 / 529     |

P1 çıktısı:

```
× boş tahtada aynı hamleyi en az 10 kat daha az düğümle bulur
× ......... tahtasında X için 0 seçilir ve tam 20865 düğüm gezilir (budamasız 549945)
AssertionError: expected { move: +0, nodes: 549945 } to deeply equal { move: +0, nodes: 20865 }
AssertionError: expected { move: 4, nodes: 59704 } to deeply equal { move: 4, nodes: 2787 }
AssertionError: expected { move: +0, nodes: 55504 } to deeply equal { move: +0, nodes: 2458 }
AssertionError: expected { move: 4, nodes: 1096 } to deeply equal { move: 4, nodes: 200 }
     Tests  5 failed | 34 passed (39)
```

**Kartın tam istediği kanıt bu tabloda iki kere var:**

1. Budamayı kapatan her mutasyon düğüm iddiasını **kırmızıya** çeviriyor.
2. **Diğer 34 test yeşil kalıyor** — 642 oyunluk yenilmezlik koşusu ve bütün `bestMove`
   tablosu dahil. Yani sayaç olmasaydı budamanın kapanması **hiçbir testte
   görünmezdi**: sonuçlar aynı, yalnız program yavaşlar. Sayacın var olma gerekçesi
   ölçülmüş oldu.
3. Bonus: P1'in ürettiği sayılar testin "budamasız" sütunuyla **birebir** eşleşiyor
   (549945/59704/55504/1096), yani o sütunun gerçekten kart-öncesi davranışı temsil
   ettiği de kanıtlanmış oldu.

---

## 5. Düğüm sayısı

| Tahta       | Oyuncu | Budamasız   | Alfa-beta  | Kazanç    |
| ----------- | ------ | ----------- | ---------- | --------- |
| `.........` | X      | **549 945** | **20 865** | **26.4×** |
| `X........` | O      | 59 704      | 2 787      | 21.4×     |
| `....X....` | O      | 55 504      | 2 458      | 22.6×     |
| `XOX......` | X      | 1 096       | 200        | 5.5×      |

Test tavanı **gereksinimden** türetildi (implementasyondan değil): en az 10× azaltma.
2265 ms / 1000 ms ≈ 2.3× gerekiyordu; 10× istendi, 26.4× geldi.

---

## 6. Yeniden ölçüm (7. kriter) — esbuild bundle + CDP R=6, CI Node'unda DEĞİL

**Yöntem AI-SPIKE-001 ile aynı:** gerçek `packages/game-core/src/ai.ts` esbuild ile
tarayıcı IIFE'ine bundle'landı, Chromium `about:blank`'te `page.addScriptTag` ile
yüklendi, `CDPSession.send('Emulation.setCPUThrottlingRate', { rate })` uygulandı,
iş yükü **3×3 boş tahta** (`bestMove(emptyBoard(), 'X')`), 7 tekrar.

**Kontrol grubu dahil edildi:** aynı harness'te kart öncesi commit (`8a2c906`) da
bundle'lanıp ölçüldü, böylece "ölçüm makinesi mi değişti, kod mu?" sorusu kapandı.

| Bundle                    | R   | min      | medyan     | maks     |
| ------------------------- | --- | -------- | ---------- | -------- |
| budamasız (`8a2c906`)     | 1   | 177.8    | 199.1      | 200.5    |
| budamasız (`8a2c906`)     | 6   | 1069.3   | **1230.2** | 1265.0   |
| **alfa-beta (`5cf63c0`)** | 1   | 7.6      | 7.7        | 9.7      |
| **alfa-beta (`5cf63c0`)** | 6   | **47.5** | **48.4**   | **55.4** |

**R=6'da 48.4 ms ≪ 1000 ms.** ✅ 7. kriter karşılandı.

### Dürüstlük notu — AI-SPIKE-001'in mutlak sayısını yeniden üretemedim

Spike aynı budamasız kodu R=6'da **1982–2265 ms** ölçmüştü; ben **1069–1265 ms**
ölçüyorum. Bu bir **yöntem** farkı değil, **makine** farkı:

| Ölçüm          | Spike       | Bu koşu     | Oran       |
| -------------- | ----------- | ----------- | ---------- |
| budamasız, R=1 | 355.7–388.2 | 177.8–200.5 | **~1.87×** |
| budamasız, R=6 | 1982–2265   | 1069–1265   | **~1.73×** |

İki satırın oranı tutarlı (~1.7–1.9×) — yani bu makine spike'ın koştuğu makineden
o kadar hızlı. **Tutucu okuma:** alfa-beta'nın R=6 medyanı spike makinesine
ölçeklenirse `48.4 × 1.87 ≈ 91 ms`. Her iki okumada da 1000 ms tavanının
**10–20× altında**.

**Ölçemediğim:** gerçek bir orta sınıf Android cihaz. `AI-SPIKE-001` (a) [MANUEL]
adımı hâlâ açık ve R=6 hâlâ bir **varsayım**. Ölçüm doğrusal olduğu için: bu kod
R=**124**'e kadar 1000 ms tavanının altında kalır (48.4/6 × R ≤ 1000). R=6
varsayımının 20 katı. Yani bu risk pratikte kapandı, ama "gerçek cihazda ölçüldü"
DEMİYORUM — ölçmedim.

**Playwright kuralı (CLAUDE.md #1) ihlal edilmedi:** ölçüm betiği repo AĞACINDA
değil, scratchpad'te yaşadı ve `playwright-core`u pnpm store'dan mutlak yolla
import etti. `packages/**` ya da `apps/**` altına hiçbir dosya, import ya da
bağımlılık eklenmedi; `git status --porcelain` ölçüm sonrası boş.

---

## 7. Kapılar

```
$ pnpm gates                                   → GATES_EXIT=0  (5/5 kapı)
    typecheck   7 successful, 7 total
    lint        temiz
    format:check  All matched files use Prettier code style!
    test:coverage  game-core 16 dosya / 248 test — Statements 100% (461/461)
                   Branches 100% (243/243)  Functions 100% (70/70)  Lines 100% (380/380)
                   shared 11 · ui-tokens 6 · db 28 · web 69 — hepsi yeşil
    knip        EXIT=0 (yalnız önceden var olan konfigürasyon ipuçları)

$ pnpm exec turbo run typecheck --force        → Tasks: 7 successful   Cached: 0 cached
$ pnpm exec turbo run test:coverage --force    → Tasks: 5 successful   Cached: 0 cached
```

`pnpm gates` ilk denemede `apps/web/lib/realtime/presence.test.ts`te düştü —
**benim değişikliğimle ilgisiz**: worktree repo kökündeki `.env.local`i almıyor
(gotcha 2026-08-24), `MONGODB_URI tanımlı değil`. O test `@xox/game-core`
kullanmıyor. Ortam değişkeni ana checkout'un `.env.local`inden **dosya
kopyalamadan** sağlanınca kapı tamamen yeşil (`MONGODB_DB` testin kendisi
tarafından koşulsuz `xox_test`e zorlanıyor).

### Mutasyon

```
All files     |  98.05 |   98.05 |      817 |        39 |         17 |        0 |        0 |
 ai-config.ts | 100.00 |  100.00 |        2 |         0 |          0 |        0 |        0 |
 ai.ts        | 100.00 |  100.00 |       86 |         0 |          0 |        0 |        0 |
 board.ts     |  98.48 |   98.48 |       64 |         1 |          1 |        0 |        0 |
 config.ts    | 100.00 |  100.00 |       71 |         0 |          0 |        0 |        0 |
 errors.ts    | 100.00 |  100.00 |        3 |         0 |          0 |        0 |        0 |
 evaluate.ts  |  97.58 |   97.58 |      197 |         5 |          5 |        0 |        0 |
 moves.ts     | 100.00 |  100.00 |       47 |         0 |          0 |        0 |        0 |
 search.ts    |  95.51 |   95.51 |      211 |        23 |         11 |        0 |        0 |
 status.ts    | 100.00 |  100.00 |      136 |        10 |          0 |        0 |        0 |
INFO Final mutation score of 98.05 is greater than or equal to break threshold 90
```

**%98.05 ≥ %98** (main'de %98.02'ydi — pay incelmedi, **arttı**). `ai.ts` dosyası
**%100**: 86 mutantın hepsi öldü, hiçbiri hayatta kalmadı. Hayatta kalan 17
mutantın tamamı `search.ts`/`evaluate.ts`/`board.ts`te, yani **CORE-AI-001'in
alanında** — bu kartta dokunulmadı.

---

## 8. Commit'ler

| SHA       | Mesaj                                                               |
| --------- | ------------------------------------------------------------------- |
| `5cf63c0` | `perf(core): 3x3 minimax'a alfa-beta — 549 945 dugum 20 865'e indi` |

Dal: `feat/CORE-AI-002` (worktree `.claude/worktrees/CORE-AI-002`).
**Merge/push YAPILMADI.** `--no-verify` KULLANILMADI — lefthook `pre-commit`
(gitleaks + format + lint) ve `commit-msg` (commitlint) her commit'te koştu ve yeşil verdi.

### Dokunulmayanlar

`packages/game-core/src/search.ts`, `ai-config.ts`, `apps/web/**` — hiçbirine
dokunulmadı. Ana checkout'a hiçbir dosya yazılmadı.
