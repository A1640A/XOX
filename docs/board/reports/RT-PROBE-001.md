```yaml
task: RT-PROBE-001
status: done
summary: >
  `GET /api/health/realtime` yazıldı ve gerçek preview deploy'unda gerçek Atlas'a
  karşı koşturuldu. Sonda TEK change stream açar (`Room.watch`, pipeline yalnız
  `operationType` üzerinde `$match`), N kez `rooms` dokümanına yazar ve her yazma
  için change stream olayının gelişine kadar geçen süreyi ölçer, sonra odayı siler
  ve stream'i kapatır. Preview üzerinde 5 koşu / toplam 200 örnek: **p50 = 96.2 ms,
  p95 = 98.6 ms, maks = 633.6 ms (tek soğuk-instance örneği; ısınmış havuzda
  maks = 112.4 ms)**. KK-040 bütçesi 1500 ms; p95 bütçenin **%6.6**'sı.
  **ADR-0002 doğrulandı.**
  Ölçüm sırasında ADR-0002'nin uygulanmasını doğrudan etkileyen iki tuzak
  bulundu: (1) `Model.watch()` tipte `mongodb.ChangeStream` döner ama çalışma
  anında mongoose'un kendi sarmalayıcısını verir — `resumeToken` alanı YOKTUR ve
  sessizce `undefined`'dır; ADR-0002'nin `startAfter: resumeToken` yeniden
  bağlanma tasarımı bu hâliyle SESSİZCE çalışmaz. (2) `apps/web/vercel.json`
  içindeki `regions: ["fra1"]` pini yürürlükte değil — fonksiyonlar `iad1`'de
  koştu, yani ölçülen sayı hedef mimariden daha KÖTÜMSER bir üst sınırdır.
files_changed:
  - apps/web/app/api/health/realtime/route.ts
  - apps/web/app/api/health/realtime/route.test.ts
  - docs/board/reports/RT-PROBE-001.md
tests:
  {
    added: 16,
    passing: 19,
    coverage: 'web: st 92.66% / br 80.35% / fn 92.59% / ln 99.24% (eşik 70/65/70/70)',
  }
gates: 'pnpm gates → exit 0 (typecheck · lint · format:check · test:coverage · knip)'
```

---

## 1. Ölçüm — gerçek preview, gerçek Atlas

| Alan               | Değer                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| Preview URL        | `https://xox-3dbogs9c6-izrandevu.vercel.app`                                     |
| Deployment         | `dpl_3uC3D2f1N97Cq6yZycTCPEJS4BBQ` · target `preview` · READY                    |
| Fonksiyon bölgesi  | **`iad1`** (`vercel inspect` çıktısı) — `apps/web/vercel.json`'daki `fra1` DEĞİL |
| Veritabanı         | `xox_test` (yanıttaki `db` alanı ile doğrulandı)                                 |
| Uç nokta           | `GET /api/health/realtime?samples=N`                                             |
| Ölçüm anı          | 2026-08-24 17:08–17:10 UTC                                                       |
| Açık change stream | **1** (`peakOpenStreams: 1`, `openStreamsAfterClose: 0` — her koşuda)            |
| Sansürlü örnek     | **0** (hiçbir olay zaman aşımına uğramadı)                                       |

### 1.1 Koşu koşu (ham, hiçbiri atılmadı)

| #       | N       | p50      | p90  | p95       | p99   | maks      | min  | ort   | ısınma | `ready` | sansür |
| ------- | ------- | -------- | ---- | --------- | ----- | --------- | ---- | ----- | ------ | ------- | ------ |
| 1 soğuk | 25      | 96.9     | 98.3 | 100.0     | 633.6 | **633.6** | 95.9 | 118.5 | 499.4  | 6.9     | 0      |
| 2       | 25      | 95.9     | 105  | **108.5** | 112.4 | 112.4     | 95.4 | 97.5  | 187.1  | 1.2     | 0      |
| 3       | 25      | 96.1     | 97.0 | 97.1      | 97.3  | 97.3      | 95.6 | 96.2  | 185.7  | 0.7     | 0      |
| 4       | 25      | 95.7     | 96.9 | 97.3      | 99.1  | 99.1      | 95.2 | 96.1  | 186.4  | 0.7     | 0      |
| 5       | 100     | 96.2     | 97.5 | 98.4      | 109.8 | 110.2     | 95.7 | 96.9  | 187.0  | 88.4    | 0      |
| **HAV** | **200** | **96.2** | 97.5 | **98.6**  | 110.2 | **633.6** | 95.2 | 99.5  | —      | —       | **0**  |

