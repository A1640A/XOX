# ADR-0018 — Yayın sırası, sürüm eğriliği ve geri alma: operasyonel anlaşma yerine teknik kontrol

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi (bir doğrulama adımı bekliyor)
- **İlgili:** KK-B40 · E-08 · spec §9 AS-B02
- **Öncelik:** P0 — canlı kullanıcıyı etkileyen tek risk sınıfı

## Bağlam

Spec KK-B40 / E-08 şunu söylüyor: güncellenmemiş bir istemci 11×11 odaya bağlanırsa
`boardSchema` ihlali `INVALID_MESSAGE` sayılır, 3 ihlalden sonra bağlantı 4400 ile kapanır;
bu **kabul edilen** davranıştır. Azaltma olarak da _"web ve mobil aynı sürümde yayınlanır"_
şartı yazılmış.

Analistin haklı itirazı: bu bir **operasyonel bağımlılıktır, teknik kontrol değildir.**
"Aynı anda yayınlayacağız" bir niyet beyanıdır; ne CI'da denetlenir ne de bir gece koşusunda
hatırlanır.

Kod okunduğunda tablo tahmin edilenden farklı çıktı:

| Varsayım                                 | Gerçek                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobil istemci var ve odaya girebiliyor   | ❌ `apps/mobile` **yalnız statik bir ana sayfa** içeriyor (`app/index.tsx` + `app/_layout.tsx` + `messages/tr.ts`). Oyun ekranı, WS istemcisi, oda akışı **yok**. Mobil paritesi `W2-03` kartında ve hâlâ `todo`.                                                                   |
| Eski bir istemci 11×11 odaya girebilir   | Yalnız **zaten açık bir sekme** üzerinden. 11×11 odayı ancak **yeni** istemci kurabilir (eski istemcide seçici yok, gövdesiz `POST /api/rooms` `{3,3}` üretir) ve oda konfigürasyonu kurulduktan sonra **değişmez** (KK-B19). Yani bir sekmenin kendi odası asla 11×11'e dönüşemez. |
| Yeni bir odaya girmek eski JS ile mümkün | `/oda/<KOD>`'a gitmek bir gezinmedir; Next.js istemci-tarafı gezinmede dağıtım kimliği uyuşmazlığını yanıt başlığından (`x-nextjs-deployment-id`) tespit edip **tam sayfa yenilemeye** düşer.                                                                                       |

## Karar

### 1. Sürüm eğriliği çerçeve katmanında kapatılır — dört savunma hattı

**Hat 1 — Yapısal (bedava, zaten var).** Oda konfigürasyonu oluşturulurken yazılır ve
değişmez. Bir istemcinin oturduğu oda, ayağının altında 11×11'e dönüşemez.

**Hat 2 — Dağıtım kimliği uyuşmazlığında zorunlu tam yenileme.**
Next.js `deploymentId` ayarlıyken istemci, kendi dağıtım kimliğiyle sunucununkinin
uyuşmadığını yanıt başlığından anlar ve istemci-tarafı gezinme yerine **hard navigation**
yapar. Vercel Skew Protection açıksa bu davranış çerçeve tarafından zaten kuruludur
(Next.js ≥ 14.1.4 + Vercel'de build → ek konfigürasyon gerekmez; belge doğrulandı,
2026-07-15 sürümü).

> **Doğrulanacak (kart görevi, tahmin edilmeyecek):** Skew Protection **Pro ve Enterprise**
> takımlar içindir. Bu projenin planı bu ADR yazılırken doğrulanmadı (`maxDuration: "max"`
> tercihi de tam bu belirsizlik yüzünden yapılmıştı).
> **Mekanik sonda:** `VERCEL_SKEW_PROTECTION_ENABLED === '1'` ve `VERCEL_DEPLOYMENT_ID`
> varlığı `GET /api/health` yanıtına **boolean olarak** eklenir (değer sızdırılmaz).
> Sonuç `0`/yoksa: `apps/web/next.config.ts`'e
> `deploymentId: process.env.VERCEL_DEPLOYMENT_ID` **elle** yazılır — Vercel tarafında
> yönlendirme sabitlenmese bile uyuşmazlık tespiti ve zorunlu tam yenileme çalışır, ki
> bizim ihtiyacımız tam olarak budur (eski istemciyi **pinlemek** değil, **yenilemeye
> zorlamak**).

**Hat 3 — Yetenek kapısı: mobil, hazır olana kadar hiçbir odaya giremez.**
`apps/mobile` bugün oda akışı içermiyor. `W2-03` (mobil paritesi) `CTR-BOARD-001`'e
**bağımlı** ilan edilir: mobil tahta **genişlemiş protokole karşı** yazılır, dar protokole
karşı yazılıp sonra genişletilmez. Böylece "eski mobil × yeni oda" durumu **hiç var olmaz**.

