# PERF-003 — game-core (minimax dahil) tüm rotalara sızıyor

## Özet

İki ayrı sızıntı zinciri vardı, **yalnız biri bu kartın çakışma kümesi içinde**:

1. `/oyna/bilgisayar`'ın KENDİ ilk yüklemesi — `apps/web/components/computer/**` üzerinden,
   **düzeltildi ve ölçüldü**: **−69.86 kB gzip** (213.61 → 143.75 kB), rota artık "heavy"
   değil "light" grupta.
2. `/`, `/giris`, `/kayit`, `/oda/[kod]`, `/oda/katil`'in paylaşılan 298 kB'lık ortak parçası —
   kaynağı bu kartın çakışma kümesinin **DIŞINDA** (`packages/shared/src/room-client.ts` +
   `packages/game-core/src/index.ts`, ikisi de dokunulamaz). **Ölçüldü, düzeltilemedi,
   gerekçesiyle rapor ediliyor** (kart §4'ün izin verdiği kapanış yolu).

## Teşhis 1 — `/oyna/bilgisayar`'ın kendi sızıntısı (çözüldü)

`packages/game-core/src/index.ts` tek dosyalık bir barrel: `applyMove`/`evaluateStatus` gibi
"çekirdek" export'larla `chooseMove`/`bestMove` (minimax) AYNI modülden, KOŞULSUZ olarak dışa
veriliyor (`export { bestMove, chooseMove } from './ai'`). `apps/web/components/computer/
game-engine.ts` bu barrel'ın TAMAMINI (`@xox/game-core`) statik olarak içe aktarıyordu.

**Üç yaklaşım ölçüldü, sırayla:**

| #   | Yaklaşım                                                                                                                                   | Sonuç (ölçüldü)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/game-core/package.json`'a `./ai` alt yol export'u eklendi, `game-engine.ts` `chooseMove`'u oradan STATİK çekti                   | **SIFIR etki.** `route-bundle-stats.json` byte-byte AYNI, paylaşılan parça (`15mmlihtumdnh.js`, 298 132 bayt) hash'i bile değişmedi. Alt yol, aynı fiziksel modüle (`ai.ts`) işaret ettiği için Turbopack'in üretim derlemesi hâlâ TEK atomik varlık üretiyor — statik bir specifier değişikliği bundler'ın "kimin neyi paylaştığı" kararını ETKİLEMİYOR.                                                                                                                                                                                                                                                                                                            |
| 2   | `use-computer-game.ts`'teki `setTimeout` içine ham `await import('@xox/game-core/ai')` konuldu                                             | **Beklenmedik ve KÖTÜLEŞTİRİCİ.** `route-bundle-stats.json`'daki toplam bayt DEĞİŞMEDİ ama minimax kodu artık HER rotanın (`/`, `/giris`, `/kayit`, `/oda/[kod]`, `/oda/katil` DAHİL) kendi rota-özel parçasına gömülmüş olarak çıktı — `next start` + `curl` ile canlı doğrulandı: `/giris`'in servis edilen HTML'i `<script src=".../27hakgxev4-hn.js">` içeriyor ve bu dosya `strings` ile arandığında `chooseMove`'un `"Bilinmeyen zorluk: "` hata mesajını TAŞIYOR. Yani bu Turbopack sürümünde, STATİK olarak da paylaşılan bir modülün İÇİNDEN yapılan ham `import()`, gerçek bir eşzamansız sınır ÜRETMİYOR — içeriği her rotanın kendi paketine KOPYALIYOR. |
| 3   | `ComputerGameScreen.tsx` `ComputerGameInner.tsx`'e bölündü; `next/dynamic(() => import('./ComputerGameInner'), { ssr:false })` ile ÇEKİLDİ | **ÇALIŞTI.** `/oyna/bilgisayar`'ın `firstLoadChunkPaths`'i artık paylaşılan `15mmlihtumdnh.js`'i (dolayısıyla minimax'ı) HİÇ içermiyor. `next/dynamic`, Next.js'in birinci sınıf/çerçeve tarafından tanınan bölme ilkesi — ham `import()`'ün aksine gerçek bir eşzamansız sınır üretti.                                                                                                                                                                                                                                                                                                                                                                              |

**Neden #3 çalıştı, #1/#2 çalışmadı (kanıt + yorum):** Next.js/Turbopack'in üretim derlemesi
`transpilePackages` paketlerini MODÜL bazında (export bazında DEĞİL) paylaşım kararına sokuyor —
bir modül HERHANGİ bir yoldan ≥2 "kaynak" tarafından statik olarak erişilebilirse (aynı fiziksel
dosya, hangi specifier'dan gelirse gelsin), o modülün TAMAMI ortak bir varlığa katlanıyor. Ham
`import()` bile, çağıran modül ZATEN statik/paylaşılan bir grafiğe dahilse (bu durumda
`use-computer-game.ts`'nin diğer statik importları — `applyMove`/`evaluateStatus` — aracılığıyla),
bu paylaşım kararını BOZMUYOR. Yalnız `next/dynamic`'in kendi manifest/`ssr:false` mekanizması
gerçek bir kod-bölme sınırı garantiliyor.

**Ölçüm (öncesi/sonrası, `pnpm exec size-limit`, gzip):**

| Rota                   |                  ÖNCESİ (gzip) | SONRASI (gzip) | Fark               |
| ---------------------- | -----------------------------: | -------------: | ------------------ |
| `/oda/[kod]`           |                      214.65 kB |      214.79 kB | +0.14 kB (gürültü) |
| `/`                    |                      212.88 kB |      213.22 kB | +0.34 kB (gürültü) |
| `/kayit`               |                      212.75 kB |      212.88 kB | +0.13 kB (gürültü) |
| `/giris`               |                      212.63 kB |      212.76 kB | +0.13 kB (gürültü) |
| `/oda/katil`           | (ölçülmedi, PERF-002'de yoktu) |      212.83 kB | —                  |
| **`/oyna/bilgisayar`** |                  **213.61 kB** |  **143.75 kB** | **−69.86 kB** ✅   |
| `/profil`              |                      142.39 kB |      142.51 kB | +0.12 kB (gürültü) |
| `/_not-found`          |                      141.96 kB |      142.09 kB | +0.13 kB (gürültü) |

(+0.1–0.3 kB'lik gürültü her rotada var — kaynağa eklenen yorum satırlarından; anlamlı değil.)

`/oyna/bilgisayar` artık `/profil`/`/_not-found` ile aynı "light" katmanda. **Bu, `CORE-AI-001`
için doğrudan önemli**: alfa-beta/iteratif derinleştirme/sezgisel değerlendirme kodu `ai.ts`'ye
(veya ona komşu yeni bir dosyaya) eklendiği sürece, bu kod `ComputerGameInner` alt ağacının
İÇİNDE kalıp `next/dynamic` sınırının ARKASINDA büyüyecek — yani `/oyna/bilgisayar`'ın **ilk
yükleme JS'i CORE-AI-001 ile BÜYÜMEYECEK** (Next'in "First Load JS" tanımı zaten bu sınırın
ötesindeki her şeyi dışlıyor). `~20 kB` pay endişesi bu rota için pratikte ORTADAN KALKTI.

## Teşhis 2 — kalan sızıntı: kapsam dışı, düzeltilmedi (gerekçeli)

`/`, `/giris`, `/kayit`, `/oda/[kod]`, `/oda/katil` **hâlâ** aynı 298 132 baytlık paylaşılan
parçayı (`15mmlihtumdnh.js`, hash/boyut TÜM denemeler boyunca DEĞİŞMEDİ) indiriyor ve bu parça
`strings` ile arandığında minimax kodunu (`"Bilinmeyen zorluk: "`, `chooseMove`) hâlâ içeriyor.
`game-engine.ts`/`ComputerGameScreen.tsx` üzerinde yaptığım HİÇBİR değişiklik bu beş rotanın
sayısını KIPIRDATMADI (baytlar öncesi/sonrası aynı) — çünkü sızıntı onların üzerinden GELMİYOR.

**Gerçek zincir (kaynak okumayla doğrulandı):**

```
/giris, /kayit, /  (TESTID için)  ─┐
/oda/[kod] (WS istemcisi için)     ─┼─▶ @xox/shared (packages/shared/src/index.ts, `export *` barrel)
                                    │        │
                                    │        ▼
                                    │   room-client.ts  →  import { boardFromCells, evaluateStatus } from '@xox/game-core'
                                    │        │                (ANA barrel — alt yol DEĞİL)
                                    │        ▼
                                    └─▶  @xox/game-core (packages/game-core/src/index.ts)
                                             │
                                             ▼
                                   export { bestMove, chooseMove } from './ai'  (KOŞULSUZ)
```

`packages/shared/src/room-client.ts` (WS durumunu yorumlayan istemci reducer'ı, `/oda/[kod]`'ın
`RoomScreen.tsx`'i tarafından kullanılıyor) `@xox/game-core`'un ANA barrel'ını içe aktarıyor.
`packages/shared/src/index.ts` da kendisi tek-dosya bir `export *` barrel'ı (11 dosya, TESTID
DAHİL) — yani `TESTID` gibi küçücük bir sabit için `@xox/shared`'a dokunan HER rota (`/giris`,
`/kayit`, `/`) `room-client.ts`'i de, dolayısıyla TÜM `@xox/game-core`'u (minimax dahil) da
beraberinde çekiyor. Bu, Teşhis 1'de kanıtlanan "modül bazlı, export bazlı DEĞİL" paylaşım
davranışının AYNISI — yalnız `@xox/game-core` içinde değil, `@xox/shared` ile `@xox/game-core`
arasında bir kez daha oluyor.

**Neden bu kartta düzeltilemez:** İki dokunulması gereken dosya da bu kartın kapsamı dışında:

- `packages/game-core/src/index.ts` — **açıkça yasak** ("Dokunma" listesi: "B1'de CORE-CFG-001
  orayı baştan yazacak").
- `packages/shared/src/room-client.ts` ve `packages/shared/src/index.ts` — bu kartın çakışma
  kümesinde hiç yok (`packages/shared/**` hiçbir maddede geçmiyor); bu dosyalar TAMAMEN başka bir
  görev alanı.

Doğru düzeltme, `CORE-CFG-001` (B1) `game-core`'u gerçekten ayrık alt modüllere böldükten SONRA,
`room-client.ts`'in `evaluateStatus`/`boardFromCells`'i minimax'a hiç değmeyen bir alt yoldan
(`@xox/game-core/core` gibi) çekmesi VE `packages/shared/src/index.ts`'in kendisinin de aynı
barrel hastalığından (tek dosya `export *`) kurtarılmasıdır — bu ikisi birlikte olmadan `@xox/
game-core/ai`'ı `game-engine.ts`'te ne kadar izole edersem edeyim, `room-client.ts` zinciri
aynı sızıntıyı bağımsız olarak üretmeye devam eder (nitekim ürettiği ÖLÇÜLDÜ: bu kart boyunca
298 132 bayt hiç kıpırdamadı).

**Sonuç — kart tanımının izin verdiği kapanış yolu kullanıldı:** "MÜMKÜN DEĞİL diyorsan gerekçesini
yaz." Bu ikinci sızıntı için gerekçe yukarıda; **yeni bir takip kartı** öneriyorum (aşağıya bkz.).

## CORE-AI-001 için kritik uyarı

`/oyna/bilgisayar`'ın kendi payı artık büyümeyecek olsa da, **Teşhis 2'nin zinciri yüzünden
`ai.ts`'ye eklenecek her yeni satır (alfa-beta, iteratif derinleştirme, sezgisel değerlendirme)
`/`, `/giris`, `/kayit`, `/oda/[kod]`, `/oda/katil`'in paylaşılan 298 kB'lık parçasına da
YAZILACAK** — çünkü `room-client.ts` hâlâ ANA barrel'ı statik olarak çekiyor. Yani "heavy" grubun
235 kB bütçesi, tam da CORE-AI-001'in büyüteceği koddan etkilenmeye DEVAM EDİYOR. Bu kart bu riski
`/oyna/bilgisayar` için ortadan kaldırdı ama "heavy" beşli için KALDIRAMADI — `CORE-AI-001`
başlamadan önce takip kartının (aşağıda) çözülmesi güçlü şekilde önerilir.

## Bütçe güncellemesi (`.size-limit.mjs`)

| Grup                                                                 | Eski bütçe | Yeni bütçe | Gerekçe                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ---------: | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "heavy": `/`, `/giris`, `/kayit`, `/oda/[kod]`, `/oda/katil`         |     235 kB |     235 kB | **DEĞİŞMEDİ, kasıtlı** — en ağır ölçülen değer 214.65 → 214.79 kB (gürültü içinde), sızıntı BU rotalar için kalkmadı (Teşhis 2), bütçeyi düşürmek yanlış bir "düzeldi" sinyali verirdi. |
| "light": `/profil`, `/_not-found`, **`/oyna/bilgisayar`** (YENİ üye) |     155 kB |     158 kB | En ağır üye artık `/oyna/bilgisayar` (143.75 kB, önceden bu grupta değildi) + ~%10 büyüme payı → 158 kB. `/oyna/bilgisayar` "heavy" grubundan ÇIKARILDI.                                |

Metodoloji PERF-002 ile birebir aynı (grup içindeki en ağır ÖLÇÜLEN üye + ~%9-10 büyüme payı,
mevcut değere göre DEĞİL).

## Önerilen takip kartı

**PERF-004 (öneri)** — `packages/shared/src/room-client.ts`'in `@xox/game-core` ANA barrel yerine
minimax'a değmeyen bir alt yoldan içe aktarım yapması + `packages/shared/src/index.ts`'in tek
dosya `export *` barrel yapısının gözden geçirilmesi. **Sert ön koşul:** `CORE-CFG-001` (B1)
önce `game-core`'u ayrık alt modüllere bölmeli (bu kartın `./ai` alt yol export'u ilk adım
olarak `packages/game-core/package.json`'da zaten duruyor, `CORE-CFG-001` üzerine inşa edebilir).
Çakışma kümesi: `packages/shared/**` (bu PERF-003'ün DIŞINDA).

## `network-graph.test.ts` güncellemesi

`ALLOWED_BARE_SPECIFIER_PATTERNS`'e `@xox/shared`'ın zaten sahip olduğu kalıbın AYNISI eklendi:
`/^@xox\/game-core\/.*$/` — `@xox/game-core/ai` artık grafikte bareSpecifier olarak görünüyor
(`ComputerGameInner.tsx` → `game-engine.ts` → `@xox/game-core/ai` zinciri, hem dinamik `import()`
hem de bu alt zincirdeki statik import üzerinden). Allowlist mantığı DEĞİŞMEDİ — yalnızca yeni,
meşru bir alt yol izinli kümeye eklendi. Test dosyasının kendisi bu kartın çakışma kümesinde
(`apps/web/components/computer/**`).

## Doğrulama

- `pnpm --filter @xox/web typecheck` — ✅ temiz
- `pnpm --filter @xox/web test` — ✅ 57/57 dosya, 583/583 test (ComputerGameScreen.test.tsx
  `next/dynamic`'in eşzamansız ilk render'ını beklemek için güncellendi: `renderScreen()`
  yardımcı fonksiyonu artık `screen.findByTestId` ile GERÇEK zamanlayıcılarla bekliyor, sahte
  zamanlayıcılar (`vi.useFakeTimers()`) yalnız bundan SONRA kuruluyor)
- `pnpm --filter @xox/web lint` — ✅ temiz
- `pnpm gates` (kök) — ✅ typecheck + lint + format:check + test:coverage (@xox/web 94.97%
  ifade kapsamı, @xox/db 95.11%) + knip, hepsi yeşil, gerçek hata YOK (yalnız bilgilendirme
  hint'leri)
- `pnpm exec size-limit` (build sonrası) — ✅ 8/8 rota bütçe altında (tablo yukarıda)
- `network-graph.test.ts` (10 test, KK-027 allowlist + kural-4 guard'lar dahil) — ✅ hepsi geçti

## Dosyalar

- `packages/game-core/package.json` — `./ai` alt yol export'u eklendi (kaynağa DOKUNULMADI)
- `apps/web/components/computer/game-engine.ts` — `chooseMove` importu `@xox/game-core/ai`'dan
- `apps/web/components/computer/ComputerGameScreen.tsx` — ince `next/dynamic` sarmalayıcıya
  indirgendi
- `apps/web/components/computer/ComputerGameInner.tsx` — YENİ, eski `ComputerGameScreen`'in
  gövdesi (değişmedi, yalnız taşındı)
- `apps/web/components/computer/ComputerGameScreen.test.tsx` — eşzamansız ilk render'ı bekleyecek
  şekilde güncellendi
- `apps/web/components/computer/network-graph.test.ts` — allowlist'e `@xox/game-core/*` eklendi
- `.size-limit.mjs` — bütçeler yeniden türetildi (yukarıya bkz.)

Merge/push yapılmadı (kart talimatı).