Tüm değerler ms. "HAV" = beş koşunun havuzlanmış 200 örneği.
Isınmış havuz (koşu 2–5, N=175): p50 96.1 · p95 **98.6** · maks **112.4**.

Beş koşunun tamamı rapora girdi; hiçbir koşu seçilip diğerleri atılmadı.
Tek 633.6 ms'lik örnek, deploy'dan sonraki **ilk** isteğin ilk ölçüm turudur
(soğuk Fluid instance + soğuk Atlas bağlantı havuzu). Aynı koşunun kalan 24
örneği 95.9–100 ms bandındadır.

### 1.2 Karşılaştırma: yerel (İstanbul → Atlas)

`next dev`, `MONGODB_DB=xox_test`, N=25: p50 63.2 · p95 64.5 · maks 64.6 · ısınma 120.7.
Yerel sayı **kriter 4'ü karşılamaz**, yalnız kıyas için burada. Yerelin daha hızlı
olması Atlas kümesinin Avrupa'da, `iad1`'in ise ABD doğusunda olmasıyla tutarlı.

### 1.3 Yazma mı, fan-out mu?

Her örnek için yazma çağrısının kendi süresi de ölçüldü: preview'da
`writeP50Ms ≈ 95.8`, `writeP95Ms ≈ 98`. Yani **toplam gecikmenin neredeyse tamamı
tek bir Atlas gidiş-dönüşüdür**; change stream olayı yazma ack'i ile aynı anda
(çoğu örnekte birkaç yüz mikrosaniye içinde) geliyor. Oplog→dinleyici yayını
ölçülebilir bir ek maliyet getirmiyor. `iad1 → Atlas` RTT'si düşerse (bkz. §3.2
bölge bulgusu) toplam da aynı oranda düşer.

---

## 2. KARAR KAPISI

**p95 = 98.6 ms ≤ 1500 ms.**

> ## ADR-0002 doğrulandı — change stream fan-out KK-040 bütçesine sığıyor
>
> 200 örnekte p95 = 98.6 ms, bütçenin %6.6'sı. En kötü tek örnek (soğuk instance)
> 633.6 ms, o bile bütçenin %42'si. Sansürlü (zaman aşımına uğramış) örnek yok.
> Ölçüm, bölge pini yürürlükte olmadığı için hedef mimariden daha kötümser bir
> ortamda (`iad1`) alındı; `fra1` pini düzeltilirse sayı yalnız iyileşir.

### 2.1 Bu sayının ölçmediği şey — dürüstlük notu

Sonda **tek bir instance içinde** "yazma başlangıcı → kendi change stream'inde
olayın gelişi" süresini ölçer. ADR-0002 · R1 gereği yazan bağlantı da kendi
hamlesini change stream yankısıyla öğrendiğinden bu, **yazan oyuncunun** gördüğü
gecikmenin tam ölçüsüdür. **Rakip oyuncunun farklı bir Fluid instance'ında**
gördüğü gecikme bundan farklı olabilir: aradaki fark yalnız Atlas→ikinci instance
ağ bacağıdır (oplog olayı tüm dinleyicilere aynı anda gider). Bu bacağın ölçülmesi
iki uçlu bir test gerektirir ve `WS-001` + Dalga 0 E2E'sinin işidir; bu kart onu
kapsamıyor. Bütçeye göre marj (15×) bu belirsizliği fazlasıyla karşılıyor.

Ayrıca sonda **eşzamanlı yük altında** ölçmedi: tek stream, tek yazar. `rooms`
yazma hızı arttığında her instance'ın tüm yazmaları görmesi (ADR-0002'nin bilinçli
bedeli) CPU'ya yansır; ADR'deki ~50 yazma/sn eşiği bu kartla test edilmedi.

---

## 3. Bulgular — lead kararı gerektirenler

### 3.1 ⚠️ `Model.watch()` tipi YALAN SÖYLÜYOR: `resumeToken` yok (P1, WS-001'i etkiler)

`mongoose@9.9.3` tiplerinde:

```
watch<...>(pipeline?, options?): mongodb.ChangeStream<ResultType, ChangeType>
```