**Hat 4 — Gürültülü başarısızlık (KK-B40).** Yukarıdaki üçü de kaçırırsa `boardSchema`
ihlali → 3 × `INVALID_MESSAGE` → `4400`. Sessiz bozuk tahtadan iyidir. Bu **son çaredir**,
birincil azaltma değildir.

### 2. Yayın sırası: özellik **tek bir kartta** görünür olur

Bölümleme, kullanıcıya görünen değişikliği bilinçli olarak **en sona** koyar:

```
B0…B3   motor, protokol, kalıcılık, tahta bileşeni   → kullanıcıya GÖRÜNMEZ (her şey {3,3})
B4      UI-CFG-001: boyut/K seçicisi                 → ÖZELLİK BURADA YAYINLANIR
B5…B6   bilgisayar ekranı, performans, E2E
```

B0–B3 merge edildikçe `main` her dalgada **yayınlanabilir** kalır ve davranış bit düzeyinde
değişmez: bütün konfigürasyon parametreleri `DEFAULT_BOARD_CONFIG` varsayılanıyla geçer,
`POST /api/rooms` gövde okumaya başlasa bile hiçbir istemci gövde göndermez.

Sonuç: **"yayın penceresi" diye bir şey yok.** Yayın, tek bir kartın merge'üdür.

### 3. Geri alma — üç kademe, hiçbiri veri onarımı gerektirmez

| Kademe                    | Eylem                                                  | Etki                                                                                                                                                                                          | Süre      |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **1. Kill switch**        | `XOX_ENABLED_BOARD_SIZES=3` ortam değişkeni + redeploy | Yeni 6×6/11×11 odası kurulamaz (`POST /api/rooms` → 400 `INVALID_BOARD_CONFIG`), seçici yalnız 3×3 gösterir. **Mevcut 6×6/11×11 odaları oynanmaya devam eder** ve TTL ile ≤ 2 saatte boşalır. | dakikalar |
| **2. Tek kart geri alma** | `git revert UI-CFG-001`                                | Seçici tamamen kalkar; motor/protokol/kalıcılık genişlemesi yerinde kalır ve zararsızdır (kimse konfigürasyon göndermiyor).                                                                   | ~10 dk    |
| **3. Tam geri alma**      | Bütün özellik kartlarının revert'ü                     | `packages/shared` daralır → **kaçınılmalı**. Yalnız protokolün kendisi bozuksa.                                                                                                               | saatler   |

**Kill switch'in kuralları:**

- Yeri **yalnız `apps/web`**: `apps/web/lib/game/enabled-sizes.ts`. `game-core`'a, `shared`'a
  ya da `db`'ye **girmez** — kural motoru bir ortam değişkenine bakmaz, `BOARD_MODES`
  daralmaz. Bu, "izinli boyutlar" (kural) ile "bugün sunulan boyutlar" (operasyon) ayrımıdır.
- İki tüketicisi vardır ve **ikisi de aynı fonksiyonu çağırır**: `POST /api/rooms`
  doğrulaması ve seçicinin seçenek listesi. İkinci bir kopya yazılmaz.
- Ayarlanmamışsa varsayılan `3,6,11`'dir (yani kapalı kalma riski yok).
- **Geriye dönük daraltma yapmaz:** kapatılan bir boyutla **kurulmuş** odalar oynanabilir
  kalır. Aksi hâlde oyunun ortasında oyuncular dışlanırdı.

### 4. Veri tarafı geri alınabilir — çünkü hiç göç yok

`rooms` ve `games` alanları **opsiyoneldir**, geri dolum betiği **yoktur** (ADR-0014).
Yani kod geri alındığında veritabanında onarılacak hiçbir şey kalmaz: `size`/`winLength`
taşıyan dokümanlar eski kodda basitçe **yok sayılır**. `rooms` zaten TTL ile 2 saatte
boşalır. Bu, geri almanın en pahalı kısmını (veri onarımı) **sıfıra** indirir.

### 5. AS-B02 (mobilde 121 basılabilir eleman) için kabul edilebilir çıkış korunur

Mobil ölçüm başarısız olursa 11×11 **mobilde gizlenir**, webde yayınlanır. Bu, kill
switch'in mobil karşılığıdır ve `W2-03`'ün kararıdır — bu özelliğin kartlarını bloklamaz.

### 6. E2E üretime karşı KOŞTURULMAZ

`OPS-007` nöbetçi kartı ve `CI-004`'ün allowlist düzeltmesi yürürlüktedir. Yeni E2E kartı
11×11 odalar kuruyor; guard gevşetilmez. Bu, ADR'nin bir kararı değil, **hatırlatmasıdır**.

## Gerekçe