ama çalışma anında dönen nesne `mongoose/lib/cursor/changeStream.js` içindeki
mongoose'un **kendi `EventEmitter` sarmalayıcısıdır**. Sarmalayıcıda `resumeToken`
**getter'ı yoktur**; `driverChangeStream`, `closed`, `hasNext`, `next`, `close`
vardır. Sonuç: `stream.resumeToken` derlenir, lint'ten geçer ve **sessizce
`undefined` kalır**.

Bu tam olarak `gotchas.md`'deki "kural var görünür, hiçbir şey korumaz" biçimidir
ve doğrudan ADR-0002'yi vurur: ADR "kopmada `resumeToken` saklanır, `startAfter:
resumeToken` ile yeniden açılır" diyor. O kod yazıldığı gibi yazılırsa `startAfter`
her zaman `undefined` alır, stream **baştan** açılır ve kopma anındaki olaylar
sessizce kaybolur. Yakalanması zor: hata yok, tip hatası yok, test yeşil.

**Kanıt (preview yanıtı, her koşuda aynı):** `resumeTokenOnWrapper: false`,
`resumeTokenOnDriver: true`.

**Ne yapılmalı (WS-001):** token `stream.driverChangeStream.resumeToken`'dan
okunmalı, ya da `resumeTokenChanged` olayına abone olunup son token saklanmalı
(sarmalayıcı bu olayı sürücüden geçiriyor). İkincisi tercih edilmeli — sarmalayıcı
`driverChangeStream`'i bağlantı hazır olana kadar `null` tutuyor.

### 3.2 ⚠️ `regions: ["fra1"]` yürürlükte değil — fonksiyonlar `iad1`'de (P2, OPS)

`vercel inspect` çıktısı bütün λ'ları `[iad1]` gösteriyor. `apps/web/vercel.json`
`{"regions": ["fra1"]}` içeriyor ama Vercel projesinin Root Directory ayarı repo
kökü (build `/vercel/path0`'da turbo ile koşuyor), dolayısıyla **`apps/web/vercel.json`
hiç okunmuyor**. Atlas Avrupa'daysa bu, her hamleye ~80 ms armağan ediyor.

`vercel.json`/proje ayarları benim çakışma kümemin dışında — **dokunmadım**.
OPS kartına düşmeli.

### 3.3 turbo.json ortam değişkeni uyarısı (P3, OPS)

Build çıktısı: `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET` "set on your Vercel
project, but missing from turbo.json". Çalışma anında sorun çıkarmadı (`/api/health`
ve sonda `xox_test`'e bağlandı) çünkü bunlar runtime değişkenleri; ama build
zamanında bu değişkenlere ihtiyaç duyan bir kod eklenirse sessizce `undefined`
görecek. `turbo.json` benim kümemde değil.

### 3.4 `next dev` repoyu kirletiyor: `apps/web/{AGENTS,CLAUDE}.md` (P3)

Next 16 `dev`/`build` sırasında "Generated AGENTS.md and CLAUDE.md for AI agents"
diyerek `apps/web/` altına iki dosya yazıyor ve `next-env.d.ts`'i değiştiriyor.
Worktree'yi kirletir, `format:check`'i tetikleyebilir. Elle sildim.
Kalıcı çözüm `next.config.ts`'te `agentRules: false` ya da `.gitignore` —
ikisi de benim kümemin dışında.

---

## 4. Tasarım kararları (bu kartta verildiler)

```yaml
decisions:
  - karar: >
      Sonda TEK change stream açar, `openStreams`/`peakOpenStreams` modül kapsamı
      sayaçlarıyla bunu ölçülebilir kılar ve `probeRunning` kilidiyle eşzamanlı
      ikinci çağrıyı 409 ile reddeder (ikinci stream açılmaz). Stream `finally`
      bloğunda kapatılır — hata yolunda bile.
    gerekçe: >
      ADR-0002 · Z1: her açık change stream havuzdan bir bağlantıyı `getMore` ile
      tutar; `maxPoolSize: 10`. Sızdırılan bir stream sonraki deploy'un bağlantı
      bulamamasına yol açar (Atlas M0). Sayaçlar yanıtta raporlanır, böylece
      değişmez her koşuda kanıtlanır — "yazılmış ama çalışmıyor" durumu görünür olur.
    reddedilen_alternatif: >
      Sayaç tutmadan yalnız `close()` çağırmak — testte de raporda da doğrulanamaz.
      Testler bunun gerçekten ısırdığını mutasyonla kanıtladı (bkz. §5).

  - karar: >
      Pipeline YALNIZ `operationType` üzerinde `$match` yapar; oda kodu filtresi
      süreç içinde (`waiters.get(doc.version)` + `doc.code !== code` kontrolü).
    gerekçe: >
      ADR-0002 ve gotchas: `fullDocument.*` üzerinde `$match` + `updateLookup`
      birleşimi "Resume Token Not Found" hata sınıfını açar. Sonda üretim
      RoomHub'ıyla aynı filtreleme biçimini kullanmalı ki ölçtüğü şey gerçekten
      üretim yolunun gecikmesi olsun.
    reddedilen_alternatif: >
      `'fullDocument.code': code` ile sunucu tarafı filtre — daha az olay taşırdı
      ama ölçülen yolu üretimden farklılaştırır ve yasak tuzağa girer.

  - karar: >
      Hazır-olma sinyali olarak mongoose'un tiplerde bulunmayan `ready` olayı
      kullanıldı; `resumeToken` yoklaması TERK EDİLDİ.
    gerekçe: >
      İlk uygulama `stream.resumeToken !== undefined` yoklaması yapıyordu; gerçek
      Atlas'a karşı ilk koşuda `streamReady: false` ve `streamReadyMs: 8020` çıktı —
      yani 8 saniye boş beklendi ve sinyal HİÇ gelmedi (§3.1). mongoose sarmalayıcısı
      `ready`'yi bilerek `setImmediate` ile geciktiriyor ("so the stream pump has a
      chance to run and the driver cursor initializes before 'ready' resolves") —
      yani tam olarak aradığımız garantiyi veren sinyal bu. Düzeltmeden sonra
      `streamReadyMs` 0.7–88 ms'e düştü.
    reddedilen_alternatif: >
      `tryNext()`/`next()` iterator API'siyle ilerlemek — mongodb sürücüsü emitter
      ve iterator kullanımını aynı stream'de yasaklıyor; ayrıca iterator modunda
      olaylar arasında `getMore` uçuşta olmadığı için ölçüm üretimdeki emitter
      yolundan bir RTT kötümser çıkardı. Üretim (RoomHub) emitter kullanacak,
      sonda da emitter kullanmalı.

  - karar: >
      Isınma turu (ilk `insert` + gerekirse 3 tekrar) ölçüme DAHİL EDİLMEDİ; ayrı
      `warmupMs`/`warmupAttempts` alanları olarak raporlanıyor.
    gerekçe: >
      Isınma cursor kurulum maliyetini içerir ve instance ömründe bir kez ödenir;
      üretimde RoomHub stream'i onlarca hamle boyunca açık kalır, dolayısıyla
      KK-040'ı ilgilendiren sayı kararlı hâl gecikmesidir. Sayı gizlenmiyor:
      preview'da 185.7–499.4 ms olarak raporun içinde.
    reddedilen_alternatif: >
      Isınmayı örnek 1 olarak saymak — p95'i instance ömrü boyunca bir kez ödenen
      bir maliyetle kirletirdi. Tamamen atmak ise şeffaflığı bozardı.

  - karar: >
      Zaman aşımına uğrayan örnek atılmaz; `totalMs = eventTimeoutMs` ile
      (alt sınır olarak) havuza girer, `censoredSamples` sayısı ayrıca raporlanır
      ve `ok` alanı `false` olur.
    gerekçe: >
      Kaybolan bir olay ölçümün EN ÖNEMLİ sonucudur; onu diziden düşürmek p95'i
      güzelleştirir. Sansürlü gözlem olarak alt sınırla dahil etmek hem istatistiği
      korur hem okuru yanıltmaz. (Preview koşularında sansürlü örnek çıkmadı.)
    reddedilen_alternatif: >
      Zaman aşımını hata sayıp tüm koşuyu 503 yapmak — bir tek kayıp olay yüzünden
      19 iyi ölçüm çöpe giderdi.

  - karar: >
      `?samples=`, `?eventTimeoutMs=`, `?gapMs=` sorgu parametreleri eklendi;
      `samples` alt sınırı 20'de KİLİTLİ (kabul kriteri), üst sınır 100.
    gerekçe: >
      Kart "ölçüm gürültülüyse örnek sayısını artır" diyor; yeniden deploy etmeden
      N=100 koşabilmek bunu mümkün kıldı (koşu 5). Alt sınırın kodda kilitli olması
      birinin kazara N=3 ile "temiz" bir sayı üretmesini engeller.
    reddedilen_alternatif: >
      Sabit N — gürültü durumunda yeni deploy gerektirirdi ve testleri de yavaşlatırdı.

  - karar: >
      Sonda `apps/web/package.json`'a HİÇBİR bağımlılık eklemedi; change stream'e
      `@xox/db`'nin mevcut mongoose bağlantısı (`Room.watch`) üzerinden erişiliyor.
      `mongodb` tipleri hiç import edilmedi (olay `unknown` alınıp doğrulanıyor).
    gerekçe: >
      `apps/web/package.json` OPS-002'nin çakışma kümesinde; karta göre dokunulmadı.
      Ayrıca gotcha: `import type { X } from 'mongodb'` bile pnpm izole linker'da
      TS2307 verir. Yan fayda: ikinci bağlantı havuzu açılmıyor.
    reddedilen_alternatif: >
      `getMongoClient()` ile ham sürücü üzerinden `db.collection('rooms').watch()` —
      çalışırdı ama üretim RoomHub'ı mongoose modeli üzerinden gidecek; sonda üretim
      yoluyla aynı katmanı kullanmalı (nitekim §3.1'deki tuzak ancak böyle bulundu).
```

---

## 5. Testler — "kural var görünür, hiçbir şey korumaz"a karşı

19 test (3'ü mevcut `/api/health` testi). Testlerin gerçekten ısırdığı, koda
kasıtlı mutasyon enjekte edilerek doğrulandı:

| Enjekte edilen ihlal                                         | Kırılan testler                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| İkinci bir `Room.watch()` çağrısı eklendi                    | "TEK change stream açar…" · "eşzamanlı ikinci çağrı 409 alır…"        |
| İkinci stream'in pipeline'ına `'fullDocument.code'` filtresi | + "pipeline YALNIZ operationType üzerinde filtreler…" (üçü birden)    |
| `await stream.close()` satırı silindi                        | "TEK change stream açar…" · "sansürlü örnek…" · "hiç olay taşımazsa…" |

İlk denemede pipeline testi ikinci stream'i **görmüyordu** (yalnız `watchCalls[0]`
denetleniyordu); test, açılan **her** stream'i denetleyecek şekilde sertleştirildi.

Kapsanan davranışlar: production'da 404 (stream hiç açılmaz) · N≥20 dayatması ·
geçersiz parametrede varsayılana düşme · tek stream + kapanış · pipeline saflığı ·
oda dokümanının silinmesi · yabancı oda olayının ölçümü çözmemesi · sansürlü örnek ·
hiç olay gelmemesi (503) · `connectDb` hatası (503, stream açılmaz) · Error olmayan
hata (503) · eşzamanlılık kilidi (409) · `error` olayının bekleyenleri serbest
bırakması · `ready` gelmese de sondanın sürmesi · `resumeToken` sarmalayıcıda yok /
sürücüde var.

## 6. Temizlik

- Sonda her koşuda kendi oda dokümanını `deleteOne` ile siliyor.
- Koşulardan sonra `xox_test.rooms` sayımı doğrudan sürücüyle kontrol edildi:
  **0 doküman, 0 kalıntı.**
- Uç nokta `VERCEL_ENV === 'production'` iken `404` döner ve o dalda `Room.watch`
  **hiç çağrılmaz** (birim testiyle doğrulandı; preview yanıtı `env: "preview"`
  göstererek değişkenin gerçekten okunduğunu kanıtlıyor).
- Preview deploy'u ayakta bırakıldı (`xox-3dbogs9c6-izrandevu.vercel.app`) —
  lead isterse sayıyı kendi doğrulayabilir. `.claude/worktrees/RT-PROBE-001/.vercel`
  bağlantı klasörü silindi.

## 7. Sonraki adım önerileri (uygulanmadı — kararı lead verir)

1. **WS-001'e girdi:** `resumeToken`'ı `resumeTokenChanged` olayından sakla,
   `stream.resumeToken`'a GÜVENME (§3.1). Bu, ADR-0002'nin yeniden bağlanma
   maddesinin doğru uygulanması için ön koşul.
2. **OPS kartı:** `fra1` bölge pinini gerçekten yürürlüğe koy (§3.2) —
   ölçülen gecikmenin büyük kısmı bölge mesafesi.
3. **Dalga 0 E2E:** iki uçlu (farklı instance) fan-out gecikmesini ölç; bu kart
   yalnız yazan tarafı ölçtü (§2.1).
4. `next dev` artıklarını `.gitignore`'a ya da `agentRules: false`'a bağla (§3.4).