- **Neden operasyonel anlaşma yetmez:** "aynı anda yayınlarız" bir gece koşusunda kimsenin
  denetlemediği bir cümledir. Hat 1–3'ün üçü de ya zaten var (yapısal), ya çerçeve
  tarafından sağlanıyor (skew), ya da bir kart bağımlılığıyla (W2-03 → CTR-BOARD-001)
  board'da mekanik olarak duruyor.
- **Neden `deploymentId` "pinlemek" değil "yenilemeye zorlamak" için:** bizim istediğimiz
  eski istemcinin eski sunucuda kalması **değil** — eski istemcinin **ölmesi**. Belge bunu
  açıkça yazıyor: dağıtım kimliği uyuşmazlığında istemci tam sayfa yenilemeye düşer.
  Uzun ömürlü oturumları pinleyen `__vdpl` çerezi bizim için **yanlış** araçtır.
- **Neden kill switch `game-core`'da değil:** `BOARD_MODES` bir **kuraldır** ve testleri
  çıplak sayılarla `3, 6, 11` yazıyor (KK-B01). Ortam değişkeniyle daralan bir kural,
  o testleri ortama bağımlı ve flake yapardı. Operasyonel kapı ürün katmanındadır.
- **Neden geriye dönük daraltma yok:** oyunun ortasında oyuncuyu dışlamak, KK-B52'nin
  ("oyuncu katıldığı bir oyundan asla dışlanmaz") ruhuna aykırı; ayrıca TTL 2 saatte zaten
  temizliyor.

## Reddedilen alternatifler

| Alternatif                                                                                   | Neden reddedildi                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yalnız "web ve mobil aynı sürümde yayınlanır" operasyonel şartına güvenmek                   | Denetlenemez, hatırlanamaz, CI'da kapısı yok. Analistin haklı itirazı.                                                                                                                                          |
| Protokolde sürüm alanı taşımak (`protocolVersion`) ve sunucunun eski istemciye 3×3 uydurması | İki protokol sürümünü aynı anda desteklemek demek: `state` mesajının iki şekli, iki test matrisi, ve "eski istemciye ne gösterelim" sorusuna cevabı olmayan bir 11×11 odası. Spec §8 bunu kapsam dışı bıraktı.  |
| `__vdpl` çereziyle uzun ömürlü oturumları eski dağıtıma pinlemek                             | Tam ters yön: eski istemciyi hayatta tutar. Bizim istediğimiz yenilenmesi. Ayrıca dağıtım silinirse yönlendirme kırılır.                                                                                        |
| Genel bir özellik bayrağı (feature flag) altyapısı kurmak                                    | Tek bir açma/kapama için yeni bir vendor/altyapı katmanı; `decisions.md`'nin "ek vendor ve ek anahtar yok" çizgisine aykırı. Tek amaçlı bir ortam değişkeni yeterli.                                            |
| Kill switch'i `packages/shared`'a koymak                                                     | `shared` bu özellikten sonra **yeniden donuyor** (ADR-0015); operasyonel bir anahtarı oraya koymak pencereyi kalıcı olarak açık tutardı. Ayrıca `apps/e2e` de onu import eder ve testler ortama bağımlı olurdu. |
| Kapatılan boyutla kurulmuş odaları da kapatmak                                               | Oyunun ortasında oyuncuyu dışlar; TTL 2 saatte zaten temizliyor.                                                                                                                                                |
| `rooms` için geri dolum + geri alma betiği yazmak                                            | Göç yok, geri alınacak veri yok (ADR-0014). Betik yazmak, olmayan bir sorunu üretim yazma riskiyle çözmek olurdu.                                                                                               |

## Sonuçlar

- ✅ E-08 senaryosu **birincil olarak yapısal ve çerçeve düzeyinde** kapanır; 4400 üçüncü
  savunma hattına iner.
- ✅ Geri alma veri onarımı gerektirmez; en hızlı kademe bir ortam değişkenidir.
- ✅ `main` her dalgada yayınlanabilir kalır; özellik tek bir kartın merge'üyle canlanır.
- ⚠️ **Açık doğrulama:** Skew Protection'ın bu projede etkin olup olmadığı ölçülmedi.
  `ROLLOUT-BOARD-001` kartının ilk kabul kriteri bu ölçümdür; sonuç `0` ise `next.config.ts`'e
  `deploymentId` elle yazılır. Ölçüm yapılmadan "korunuyoruz" **denmeyecek**
  (gotcha örüntü 1: kural yazılmış ama ateşlenmiyor).
- ⚠️ `apps/web/next.config.ts` `PERF-003`'ün de çakışma kümesinde. İki kart aynı dalgada
  olamaz; `deploymentId` satırı `PERF-003`'ten sonraki bir dalgada yazılır.
- 📌 Kalıcı kural: bir azaltma "şunu yapmayı unutmayacağız" biçiminde yazılıyorsa, o bir
  azaltma değil bir dilektir. Board'a bir bağımlılık ya da CI'a bir kapı olarak çevrilir.
