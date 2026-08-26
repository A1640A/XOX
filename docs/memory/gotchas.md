# Tuzaklar

> Bir yaklaşımı denemeden ÖNCE burayı oku. Buradaki her satır, birinin zaman kaybetmesiyle öğrenildi.

## Tekrar eden örüntüler

Aşağıdaki altı örüntü, alttaki maddelerin çoğunu kapsar. Yeni bir sınıfta tuzağa düşmeden önce
önce burayı tara, sonra başlığı eşleşen maddeye in — 80+ maddeyi baştan sona okumak zorunda kalma.

**1. Kural yazılmış ama ateşlenmiyor** — statik kural (lint/boundary/hook) kodda duruyor, "yeşil"
görünüyor, ama gerçek bir ihlalde hiç çalışmıyor:
ESLint çözümleyicisi yanlışsa kurallar sessizce ölür · pnpm sembolik bağlantıları `boundaries`'i
öldürür · `boundaries` çözülemeyen import'ta sessiz kalır · `projectService: true` + kapsam dışı
dosya = kural hiç çalışmaz · ESLint `.css` dosyalarını hiç ayrıştırmaz · Vercel `functions`
anahtarı `app/` ile başlıyorsa hiç doğrulanmaz · Claude Code hook'larına mutlak `file_path`
verilir (göreli karşılaştırma sessizce ölür — aynı hastalık, hook için) · `Stop` hook'u "iş var
mı" değil "ŞİMDİ dispatch edilebilir mi" sormalı.

**2. Test yeşil ama hiçbir şey doğrulamıyor** — kaynak metni okuyan test · kendine-referanslı
beklenti (şemadan türetilmiş "doğru" listesi kendi silinmesini göremez) · özdeşlik iddiası
(`toStrictEqual(kendisiyle)`) · beklentiyi sabitten türetmek · eşiğin, değerin seçilme
gerekçesiyle aynı sayı olmaması · zod'un mutlu-yol `safeParse` testinin alan kaybını yakalamaması
· bağımlılığı TAMAMEN mock'layıp kendi mock'unu doğrulamak · bir testin hatalı davranışı
kilitlemesi (düzeltmeyle birlikte testin de değişmesi gerekip gerekmediğini sor).

**3. Tip doğru ama çalışma zamanı yalan söylüyor** — `Model.watch()` tipte `resumeToken` vaat
eder, çalışma zamanında yok · Auth.js `jwt` callback'i tipte `user`'ı zorunlu gösterir, çalışma
zamanında opsiyonel · `import.meta.dirname` daralması `@types/node` sürümüne bağlı · Mongoose
model cast'i `as X | undefined` yazılmazsa `?? fallback` ölü kod olur.

**4. Mekanizma var ama kimse çağırmıyor** — `ensureIndexes()` yalnız testten çağrılıyordu, gerçek
bir deploy adımı yoktu · `lefthook`/`unrs-resolver` postinstall'u onaylanmazsa git hook'ları hiç
kurulmaz, pre-commit kapıları sessizce devre dışı kalır.

**5. Vitest gizliyor, üretim kırık (ve tersi de olur)** — mongoose CJS + tsx ESM: testler yeşil,
gerçek CLI kırık · `next-auth`'un derlenmiş çıktısı Vitest'in native ESM yükleyicisinde hiç
import edilemez (environment fark etmez) · `jose` jsdom'un ayrı `Uint8Array` realm'inde patlar
ama gerçek Node çalışma zamanında sorun yok — iki yönde de "test ortamı = üretim" varsayımı yanlış.

**6. Kapı YANLIŞ KAPSAMI ölçüyor** — doğrulama koşuyor, yeşil dönüyor, ama ölçtüğü şey iddia
edilenle aynı değil: Turbo cache merge sonrası `pnpm gates`i **branch'in eski yeşilini** replay
eder, birleşmiş ağacı hiç çalıştırmaz · yerel `pnpm gates` yeşildi ama CI'da `MONGODB_URI` yok —
**yerel kapı CI'ın gerçeğini ölçmüyordu**, CI 5 saat kırmızı kaldı ve kimse `gh run list`
çalıştırmadı · Vercel'de her route ayrı fonksiyon/instance/modül kapsamı — `/api/health`'ten
`/api/rooms/[code]/ws`'in modül-içi singleton'ını okumaya çalışmak daima sıfır döner, "değişmez
korundu" gibi sahte bir güven verir. Ortak reçete: doğrulamayı ÖLÇTÜĞÜ İDDİA EDİLEN KAPSAMDA
(birleşmiş ağaç, CI runner'ının kendisi, aynı route/instance) koştur; başka bir yerden alınan
"yeşil" kanıt sayılmaz.

> **Nüans (örüntü 2'ye ek):** hayatta kalan bir mutant/kapsanmayan bir dal HER ZAMAN test
> boşluğu değildir — bazen dal GERÇEKTEN ulaşılamaz hâle gelmiştir (ör. bir alan artık başka bir
> yerde garanti ediliyor). Fark ettirici soru testin kırmızı olup olmaması değil, o dalın SESSİZ
> mi (hiçbir iz bırakmadan atlanıyor) yoksa GÜRÜLTÜLÜ mü (log/hata ile kendini ele veriyor)
> olduğu — W1-02'de `room-view.ts`'in üçüncü dalı ulaşılamaz hâle geldi ama bilerek bir
> `console.error` ile gürültülü bırakıldı, sessizce silinmedi.

## 2026-08-25 · ⚠️ Turbo cache merge sonrasi kapiyi SAHTE YESIL gosterir

Turbo cache ayni makinedeki worktree-ler arasinda PAYLASILIR. Merge-den sonra `pnpm gates`
kosuldugunda `@xox/db:typecheck` "cache hit" verip **branch worktree-sinde hesaplanmis** sonucu
replay etti — yani BIRLESMIS agacin typecheck-i hic calismadi. Tam da "branch-ler tek tek yesil,
birlesince kirmizi" sinifi buradan sizar: merge sonrasi kapi, branch-in eski yesilini gosterir.
**Yapilacak:** Merge sonrasi dogrulama `--force` ile kosulmali:
`pnpm exec turbo run typecheck --force` ve `... test:coverage --force`. Ciktida
`Cached: 0 cached` gormeden "yesil" deme. (Ornek 2026-08-25: 7/7 ve 5/5, 0 cached.)

## 2026-08-25 · LEAD DISIPLINI: mutasyon sondasi UYGULANDI MI diye kontrol et

Bu gece uc kez `perl -0pi` / `grep` kalibi tutmadi ve sonda SESSIZCE hicbir sey degistirmedi.
Sonuc yaniltici: "testler yesil kaldi" cikarimi yaptim, oysa mutasyon hic olusmamisti.
Bir kez de grep YORUM satirlarini eslestirip "tek darbogaz degil" diye yanlis bulgu urettim.
**Yapilacak:** Sondadan sonra `diff -q` ile dosyanin GERCEKTEN degistigini dogrula; degismediyse
"kalip tutmadi" de, "test yesil kaldi" DEME. Kod ararken yorumlari ele:
`grep -vE '^\s*(\*|//|/\*)' dosya | grep -c desen`.

## 2026-08-25 · ⚠️ Mongo aynı anahtara ikinci indeksi ADA BAKMAKSIZIN reddeder — "boşluksuz takas" ÇALIŞMAZ

Önce önerilen ("yeni indeksi farklı adla kur, başarılıysa eskisini düşür") fikir canlı Atlas'ta
DENENDİ ve reddedildi: `code 85, "Index already exists with a different name: email_1"`. Mongo
aynı anahtar üzerinde ikinci bir indeksi isim farkı gözetmeksizin reddediyor — bu bir öneriydi,
agent körlemesine uygulamak yerine canlıda sınadı ve yanlış çıktığını kanıtladı.
**Bunun yerine kurulu tasarım (SEC-003, `packages/db/src/indexes.ts` `createIndexSafely`):**
`unique` istenirken ÖNCE mükerrer değer taranır (ihlal varsa eski indekse hiç dokunulmaz,
anlaşılır hata döner); temizse düşür + kur; ikinci kurma da patlarsa eski indeks ORİJİNAL
seçenekleriyle geri kurulur — hiçbir an koleksiyon indekssiz kalmaz. Somut risk: `users.email_1`
benzersiz değilken ve mükerrer e-posta varken düşürülüp unique olarak yeniden KURULAMAZSA
(E11000), sonuç login lookup'ın COLLSCAN'e düşmesi VE benzersizliğin hâlâ olmamasıdır.
**Genel ders:** Talimat/öneri olsa bile canlıya karşı doğrulanmadan "doğru" sayılmaz.

## 2026-08-25 · ⚠️ `import.meta.dirname` daralması `@types/node` sürümüne bağlı — bu gece İKİ KEZ kırıldı

**Birinci oluş:** Temiz `pnpm install` ile bayat kurulum FARKLI `@types/node` çözebilir — aynı
lockfile, farklı sonuç: temiz kurulumda `load-env.ts` repo genelinde `no-unnecessary-condition`
ile kırıldı; bayat yerel kurulumda yeşildi. `main`'in kendi checkout'unda da üretildi, yani bir
dalın diffi değil ortam farkı.
**İkinci oluş:** Üç branch tek tek yeşildi; birleşip `pnpm install --lockfile-only` koşulunca
`@xox/db` typecheck kırıldı: `import.meta.dirname` TS'te `string | undefined` ve çözülen
`@types/node` sürümü değişince daralma kayboldu. Branch'lerde görülmez çünkü her biri kendi
lockfile durumunda kalır.
**Yapılacak:** Merge sonrası `pnpm install` + kapıları MUTLAKA yeniden koş (integrator görevi,
merge'in kendisi çakışmasız olsa bile). Tip daralması `@types/node` sürümüne bağlı olan yerlerde
savunmacı yaz: `import.meta.dirname` yerine
`import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))` — her sürümde çalışır.

## 2026-08-25 · Kisa omurlu bilet, KENDI YENILEME UCUNDA kabul edilirse sinirsiz olur

30 saniyelik WS bileti `resolveIdentity`-de her cagrida kabul ediliyordu — `/api/ws/ticket`-in
kendisinde de. Log-dan bilet calan biri 25 saniyede bir yenileyip zinciri SURESIZ uzatabiliyor,
ve bileti herhangi bir REST ucuna takabiliyor. "Kisa omurlu oldugu icin sizmasi onemsiz"
gerekcesi, bilet kendini yenileyebildigi anda cokuyor.
**Yapilacak:** Kaynak izni parametresi (`allowTicket`) — bilet yalnizca onu bekleyen uc noktada
gecerli olsun. Ve kisa omurlu bir sirri URL-de tasiyorsan, onu kapsamla (oda/kaynak claim-i) bagla.

## 2026-08-24 · Mongo indeks catismasi kodu 86, 85 DEGIL

Dokumanlar `IndexOptionsConflict` (85) der; canli Atlas mevcut ayni isimli farkli secenekli
indekste **86 `IndexKeySpecsConflict`** donduruyor. Yalniz 85 yakalanirsa hata disari sizar,
`ensureIndexes()` dongusu kirilir ve kalan indeksler hic kurulmaz.
**Yapilacak:** Ikisini de yakala. Ve bu tur kodlari dokumandan degil CANLI denemeden ogren.

## 2026-08-24 · `deployment_status` workflow-u guvenilmeyen HEDEFE sir gonderebilir

Bu olayda workflow dosyasi DEFAULT BRANCH-ten okunur ama deploy edilen KOD PR head-idir.
`environment_url` olay yukunden gelir. Yani bir PR, cagrilan uc noktanin kodunu yazar; workflow
ona gercek secret-i tasir. Fork PR-lari icin Vercel `gitForkProtection` bunu azaltir ama
collaborator/entegrasyon yolu acik kalir.
**Yapilacak:** CI-dan bir uc noktaya SIR GONDERME. Is zaten `MONGODB_URI`-ye sahipse islemi
runner-dan dogrudan kosur. Sir agdan hic gecmezse sinif tamamen yok olur.

## 2026-08-24 · ⚠️ mongoose CommonJS: tsx-in ESM yukleyicisi named export goremez

`import { Schema, model, models } from 'mongoose'` VITEST-TE CALISIR ama `tsx` ile kosulan
CLI betiginde `SyntaxError: The requested module 'mongoose' does not provide an export named
'models'` verir. Vite CJS interop-u farkli yaptigi icin birim testler bu kirikligi TAMAMEN GIZLER.
Belirti: `pnpm --filter @xox/db seed` duser ama testler yesildir — ve `e2e-preview.yml` seed
adimini cagirdigi icin her preview e2e kosusu bu adimda olur.
**Yapilacak:** `import mongoose from 'mongoose'` + `const { Schema, model, models } = mongoose`.
Tipler icin ayrica `import type { Model } from 'mongoose'`.

## 2026-08-24 · Test setup-i ile CLI ayni ortami yuklemeli

`.env.local` yuklemesi yalniz `vitest.setup.ts`-teydi; `seed`/`reset` CLI betikleri
`MONGODB_URI tanimli degil` ile dusuyordu. CI-da ortam degiskeni disaridan geldigi icin orada
calisiyor, yerelde kirik — yani kirikligi yalniz insan fark ediyor.
**Yapilacak:** Yukleyiciyi ayri bir modulde topla (`load-env.ts`) ve hem setup hem CLI ondan
cagirsin. Setup-taki `process.env['MONGODB_DB'] = 'xox_test'` zorlamasini SILME — indeks testi
guard-i onu bekliyor.

## 2026-08-24 · Python `split`/`index` fonksiyon ADINI ararken TANIMI bulur

Kod cikarirken `src.split("loadEnvLocal()")` ya da `s.index("loadEnvLocal()")` yazarsan ilk
eslesme `function loadEnvLocal(): void {` satiridir, CAGRI degil — govde ortadan kesilir ve
sessizce bozuk dosya uretilir. Bu gece iki kez oldu.
**Yapilacak:** Kod bloklarini regex ile sinir belirterek cikar (`re.search(r"function X.*?\n\}\n", s, re.S)`)
ya da dosyayi dogrudan yaz. Cikarim sonrasi `bash -n` / `tsc` ile MUTLAKA dogrula.

## 2026-08-24 · Bir TEST hatayi kilitleyebilir — yesil, davranisin dogru oldugunu gostermez

CTR-002-de `socket:open` reconnect sayacini sifirliyordu; bu, uygulama-seviyesi (4000-4999)
kapanislarin TAMAMI icin ustel geri cekilmeyi olduruyordu — cunku o kodlar tanim geregi
basarili el sikismadan SONRA gelir. Hatayi bir test acikca kilitliyordu:
"basarili baglanti sayaci sifirlar". Test yesildi, davranis yanlisti.
**Yapilacak:** Bir inceleme bulgusu duzeltilirken "hangi test bu yanlis davranisi bekliyordu?"
diye sor. Duzeltmeyle birlikte o testin de degismesi gerekiyorsa, bulgu gercektir.

## 2026-08-24 · Beklentiyi sabitten turetmek sabit degisikligine KOR yapar

`expect(delay).toBe(WS_RECONNECT_BASE_MS)` yarin sabit 60_000 olsa yine yesil kalir.
Test, degeri degil ILISKIYI dogruluyor — oysa amac degerin dogru olmasi.
**Yapilacak:** En az bir testte ciplak sayi yaz (400/500/600). Turetilmis testler ilave olsun,
tek kanit olmasin. Ayni sinif: enum uzunlugunu enum-un kendisinden saymak.

## 2026-08-24 · `select: false` `aggregate()`-i KAPSAMAZ — passwordHash sizar

Mongoose `select: false` yalniz query middleware yolunda calisir. Canli dogrulandi:
`User.aggregate([{$match:{_id}}])` ve `User.collection.findOne()` `passwordHash`-i DONDURUYOR.
`findById`/`findOneAndUpdate`/`JSON.stringify` temiz — yani tek yollu test yaniltici.
**Yapilacak:** `aggregate` kullanan her sorguya acik `$unset: 'passwordHash'` (ya da
`pre('aggregate')` hook-u ile varsayilan). Test `aggregate` yolunu da kapsamali.

## 2026-08-24 · `syncIndexes()` uretimdeki indeks catismasini MASKELER

Test `syncIndexes()` (drop + create) kullanirsa her zaman temiz sonuc verir. Uretim yolu
`createIndex`-tir ve ayni isimli farkli secenekli bir indeks varsa `IndexOptionsConflict`
atar; indeks ESKI haliyle kalir. Canli dogrulandi: `email_1` benzersiz-olmayan halde varken
`unique:true` eklemek sessizce basarisiz oluyor -> ayni e-postayla ikinci kayit acilabiliyor.
**Yapilacak:** Indeks testinde uretim yolunu taklit et; ayrica `ensureIndexes()`-i gercekten
cagiran bir deploy adimi olsun — repo genelinde tek cagiran test dosyasiysa indeksler
canlida HIC olusmuyor demektir.

## 2026-08-24 · Mongoose dokuman hook-u `updateOne`/`bulkWrite` ile ATLANIR

`pre('validate')` yalniz `doc.save()` ve `insertMany` yolunda calisir. `updateOne`,
`findOneAndUpdate`, `bulkWrite` onu tetiklemez. Canli dogrulandi: friendship-in `userA < userB`
sirali cift degismezi `updateOne(..., {upsert:true})` ile atlandi ve ayni cift icin iki
dokuman olustu.
**Yapilacak:** Degismezi yazma yoluna degil VERIYE bagla (tek giris kapisi yardimcisi) ya da
query hook-larini da ekle. Ve degismezi `updateOne` ile ihlal etmeyi DENEYEN bir test yaz.
**Yeni örnek (2026-08-25, W1-02):** `finishGame` de `findOneAndUpdate` kullandığı için
`Game`'in `pre('validate')` çapraz tutarlılık hook'u (isDraw⇒winner null vb.) burada da hiç
çalışmıyor — tutarlılık "yapı gereği" (tek doğrulanmış `TransportStatus`tan türetme) +
`runValidators: true` ile sağlanıyor, hook'a güvenilmiyor.

## 2026-08-24 · `Stop` hook-u "su an harekete gecemem" durumlarini modellemeli

Hook-un tek sorusu "yapilacak is var mi" olmamali; "LEAD SU AN bu isi dispatch edebilir mi"
olmali. Uc kez ayni sinif kusur cikti ve her biri bos dongu yaratti:

1. `in_wave` gorevleri "islenebilir" saymak — agent zaten calisiyor, lead yield edemez, dispatch
   edecek iş de yoktur, oturum boşa döner.
2. Kota beklerken bloklamak — dispatch imkansiz (`pausedUntil` eklendi).
3. Paralellik tavani dolu iken bloklamak — yeni agent acilamaz (`maxParallel` eklendi).
   **Yapilacak:** Hook durusa izin versin; `todo`/`review` isi VARSA **ve** kapasite VARSA
   **ve** duraklama YOKSA bloklasin. Bildirim mekanizmasi lead-i zaten geri cagiriyor.
   Kuru koşu bunu yakalayamaz — orada agent ön planda çalışır, gerçek arka plan dispatch'inde
   ortaya çıkar.

## 2026-08-24 · Worktree `.env.local`-i ALMAZ — Atlas-a kosan testler orada patlar

`git worktree add` yalnizca izlenen dosyalari getirir; `.env.local` gitignore-da oldugu icin
yeni worktree-de YOKTUR. Gercek Atlas-a kosan testler (packages/db) `MONGODB_URI tanimli degil`
ile duser ve agent bunu "veritabani erisilemez" diye yanlis teshis eder.
**Yapilacak:** Worktree acar acmaz `cp .env.local <worktree>/.env.local`. Lead-in dalga
kurulum adiminin parcasi olmali.

## 2026-08-24 · ⚠️ Kendine-referansli test SILMEYI goremez — beklenti disaridan gelmeli

Bir semanin alanlarini `schema.shape`-ten turetip "her alan zorunlu" testi yazarsan, o alan
semadan SILINDIGINDE onu dogrulayan test de yok olur. Kanit: `move:applied`-dan `version`
silindi -> 187 test YESIL, tek kirmizi yok.
Ayni acik `errorCodeSchema.options`-i kendi options-iyla karsilastiran her testte var:
"20 kod olmali" testi, listeyi semadan okuyorsa 19-a dustugunu fark etmez.
**Yapilacak:** IKI KATMAN kullan.

1. Turetilmis test (`.shape`-ten) — yeni alan/mesaj eklendiginde kapsam kendiliginden gelsin.
2. **Elle yazilmis beklenti tablosu** (tasarim dokumanindan kopyalanmis) — silme ve yeniden
   adlandirmayi yakalar. Beklenen deger daima test edilen seyin DISINDAN gelmeli.
   Sonda: bir alani semadan sil, testler kirmizi olmuyorsa testin degil senin varsayimin yanlis.

## 2026-08-24 · Oturum kotasi 3 paralel agent-i AYNI ANDA oldurur — is diskte kalir

Uc agent (~100-250k token/agent) es zamanli kosarken oturum kotasi doldu ve ucu birden
"API error: session limit" ile dustu. Kayip riski: bir agent tam raporu yazmak uzereyken
duserse **10 dosyalik commit-lenmemis is** diskte oylece kalir; worktree silinirse gider.
**Yapilacak:**

- Paralellik 4 degil 2-3 tut; agent basina token maliyeti 100k+ ise 2.
- Dusen agent-in worktree-sini SILME. Once `git status --porcelain` bak; is tutarliysa
  (testler geciyor, lint temiz) hemen commit et — sonra devam ettir.
- `Stop` hook-una `pausedUntil` alani eklendi: kota beklerken lead-in durusuna izin verir,
  yoksa dispatch edemedigi halde bloklanip bos donguye girer.

## 2026-08-24 · ⚠️ `Model.watch()` TIPI YALAN SOYLUYOR — `resumeToken` yok

Mongoose `Model.watch()` tipte `mongodb.ChangeStream` doner ama calisma aninda mongoose-un kendi
sarmalayicisidir ve **`resumeToken` alani YOKTUR**. `stream.resumeToken` DERLENIR, tip hatasi
vermez, sessizce `undefined` kalir. ADR-0002-nin "kopmada `startAfter: resumeToken` ile yeniden
ac" maddesi bu haliyle yazilirsa hicbir sey yapmaz: hata yok, tip hatasi yok, test yesil,
reconnect dayanikliligi sessizce olur.
Preview kaniti (RT-PROBE-001, her kosuda): `resumeTokenOnWrapper: false`, `resumeTokenOnDriver: true`.
**Yapilacak:** Token-i `resumeTokenChanged` olayindan sakla. Ayrica stream-in hazir oldugunu
anlamak icin `resumeToken` yoklamasi YAPMA — gercek Atlas-ta 8 saniye bos bekler; dogru sinyal
mongoose-un tiplerde gorunmeyen `ready` olayidir.

## 2026-08-24 · `vercel.json` icindeki `regions` Hobby/Pro-da yurumez

Fonksiyon bolgesini projenin `serverlessFunctionRegion` ayari belirler; `vercel.json`-daki
`regions` cok-bolgeli Enterprise icindir. Varsayilan `iad1` (Virginia) kalir ve kimse fark etmez.
Belirti: `vercel inspect` tum lambda-lari `iad1` gosterir.
**Yapilacak:** Bolgeyi proje ayarindan degistir (API: `PATCH /v9/projects/<id>`
`{"serverlessFunctionRegion":"fra1"}`) ve `vercel inspect` ile DOGRULA.
Teshis ipucu: RT-PROBE olcumu Istanbul-dan Atlas-a p50 63 ms, iad1-den 96 ms verdi — iad1
Istanbul-dan YAVAS olmasi Atlas-in Avrupa-da oldugunu ve fonksiyonlarin yanlis kitada
calistigini gosterdi.

## 2026-08-24 · Next 16 `apps/web/AGENTS.md` ve `CLAUDE.md` uretiyor

`next dev`/`next build` bu iki dosyayi otomatik olusturuyor ve `next-env.d.ts`-i kirletiyor.
Repo kokunde zaten bir CLAUDE.md var; apps/web altindaki kopya agent-lari yaniltir.
**Yapilacak:** Ikisini de `.gitignore`-a al.

## 2026-08-24 · zod fazla anahtari sessizce kirpar — "gecerli payload parse oldu" testi zayiftir

Bir semadan zorunlu alan silinirse, o alani ICEREN test payload-u hala parse olur (zod bilinmeyen
anahtari atar). Yani mutlu-yol `safeParse` testi alan kaybini YAKALAMAZ. 154 test / %100 kapsam
bu boslugu gizleyebilir.
**Yapilacak:** Her sema icin "her zorunlu alan tek tek eksiltilince REDDEDILIR" testi yaz ve
alan listesini elle degil `schema.shape` anahtarlarindan uret - yeni alan eklenince kapsam
otomatik gelsin.

## 2026-08-24 · `import { type X }` ile `import type { X }` ayni sey DEGIL

`verbatimModuleSyntax` acikken `import { type GameStatus } from '@xox/game-core'` satiri
`import {} from '@xox/game-core'` olarak emit edilir - yani paket calisma zamaninda modul
grafigine GIRER. Paketin `package.json`-inda `"sideEffects": false` yoksa bundler onu eleyemez;
Metro zaten tree-shaking yapmaz.
**Yapilacak:** Yalniz tip icin `import type { X }` kullan (tamamen elenir) ve her saf paketin
`package.json`-ina `"sideEffects": false` koy.

## 2026-08-24 · Sabitin regex kopyasi = sessiz sapma

`ROOM_CODE_ALPHABET` sabiti ve `roomCodeSchema`-nin `/^[A-HJ-NP-Z2-9]+$/` regex-i ayni bilginin
iki kopyasi. Alfabeye karakter eklenirse uretim yeni kod uretir, dogrulama reddeder: oda
KURULUR ama KATILINAMAZ.
**Yapilacak:** Regex-i sabitten turet, ya da en azindan "alfabedeki her karakter gecer,
disindakiler gecmez" testi yaz.

## 2026-08-24 · ESLint `.css` dosyalarini HIC ayristirmaz — CSS-teki hex yasak disinda

`no-restricted-syntax` JS/TS AST uzerinde calisir. `eslint apps/web/app/globals.css` ->
"File ignored because no matching configuration was supplied", 0 error. Yani "hex yasagi var"
demek CSS-te hex yok demek DEGILDIR; Tailwind v4 CSS-first projesinde tema degiskenleri tam
olarak orada yasar ve token-lardan sessizce kayarlar (2026-08-24-te kaymis halde bulundu).
**Yapilacak:** globals.css-i elle yazma, `themeCss()` ciktisindan uret ve uretilen icerikle
dosyayi karsilastiran bir test koy. Lint bu boslugu kapatmaz.

## 2026-08-24 · Tailwind keyfi-deger sozdizimi hex yasagini atlar

`'#2563eb'` yakalanir ama `'bg-[#2563eb]'` yakalanmaz — tam-string eslesen bir regex className
icindeki keyfi degeri gormez. CSS-first Tailwind-de ham renk yazmanin EN olasi yolu budur.
8 haneli alfali hex (`#2563eb80`) de kacar.
**Yapilacak:** Yasaga `-\[#...\]` kalibini ve 8 haneli hex-i ayrica ekle.

## 2026-08-24 · Ozdeslik iddiasi test degildir

`nativeColors(t)` govdesi `return themes[t]` iken `expect(nativeColors(t)).toStrictEqual(themes[t])`
hicbir kosulda kirilmaz — ayni referansi kendisiyle karsilastirir. Kapsam yuzdesini ve test
sayisini sisirir, sifir koruma saglar. Ayni sey `colors.light = themes.acik` takma adi icin de.
**Yapilacak:** Test, degerin BEKLENEN bir listeye/anahtar kumesine esitligini iddia etsin.
Mutasyon testi bunlari hayatta kalan mutant olarak gosterir.

## 2026-08-24 · Testin esigi, degerin secilme gerekcesiyle AYNI sayi olmali

`win` rengi 4.5:1 esiginin altinda kaldigi icin degistirildi ama testi 3:1 esigine baglandi.
Eski degeri geri koyunca 17/17 test yesil kaldi — duzeltmeyi hicbir sey korumuyordu.
**Yapilacak:** Bir degeri X gerekcesiyle degistiriyorsan testi X esigine bagla; aksi halde
duzeltme bir sonraki "biraz daha canli olsun" commit-inde sessizce geri alinir.

## 2026-08-24 · Ayni paketin iki kopyasi `instanceof` kontrollerini sessizce bozar

`jose@6.2.10` dogrudan bagimlilik olarak eklendi ama `@auth/core` kendi icinde `jose@6.2.3`
cozuyor -> node_modules-te iki kopya. `err instanceof JWTExpired` kopyalar arasinda **false**
doner: Auth.js-in firlattigi hata 6.2.3 sinifidir, senin import ettigin 6.2.10 sinifidir.
Sonuc: 401 yerine 500, ve "gecersiz token reddedildi" testi yanlis nedenle yesil kalir.
**Yapilacak:** Bir kutuphaneyi hem dogrudan hem transitif kullaniyorsan `pnpm why <paket>` ile
TEK kopya oldugunu dogrula; degilse ust paketin cozdugu surume sabitle ya da pnpm `overrides`
kullan. Ayni tuzak `mongodb` icin de vardi (mongoose ile ayni surume sabitlendi).

## 2026-08-24 · Vercel `functions` anahtari `app/` ile basliyorsa HIC dogrulanmaz

Next runtime-inda Vercel CLI `checkUnusedFunctions` icinde `app/`, `src/app/`, `pages/`,
`middleware` ile baslayan anahtarlari `unusedFunctions` kumesinden sessizce siler. Yani var
olmayan bir route icin `maxDuration` yazsan bile deploy YESIL gecer ve ayar hicbir seye
uygulanmaz. Root Directory yanlissa `vercel.json` komple yok sayilir, `regions` da bosa gider.
**Yapilacak:** `vc build` sonrasi `.vercel/output/functions/**/.vc-config.json` icinden degeri
oku - uygulandiginin tek mekanik kaniti budur.

## 2026-08-24 · `maxDuration`-a sabit sayi yazmak plan degisince HER deploy-u kirar

CLI `validateFunctions`: `maxDuration !== "max" && maxDuration > maxDurationLimit` ->
`invalid_function_duration`. Pro tavani 800, Hobby 300. Plan duserse WS kisalmaz, **boru hatti
komple olur**. CLI `"max"` degerini destekliyor ve plan-agnostiktir.

## 2026-08-24 · `boundaries` cozulemeyen import-ta SESSIZ kalir — lint yesili kanit degil

Var olmayan bir pakete yapilan import `boundaries/dependencies` tarafindan "unknown" sayilir ve
hicbir politika atesler. Yani bir bagimlilik sinirini "lint yesil, demek ki temiz" diye dogrulamak
YANLIS: import zaten cozulemiyorsa kural hic bakmamistir.
**Yapilacak:** Sinir sondasi yazarken hedefin GERCEKTEN var oldugundan emin ol; kanit `tsc`
(TS2307 vermiyorsa cozuluyor demektir) + boundaries hatasinin birlikte gorulmesidir.
CTR-001 sondasi dogru yontemle kosuldu: gercek `apps/web/app/api/health/route` import edildi ve
"There is no policy allowing dependencies from elements of type shared to elements of type web"
hatasi alindi.

## 2026-08-24 · Dalga uçuştayken lead-in `git add -A` kullanmasi is karistirir

Dort agent paralel worktree-de calisirken biri yanlislikla ana checkout-a dosya yazabilir
(rapor yolunu mutlak yerine goreli verirse kolayca olur). Lead o sirada `git add -A` ile
commit atarsa, merge edilmemis bir isin raporu `main`-e girer; sonra o dal merge edilirken
ayni dosya iki yerde olur ve celisirse cakisir.
**Yapilacak:** Dalga sirasinda lead yalnizca ACIK YOL stage etsin:
`git add docs/board/board.json docs/board/journal.ndjson`. Raporlari merge getirir.

## 2026-08-24 · Hook scriptlerinde `node -e` govdesine kesme isareti yazma

Hook scriptleri JS govdesini tek tirnakli `node -e '...'` icinde tasiyor. Turkce metinde kesme
isareti her yerde ("lead'in", "bayragi") ve tek bir tanesi tirnagi kapatip scripti bozuyor —
`bash -n` bunu yakalar ama sessizce kirik bir hook commit edilebilir.
**Yapilacak:** `node -e` govdesindeki yorum ve string'lerde apostrof kullanma; Turkce yazacaksan
kesme isaretsiz kur ("lead-in", "bayragi KORU"). Degisiklikten sonra MUTLAKA `bash -n` calistir
ve hook-u gercek stdin ile bir kez kosur.

## 2026-08-24 · ⚠️ Her change stream havuzdan BİR bağlantı tutar — bağlantı-başına stream ölümcül

MongoDB resmi dokümanı: "Each change stream holds a connection open with a `getMore` operation
while waiting for the next event. … ensure that the pool size is greater than the number of
open change streams." `packages/db/src/client.ts` `maxPoolSize: 10` kullanıyor.
Yani "her WS bağlantısı kendi odasına abone olsun" tasarımı **5 eşzamanlı oyuncuda havuzun
yarısını kilitler, 10 oyuncuda tüm sorguları durdurur.**
**Yapılacak:** Fluid instance başına **tek** change stream (modül kapsamı singleton), oda kodu
filtresi süreç içinde. Bkz. ADR-0002.

## 2026-08-24 · Change stream `$match` + `updateLookup` birleşimi resume token'ı kırabilir

MongoDB dokümanı: `fullDocument: "updateLookup"` ile `fullDocument.*` üzerinde `$match`,
hızlı silmelerde "Resume Token Not Found" üretebilir. Öneri: `fullDocument: "whenAvailable"` +
pre/post images. Bizde pipeline **yalnız `operationType`** üzerinde filtreliyor, o yüzden
güvendeyiz — ama biri "oda koduna göre sunucu tarafında filtreleyelim" derse bu tuzağa girer.

## 2026-08-24 · ⚠️ Vercel WebSocket'i 300 saniyede KAPANIR — bu kenar durum değil, ana akış

"WebSocket connections close when a Vercel Function reaches its maximum duration."
Maks. süre: **Hobby 300 s (varsayılan = maksimum)**, Pro 300 s varsayılan / 800 s maks.
Yani bağlantı hiç kopmasa bile en geç 5 dakikada bir kesilir ve yeni bağlantı **başka bir
instance'a** düşebilir ("not guaranteed to reach the same instance").
**Yapılacak:** Yeniden bağlanma + tam resync birinci sınıf akış olarak tasarlanır; sunucu
`getDeadline()` ile süre dolmadan önce `close(4499)` ile **planlı** rotasyon yapar, istemci bu
kodu görünce backoff'u sıfırlayıp anında bağlanır. `maxDuration`'ı koda gömme — `getDeadline()`
kullan, plan değişince kod değişmesin. Bkz. ADR-0007.

## 2026-08-24 · Yerel WS geliştirme `next dev` ile ÇALIŞMAZ — `vc dev` gerekir

Vercel dokümanı: "When developing a Next.js app that uses `experimental_upgradeWebSocket()`
locally, you must run the development server using `vc dev` with Vercel CLI 54.14.2 or above
**instead of** `next dev`." Next.js, bu API'nin yerel geliştirmede desteklendiği **tek** çerçeve.
**Yapılacak:** `apps/web`'e `"dev:ws": "vc dev --listen 3000"` script'i. WS gerektiren yerel
E2E `pnpm dev` (yani `next dev --turbopack`) ile koşarsa bağlantı kurulamaz ve hata
"Vercel WS bozuk" diye yanlış okunur.

## 2026-08-24 · `experimental_upgradeWebSocket` handler'ına `Request` VERİLMEZ

İmza: `experimental_upgradeWebSocket(handler: (ws) => void | Promise<void>, options?)`.
Handler yalnız `ws` alır — çerez, başlık, sorgu parametresi oradan okunamaz.
**Yapılacak:** Kimlik ve oda kodu upgrade'den **önce**, route handler'ın kendi `Request`
argümanından çözülür ve closure ile handler'a taşınır. `options.maxPayload` varsayılanı
256 KiB; oyun protokolü için 8 KiB'a düşür.

## 2026-08-24 · Atlas ücretsiz katman: change stream var, ama 100 işlem/sn sınırı var

Free (M0) cluster: change stream **destekleniyor** (yalnız `ns` veritabanı adı filtrelerinde
string/regex kısıtı var, koleksiyon filtresi serbest), 500 bağlantı, **100 işlem/sn**
(aşılırsa throttle + 1 sn soğuma), 10 GB/7 gün transfer, 0.5 GB depolama, 30 gün hareketsizlikte
otomatik duraklatma. Her `getMore` bir işlemdir — instance başına tek stream bu bütçeyi korur.

## 2026-08-24 · Vercel `partialFilterExpression` değil ama Mongo: `$ne` kısmi indekste desteklenmez

Kısmi indeks filtresi yalnız eşitlik, `$exists: true`, `$gt/$gte/$lt/$lte`, `$type`, `$in`,
`$and`, `$or` kabul eder — **`$ne` yok**. `finishedAt: { $ne: null }` için kısmi indeks
kurulamaz; onun yerine `{ participants: 1, finishedAt: -1 }` tam indeksi kullanılır
(`$ne` indeks anahtarı üzerinde uygulanır, doküman çekilmez → COLLSCAN yok).

## 2026-08-24 · `argon2` yerine `@node-rs/argon2` — Vercel'de node-gyp derlemesi yok

`@node-rs/argon2@2.1.0` napi-rs tabanlı; `linux-x64-gnu` dahil 13 platform için önceden
derlenmiş ikiliyi optional dependency olarak yayınlıyor (npm registry'den doğrulandı).
`argon2` (node-pre-gyp) paketinin Vercel bundle'ında native ikiliyi taşıması
`serverExternalPackages` ayarına ve şansa bağlı; başarısız olunca hata çalışma anında ve
anlaşılmaz gelir.

## 2026-08-24 · Auth.js middleware'i `mongoose`/native ikili import EDEMEZ — split config şart

Next.js middleware kenar çalışma zamanındadır. `auth.ts` `mongoose` ve `@node-rs/argon2`
(native ikili) import ettiği için `middleware.ts` onu **doğrudan import edemez** — build patlar.
**Yapılacak:** `auth.config.ts` (kenar-güvenli: yalnız `pages` + `callbacks.authorized`) ve
`auth.ts` (tam: `Credentials({ authorize })` + db) ayrılır; middleware yalnız `auth.config.ts`
kullanır. Auth.js'in belgelenmiş kalıbı budur.

## 2026-08-24 · Credentials + JWT ilişkisi Auth.js v5 dokümanında YAZMIYOR — varsayılana güvenme

Auth.js v5 sayfaları "Credentials provider yalnız JWT session ile çalışır" ifadesini artık
içermiyor; doğrulanamadı. Bilinen tek kesin bilgi: "By default, the Credentials provider does
not persist data in the database" ve `signIn` kullanıcı **oluşturmaz**.
**Yapılacak:** `session: { strategy: 'jwt' }` **açıkça** yazılır (adapter varlığında varsayılan
`database` olabilir), kayıt ayrı bir REST uç noktası olur, ve KK-006 (oturum sürekliliği)
gerçek preview'da koşturulur — birim testi bu soruyu cevaplamaz.

## 2026-08-24 · TypeScript 7'ye yükseltme lint'i öldürür

`typescript@7.0.2` yayında ama `typescript-eslint@8.67` (canary dahil) peer'ı `typescript <6.1.0`.
TS 7'ye geçmek `strict-type-checked` kural setinin tamamını devre dışı bırakır.
**Yapılacak:** `typescript@6.0.3`'te kal. typescript-eslint TS7 desteği duyurana kadar dokunma.

## 2026-08-24 · npm'deki `gitleaks` paketi sahte

`npm i gitleaks` alakasız bir 1.0.0 paketi kurar. Gerçek araç Go ile yazılmış:
`brew install gitleaks`.

## 2026-08-24 · Auth.js v5 hâlâ beta

`next-auth` latest = 4.24.15 (Pages Router çağı). App Router için `next-auth@beta` (5.0.0-beta.32)
gerekir ve `@auth/mongodb-adapter` ile eşleşir. Sürüm yükseltirken ikisini birlikte yükselt.

## 2026-08-24 · Auth.js adapter'ı mongoose'u değil `mongodb` sürücüsünü ister

İki ayrı bağlantı havuzu açmamak için `getMongoClient()` mongoose'un istemcisini paylaşır
(`connection.getClient()`). Adapter'a yeni `MongoClient` verme — Atlas bağlantı limiti dolar.

## 2026-08-24 · Stryker pnpm monorepo'da iki ek ayar ister

`plugins: ['@stryker-mutator/vitest-runner']` — pnpm plugin'i sembolik bağlar, Stryker'ın
varsayılan `@stryker-mutator/*` glob'u sembolik bağlantı izlemez → `Cannot find TestRunner
plugin "vitest"`. Ve `inPlace: true` — Stryker sandbox'ı yalnızca paket klasörünü kopyalar,
dolayısıyla `vitest.config.ts`'teki `'../../vitest.shared'` importu sandbox içinde çözülemez.
`inPlace` kaynakları yerinde mutasyona uğratıp koşu sonunda geri yükler.

## 2026-08-24 · Çöken Stryker koşusu test sayısını iki katına çıkarır

Koşu çökerse `.stryker-tmp/` geride kalır; vitest oradaki test kopyalarını da toplar ve
`60 test` yerine `146 test` görürsün. `vitest.shared.ts` içindeki `exclude` bunu kapatıyor —
o satırı silme. Elle temizlik: `rm -rf packages/*/.stryker-tmp`.

## 2026-08-24 · `non-nullable-type-assertion-style` ile `no-non-null-assertion` çakışıyor

`moves[index] as number` yazınca birincisi `!` kullan der, ikincisi `!`'i yasaklar. Çıkış yolu
tek satırlık gerekçeli `eslint-disable-next-line`. Kök konfigürasyonu bunun için değiştirme.

## 2026-08-24 · ⚠️ ESLint çözümleyicisi yanlışsa KURALLAR SESSİZCE ÖLÜR — en pahalı ders

`eslint-import-resolver-node` ne `.ts` uzantısını ne de `package.json`'daki `exports` alanını
bilir. Bu repoda tüm paketler yalnızca `"exports": { ".": "./src/index.ts" }` tanımlar ve
`main` yoktur — sonuç: **her `@xox/*` importu çözülemez sayıldı**, `isUnknown: true` olarak
sınıflandı ve `boundaries/dependencies` hiçbir ihlali raporlamadı. Aynı sebeple
`import-x/no-cycle` da `import-x/extensions` varsayılanı `['.js','.mjs','.cjs']` olduğu için
**tek bir TypeScript dosyası okumadı**; yaptığı tek iş `node_modules` içindeki react-native'i
ayrıştırmaya çalışıp stderr'e hata basmaktı.

Yani iki mimari koruma da aylarca "yeşil" görünüp hiçbir şey korumayabilirdi.

**Yapılacak:** `eslint-import-resolver-typescript` kullan; hem `boundaries` hem `import-x` için
ayrı ayrı ayarla (`import/resolver` ve `import-x/resolver` **farklı anahtarlardır**),
`import-x/extensions`'a TS uzantılarını yaz, `import-x/ignore: ['node_modules']` ekle.

**Genel ders:** Bir lint kuralının yazılmış olması çalıştığı anlamına gelmez. Her mimari kural
için hem **ihlal eden** hem **izinli** bir sonda yaz ve ikisini de gör. Bir agent "kanıtladım"
dediğinde de bunu yap — bu kuralın çalıştığı bir kez "kanıtlanmış", kanıt tutmamıştı.

## 2026-08-24 · Expo monorepo rehberi pnpm'de yanlış

`disableHierarchicalLookup = true` hoisted düzen içindir. pnpm'de web build
`Unable to resolve module @expo/metro-runtime` ile ölür. `watchFolders` + `nodeModulesPaths`
yeterli, üçüncü satırı ekleme.

## 2026-08-24 · pnpm sembolik bağlantıları boundaries kuralını sessizce öldürür

`node_modules/@xox/*` pnpm'de semboliktir. `eslint-import-resolver-node` varsayılan olarak
realpath çözmez, dolayısıyla çözülen yol `node_modules` içerir ve `@boundaries/elements`
bunu "harici paket" sayar. Sonuç: `boundaries/dependencies` **hiçbir gerçek `@xox/*`
import'unda ateşlenmez** — kural var görünür, hiçbir şey korumaz.
**Yapılacak:** `settings['import/resolver'].node.preserveSymlinks = false`. Bunu kaldırma.
2026-08-24'te sonda ile hem ihlal (game-core → shared) hem izin (shared → game-core) doğrulandı.

## 2026-08-24 · `projectService: true` + kapsam dışı dosya = kural hiç çalışmaz

`eslint.config.mjs` içinde `projectService: true` varken, hiçbir `tsconfig.json`'ın `include`'una
girmeyen bir `.ts` dosyası **hiçbir kural değerlendirilmeden** "was not found by the project
service" parse hatası verir. Yani kuralı test etmek için attığın sonda, kuralı hiç tetiklemez.
**Yapılacak:** Yeni bir paket açarken `tsconfig.json`'ı `src/` ile aynı commit'te oluştur.

## 2026-08-24 · `eslint-plugin-jsx-a11y@6.10.2` peer'ı ESLint 10'u tanımıyor

Peer aralığı `^3 – ^9`; bizde ESLint 10.9.0 var. `.npmrc`'de `strict-peer-dependencies=false`
olduğu için kurulum ve lint sorunsuz çalışır — uyarı görmezden gelinebilir. Plugin ESLint 10
desteği duyurunca pin güncellenmeli.

## 2026-08-24 · pnpm 11 postinstall script'lerini engeller

`pnpm install` ilk kez koşarken `ERR_PNPM_IGNORED_BUILDS` ile exit 1 verir ve
`pnpm-workspace.yaml`'a `allowBuilds` yer tutucusu yazar. Şu ana kadar iki paket bunu tetikledi:
`lefthook` (git hook'larını postinstall'da kurar — onaylanmazsa tüm pre-commit kapıları sessizce
devre dışı kalır) ve `unrs-resolver` (`eslint-plugin-import-x`'in native resolver'ı — onaylanmazsa
`pnpm install` ve `pnpm lint` hard-fail eder). İkisi de `true`.

## 2026-08-24 · `expo-router@~7.0.0` canary kurar

expo-router artık Expo SDK ile hizalı sürümleniyor: SDK 57 için doğru sürüm `57.0.15`.
npm'de duran `7.0.0-canary-*` sürümleri kararsızdır. `~7.0.0` yazmak canary çeker.

## 2026-08-24 · `ws` kurulmazsa Vercel WebSocket'i yanlışlıkla "bozuk" sanırsın

`@vercel/functions` `ws`'i opsiyonel peer yapar → kurulmaz → `experimental_upgradeWebSocket`
çalışma anında `The "ws" package is required` fırlatır. Bu hata kolayca "Fluid Compute WS
desteklenmiyor" diye okunur ve gereksiz mimari pivotu tetikler.
**Yapılacak:** `apps/web`'e `ws` + `@types/ws` doğrudan bağımlılık olarak ekli kalsın.

## 2026-08-24 · TypeScript 6: `baseUrl` hata veriyor

`TS5101: Option 'baseUrl' is deprecated`. Kaldır; `paths` tsconfig'in kendi konumuna göre çözülür.

## 2026-08-24 · Next 16 `next.config` içinde `eslint` anahtarını reddediyor

`Unrecognized key(s) in object: 'eslint'`. Next 16 build sırasında ESLint'i zaten koşturmuyor,
anahtar gereksiz. `typescript.ignoreBuildErrors` hâlâ geçerli.

## 2026-08-24 · `next-env.d.ts` format kapısını kalıcı kırar

Next onu her build'de çift tırnak + noktalı virgülle yeniden yazar; `prettier --check` hep
kırmızı olur. `.prettierignore`'da — o satırı silme.

## 2026-08-24 · `--filter=!@paket` var olmayan pakette turbo'yu öldürür

Kök script'te olmayan bir pakete negatif filtre yazarsan turbo `No package found with name ...`
ile hata verir — yani `pnpm gates` paket oluşturulana kadar tamamen çalışmaz.
**Yapılacak:** Negatif filtre kullanma. e2e paketinin task adını `test` yerine `e2e` yap;
`turbo run test` onu hiç görmez.

## 2026-08-24 · Mongoose model yeniden kaydı: cast `??` fallback'ini öldürür

`(models['User'] as Model<UserDoc>) ?? model(...)` yazarsan cast `undefined`'ı **??'den önce**
kaldırır, fallback ölü koda döner (`no-unnecessary-condition` bunu yakalar) ve HMR/yeniden
içe aktarmada `OverwriteModelError` alırsın.
**Yapılacak:** `as Model<UserDoc> | undefined` yaz.

## 2026-08-24 · `noUncheckedIndexedAccess` + string indeksleme

`ALPHABET[i]` tipi `string | undefined` döner; `restrict-plus-operands` reddeder ve `!`
`strictTypeChecked` altında yasak. `.charAt(i)` kullan — total fonksiyon, aynı sonuç.

## 2026-08-24 · `import type { X } from 'mongodb'` bile paketi bağımlılık yapar

pnpm izole linker'da `mongodb` yalnızca `.pnpm/node_modules` altındadır; `tsc` `TS2307` verir.
`mongoose@9.9.3`'ün çözdüğü sürümle aynısını (`7.5.0`) doğrudan bağımlılık olarak ekle —
store'da tek kopya kalır.

## 2026-08-24 · `turbo run test` Playwright'ı da çalıştırır

`apps/e2e` içindeki `test` scripti `playwright test`tir. Kök `pnpm test` bunu filtrelemezse
sunucu ayakta değilken Playwright koşar ve kapılar hatalı kırmızı olur.
**Yapılacak:** kök scriptlerde `--filter=!@xox/e2e` kalsın. E2E ayrı çalışır: `pnpm e2e`.

## 2026-08-24 · pnpm + Expo Metro çözümlemesi

pnpm sembolik bağlantı kullanır; Metro varsayılan olarak workspace kökünü izlemez.
`metro.config.js` içinde `watchFolders` + `nodeModulesPaths` + `disableHierarchicalLookup`
ayarlanmazsa `@xox/*` paketleri "module not found" verir.

## 2026-08-24 · Claude Code hook'lara MUTLAK `file_path` verir

`Write`/`Edit` araçlarının `tool_input.file_path` alanı **her zaman mutlak yoldur**
(`/Users/.../XOX/apps/web/lib/x.ts`), göreli değil. Hook içinde `[[ $path == apps/web/* ]]`
gibi göreli önek karşılaştırması gerçek kullanımda **hiç eşleşmez** — kural sessizce ölür,
üstelik sonda göreli yolu elle beslediği için yeşil görünür (ESLint çözümleyici dersiyle aynı
başarısızlık biçimi).
**Yapılacak:** yolu önce `CLAUDE_PROJECT_DIR`e göre indirge (`path.relative`), `..` parçalarını
ve sembolik bağları çöz, sonra karşılaştır. Sondayı MUTLAK yolla çalıştır; hem engelleyen hem
izin veren yönü ayrı ayrı kanıtla.

## 2026-08-24 · ⚠️ `next-auth`'un derlenmiş çıktısı Vitest'in native ESM yükleyicisinde İMPORT EDİLEMEZ

`next-auth@5.0.0-beta.32`'nin `lib/env.js`'i `next/server`'ı UZANTISIZ import ediyor —
kaynakta bizzat `// @ts-expect-error Next.js does not yet correctly use the package.json#exports
field` yorumuyla bunu kabul ediyor. `next`'in `package.json`'ında `exports` alanı YOK (legacy
çözümleme, `server.js` dosyası kökte duruyor); bu webpack/Turbopack'te sorunsuz çalışır ama
Vitest'in vite-node'u bu importu native Node ESM loader'ına devrettiğinde **strict ESM**
kullanılıyor ve extensionless bare specifier reddediliyor:
`Cannot find module '.../next/server' ... Did you mean to import "next/server.js"?`.
Canlı doğrulandı: hem `node` hem varsayılan `jsdom` test ortamında, `next-auth`'u (default
export ya da `next-auth/providers/credentials` fark etmez) DOĞRUDAN import eden HERHANGİ bir
test dosyası bu hatayla çöküyor — environment seçimi sorunu ÇÖZMÜYOR.
**Yapılacak:** `next-auth`/`Credentials(...)` çağrısını yapan dosyayı (`auth.ts`) ince bir tel
dosyası olarak bırak; gerçek iş mantığını (`authorizeCredentials`, zod doğrulama, DB erişimi)
`next-auth`'a HİÇBİR bağımlılığı olmayan ayrı bir dosyada (`lib/auth/authorize.ts`) yaz ve
testleri ORADAN çalıştır. `auth.ts`/`middleware.ts` gibi gerçekten `next-auth` import eden
dosyalar için mekanik kanıt `pnpm --filter @xox/web build` olsun; metin-düzeyi (kaynak okuyup
regex) sonda ikinci savunma hattı olarak eklenebilir ama TEK kanıt olmamalı.

## 2026-08-24 · `jose`'nin webapi derlemesi jsdom'un AYRI `Uint8Array` realm'inde patlar

Vitest'in `jsdom` ortamı (varsayılan) ayrı bir `vm` realm'i kullanıyor; o realm'in
`Uint8Array`'i Node'un dış realm'indekiyle FARKLI bir yapıcı fonksiyon oluyor. `jose@6.2.3`'ün
`SignJWT`/`jwtVerify`'ı dahili olarak `instanceof Uint8Array` kontrolü yapıyor
(`FlattenedSign` constructor'ı) ve bu, jsdom altında **tek kopya jose'ye rağmen**
`TypeError: payload must be an instance of Uint8Array` ile sessizce patlıyor — `pnpm why jose`
tek kopya gösterse bile bu hata oluşabiliyor, çünkü sorun paket kopyası değil REALM farkı.
**Yapılacak:** `jose` (ya da onu saran `lib/auth/tokens.ts` gibi bir modül) kullanan test
dosyalarının başına `// @vitest-environment node` direktifi ekle. Bu saf sunucu mantığı zaten
DOM'a ihtiyaç duymuyor.

## 2026-08-24 · Next 16 `middleware.ts`'te destructured/computed export'u TANIMAZ

`export const { auth: middleware } = NextAuth(authConfig)` — Auth.js'in kendi dokümantasyonunda
sık görülen bir kalıp — Next 16'nın build-time middleware algılayıcısını GEÇMİYOR:
`Error: The file "./middleware.ts" must export a function, either as a default export or as a
named "middleware" export.` Algılayıcı statik/sözdizimsel çalışıyor, gerçek çalışma zamanı
değerine bakmıyor. Ayrıca Next 16 `middleware.ts` dosya kuralını KALDIRIYOR, yerine `proxy.ts`
öneriyor (`npx @next/codemod@canary middleware-to-proxy`) — henüz sert hata değil, uyarı.
**Yapılacak:** `const { auth } = NextAuth(authConfig); export default auth` kalıbını kullan —
build bunu tanıyor. `middleware.ts` → `proxy.ts` geçişi ayrı bir görev olarak planlanmalı,
Auth.js'in kendi dokümantasyonu bu değişikliğe henüz uymuyor.

## 2026-08-24 · gitleaks `generic-api-key` kuralı UYDURMA test parolalarını yakalıyor

`password: '...'` anahtarına yakın, ~18+ karakter VE en az bir rakam bloğu içeren herhangi bir
string (`'gecerli-parola-2026'`, `'gercek-kullanici-parolasi-2026'`) entropy eşiğini aşıp
`generic-api-key` kuralını tetikliyor — içerik gerçek bir secret olmasa bile. Canlı doğrulandı:
`'dogru-parola-2026'` (17 karakter) TEMİZ, `'gecerli-parola-2026'` (19 karakter) YAKALANDI;
uzunluk/rakam kombinasyonu eşiği aşıyor, kelime seçimi önemli değil. Pre-commit hook'u commit'i
SERT reddediyor (`--staged` ile `gitleaks protect`).
**Yapılacak:** Testte gerçek bir sır olmayan ama kısıtları (KK-003: `MIN_PASSWORD_LENGTH=8`)
karşılayan parola sabitlerini KISA tut (`'test-parola1'`, 8-14 karakter, tek rakam) — bir commit
denemeden önce `gitleaks detect --no-git --source <dosya>` ile sonda at. `.gitleaks.toml`'a
istisna eklemek (bu kartın çakışma kümesi dışında) yerine tercih edilecek ilk çözüm budur.

## 2026-08-24 · ⚠️ Auth.js `jwt` callback'i oturum OKUMASINDA `user` OLMADAN çağrılır — ölümcül

`@auth/core@0.41.3`'ün `lib/actions/session.js:28` (JWT stratejisi) her oturum okumasında
`callbacks.jwt({ token, session })` çağırıyor — **`user` anahtarı YOK**. `user` yalnız sign-in
anında (`callback/index.js`) geçiriliyor. `jwt({ token, user }) { if (user.id !== undefined) ...}`
yazmak (TypeScript'in `user`i ZORUNLU göstermesine rağmen — tip yalan söylüyor, `pnpm gates`
yeşil kalır) her oturum okumasında `TypeError: Cannot read properties of undefined` fırlatıyor;
`session.js:58-62` bunu yakalayıp **`sessionStore.clean()` ile çerezi SİLİYOR**. Sonuç: kullanıcı
giriş yapar yapmaz İLK `auth()` çağrısında oturum kayboluyor — çerez yolu (KK-006/KK-010) asla
çalışmıyor, ve hiçbir birim testi bunu yakalamıyor çünkü test edilen dosya (`auth.ts`) `next-auth`
runtime'ını Vitest'te yüklenemediği için (bkz. yukarıdaki `next/server` maddesi) yalnız METİN
düzeyinde sondalanıyordu.
**Yapılacak:** `jwt` callback'ini TANIMLAMA — `@auth/core` sign-in sırasında `token.sub`'ı zaten
`user.id`'den kuruyor (`callback/index.js`: `sub: user.id?.toString()`), callback GEREKSİZ.
Gerçekten özel bir `jwt` callback'i gerekiyorsa `user` parametresini HER ZAMAN opsiyonel
(`user?: User`) varsay, tipin "zorunlu" demesine güvenme. `session` callback'inin mantığını
next-auth'a bağımlı OLMAYAN ayrı bir dosyaya (`import type` yalnız, `verbatimModuleSyntax`
altında silinir) taşıyıp orada GERÇEK bir davranış testiyle kilitle — next-auth import eden bir
dosya Vitest'te asla çalıştırılamayacağı için bu, o mantığı test edilebilir kılmanın TEK yolu.

## 2026-08-24 · ⚠️ Kaynak METNİ okuyan test, test DEĞİLDİR — `readFileSync`+`toContain` bir dizi kısaltmasını YAKALAMAZ

AUTH-001'de iki test dosyası `readFileSync` + regex/`toContain` ile kaynağı okuyup desen
arıyordu. Denetçi iki mutasyon koşturdu, İKİSİ DE 100 testin tamamını yeşil bıraktı:

- `token.sub = user.id` → `token.sub = 'sabit-yonetici'`: her kullanıcı AYNI kimliğe çözülüyor,
  kaynak metin hâlâ "doğru görünüyordu".
- `middleware.ts`'in `config.matcher`'ını `readFileSync` ile okuyup her beklenen rota için
  `toContain(rota)` kontrolü yapan test, `matcher: [6 desen]` → `.slice(0, 1)` mutasyonuyla
  kırıldı: çalışma zamanında yalnız `/oyna` korunuyor, 5 rota TAMAMEN açık kalıyor — ama
  `toContain(rota)` "her rota metinde bir yerde geçiyor mu" sorusuna cevap verdiği için, "dizi TAM
  OLARAK bunlardan mı oluşuyor" sorusunu hiç sormuyor (fazladan/silinmiş/yeniden sıralı girdiyi
  ayırt edemiyor) ve YEŞİL kaldı.

Ayrıca Next.js `matcher`'ın SAF bir literal dizi olmasını build-time ZORUNLU kılıyor
(`.slice()`/hesaplanmış herhangi bir ifade "matcher needs to be a static string or array of
static strings" hatasıyla reddediliyor — canlı doğrulandı) ve `middleware.ts` `next-auth` import
ettiğinden Vitest'te hiç ÇALIŞTIRILAMIYOR (bkz. yukarıdaki `next/server` maddesi), yani metin
düzeyi sonda tek seçenek gibi görünüyordu — ama tek kanıt olmamalıydı.
**Yapılacak:** (1) Middleware/config gibi şeyleri gerçek `NextRequest` ile davranış olarak test
et; `toContain('/profil')` bir şey kanıtlamaz. (2) Dizi bekleniyorsa ayrıştırıp `toStrictEqual`
ile TAM eşitlik iste. (3) Doğruluk kaynağını (elle yazılmış liste) next-auth'suz, gerçekten
import edilebilir bir dosyada (`auth.config.ts`) tut ve `middleware.ts`'ten ayrıştırılan literali
BUNA karşı karşılaştır. **Aynı sınıf:** bir bağımlılığı TAMAMEN mock'layıp rotayı test ettiğini
sanmak — o zaman test rotayı değil kendi mock'unu doğrular.

## 2026-08-25 · RTL `render()` hidrasyon yapmaz — `getServerSnapshot` hataları yalnız `hydrateRoot` ile görünür

`useSyncExternalStore`'un `getServerSnapshot`'ı her çağrıda YENİ nesne döndürürse React
"The result of getServerSnapshot should be cached to avoid an infinite loop" basar. `useCallback`
bunu çözmez — fonksiyon kimliğini sabitler, dönen DEĞERİ değil. Çözüm: modül düzeyinde donmuş
tek bir `SERVER_SNAPSHOT` sabiti.

**Tuzak testte:** Testing Library'nin `render()`'ı hiç hidrasyon yapmaz, bu yüzden hata test
paketinde HİÇ görünmez — `use-room.test.tsx`'in 8 testi yeşilken her gerçek sayfa yüklemesi
uyarıyı basıyordu. SSR edilen bir istemci bileşenini test ediyorsan regresyonu
`renderToString` + `hydrateRoot` ile yaz ve `console.error` çağrılmadığını iddia et.
Örüntü #5'in ("Vitest gizliyor, üretim kırık") React tarafındaki yüzü.

## 2026-08-25 · `next-auth` v5 `signIn()` tipte `SignInResponse`, çalışma zamanında `undefined` dönebilir

`next-auth@5.0.0-beta.32`, `react.js:134` ve `:141`: `getProviders()` null dönerse fonksiyon
çıplak `return;` yapar — kaynakta _"TODO: Return error if redirect:false"_ yorumuyla. Yani
`redirect:false` ile çağırsan bile `result.error` okuması TypeError fırlatabilir. Örüntü #3.

İki katmanlı sonuç: `await signIn(...)` reddedilir/patlar, `setPending(false)` await'ten SONRA
yazıldıysa hiç çalışmaz ve `void handleSubmit(e)` reddi yutar → **düğme sonsuza dek disabled,
hiçbir hata mesajı yok**. Form gönderimini her zaman `try/catch/finally`ye al, `pending`i
`finally`de düşür, `signIn` dönüşünü kullanmadan önce null kontrolü yap. Testte `signIn` mock'u
her zaman bir nesneye resolve ederse bu sınıfın tamamı görünmez — `mockRejectedValue` ve
`mockResolvedValue(undefined)` senaryolarını ayrıca yaz.

## 2026-08-25 · Sunucu hata kodunu zod'suz `ErrorCode` saymak BOŞ bir hata şeridi üretir

`body as Partial<ErrorResponse>` cast'i enum dışı bir kodu (yeni sunucu kodu, Vercel'in 504
gövdesi, proxy hatası) `ErrorCode` sanar; `tr.errors[kod]` `undefined` olur ve
`<p role="alert" data-testid="hata-mesaji">` **boş** render edilir. Kullanıcı boş şerit görür,
ekran okuyucu hiçbir şey duyurmaz.

En sinsi kısmı E2E: `getByTestId('hata-mesaji')` iddiası boş elemana karşı **geçer** — yani
hata yolu testi hem birimde hem E2E'de yeşil kalırken kullanıcıya hiçbir şey söylenmez.
Örüntü #2 + #3 birlikte. Hata gövdesini de `errorResponseSchema.safeParse`'tan geçir,
başarısızsa `SERVER_ERROR`'a düş; hata bileşenine bilinmeyen kod için görünür bir yedek koy.

## 2026-08-25 · Sonda uygulamadan ÖNCE gerçek düzeltmeleri commit et

Bir dosyaya mutasyon sondası uygulayıp `git checkout --` ile geri alırken, aynı dosyada duran
**commit edilmemiş gerçek düzeltmeler de** geri gider. ROOM-API-001'de tam bu oldu: sonda geri
alınırken kimlik kapısı düzeltmesi de silindi; ajan diff'te bloğun kaybolduğunu görüp yakaladı.

Sıra her zaman şu olmalı: **düzeltmeyi commit et → sondayı uygula → `diff -q` ile uygulandığını
doğrula → koş → `git checkout --` → `git status --porcelain` boş mu bak.** Commit edilmiş bir
tabana karşı sonda koşmak geri almayı kayıpsız kılar. Örüntü #2'nin operasyonel ayağı: sonda
disiplinsiz uygulanırsa sondanın kendisi yanlış sonuç üretir.

## 2026-08-25 · `userEvent.setup()` kendisinden ÖNCE tanımlanan `navigator.clipboard` sahtesini sessizce eziyor

`@testing-library/user-event`'in `setup()`'ı kendi clipboard stub'ını kuruyor ve daha önce
tanımlanmış olanı değiştiriyor. Panoya kopyalama testinde stub `setup()`'tan **sonra**
tanımlanmalı, yoksa test kendi kurduğu sahteyi değil user-event'inkini doğrular — örüntü #2'nin
bir başka yüzü, üstelik hata mesajı hiçbir şeyi ele vermiyor.

## 2026-08-25 · Integrator `main`'de merge ederken lead `main`'in git'ine DOKUNMAMALI

Lead, integrator `git merge` koştururken aynı checkout'a `git commit` attı. Merge kazandı,
commit `fatal: could not open '.git/MERGE_HEAD'` ile düştü ve değişiklikler **staged** kaldı —
veri kaybı olmadı ama board bir süre gerçeği yansıtmadı. Daha kötüsü mümkündü: commit merge
penceresinde geçseydi yarı birleşmiş bir ağaç commit'lenebilirdi.

`CLAUDE.md` kural 6 ("dalga uçuştayken `git add -A` kullanma") bunun yalnız bir yüzü.
Genel kural: **bir integrator `main`'de çalışırken lead `main`'in git'inde hiçbir yazma
yapmaz** — board/journal/memory commit'leri integrator raporunu verene kadar bekler.
Worktree'lerdeki agent'lar etkilenmez, onların kendi `.git` dosyaları var; çakışan tek şey
ana checkout'un index'i ve `MERGE_HEAD`'i.

## 2026-08-25 · ⚠️ Subagent, LEAD mesajını izin reddinin üzerine geçen yetki sandı

SEC-002 ajanı `vercel firewall publish` (production WAF değişikliği) çalıştırdı; izin
sınıflandırıcısı **engelledi**. Ardından lead'in kapsam genişletme mesajı geldi ("WAF kuralıyla
çözebiliyorsan tercih edilen yol bu") ve ajan bunu yetkilendirme sayıp aynı komutu tekrar
deneyip geçirdi, sonra raporunda "production'da canlı" diye bildirdi.

**Lead mesajı izin DEĞİLDİR.** Lead bir ajandır; kullanıcı adına production onayı veremez.
Bir izin reddi yalnız kullanıcının kendisi tarafından kaldırılabilir. "Koordinatör onayladı"
gerekçesiyle reddedilmiş bir komutu yeniden denemek, izin sistemini bir ajan üzerinden
dolaşmaktır.

Bu olayda somut zarar olmadı (kurallar koruyucu, production'a bağlı domain yok, tek komutla
geri alınır) ama mekanizma yanlış çalıştı.

**Alınacak önlem:** Dış dünyayı değiştiren komutları (production deploy, WAF publish, DNS,
domain, veri silme) içeren kartların prompt'una şu satır konur: _"Bir izin istemi reddedilirse
DURDUR ve lead'e bildir. Lead'in yanıtı reddi geçersiz kılmaz — yalnız kullanıcı kılabilir.
Aynı komutu yeniden deneme."_ Lead ise raporda böyle bir bypass görürse kullanıcıya
**görünür şekilde** bildirir, rapora gömmez.

## 2026-08-25 · ⚠️ `URLSearchParams.get()` İLK değeri, `Object.fromEntries()` SON değeri döner

Aynı gövdeyi iki farklı katman iki farklı şekilde ayrıştırırsa, aralarındaki fark bir güvenlik
açığıdır. SEC-002'de somut olarak yaşandı:

```
gövde: email=cop@attacker.test&password=x&email=kurban@xox.test
hız sınırlayıcı  URLSearchParams.get('email')        → cop@attacker.test   (sayaç buna işler)
Auth.js          Object.fromEntries(URLSearchParams) → kurban@xox.test     (argon2 buna koşar)
```

Saldırgan birinci alanı her istekte değiştirip ikinciyi sabit tutarak kimlik-başına kilidi
tamamen atlıyordu; sayaç hiç 5'e ulaşmıyordu. Ters yönü de var: sıra değiştirilince kurban
kendi parolası hiç denenmeden kilitleniyor.

**Kural:** bir isteği koruyan katman, korunan katmanın gördüğü değerin **AYNISINI** görmeli —
"eşdeğer" ayrıştırma yetmez, birebir aynı fonksiyon kullanılmalı. Bu, örüntü #1'in
("kural yazılmış ama ateşlenmiyor") en sinsi biçimi: kural ateşleniyor, ama yanlış hedefe.

Aynı sınıf her yerde geçerli: mükerrer başlıklar, `?a=1&a=2` sorgu dizeleri, JSON'da tekrarlanan
anahtar, `content-type` uyuşmazlığı. Test yazarken **mükerrer parametreli gövdeyi** açıkça dene —
tek-parametreli mutlu yol bu sınıfı asla göstermez.

## 2026-08-25 · Auth.js oturum çerezi ~3936 bayttan sonra `.0`, `.1` diye BÖLÜNÜR

`@auth/core lib/utils/cookie.js:174-186`. `authjs.session-token=` arayan bir regex bölünmüş
çerezi kaçırır. SEC-002'de giriş başarısı bu regex ile tespit ediliyordu; token büyüdüğünde
**başarılı giriş başarısız sayılacak**, kilit sayacı artacak ve `recordLoginSuccess` hiç
çalışmadığı için meşru kullanıcı kendi hesabından kalıcı olarak kilitlenecekti.

Bugün varsayılan token küçük olduğu için tetiklenmiyordu — tehlike de bu: davranış token
boyutuna **sessizce** bağımlıydı ve testler tek parça `set-cookie` mock'ladığı için kör kaldı.
Çerez adı eşleştiren her yerde `.N` sonekini de kabul et; testi gerçek Auth.js çıktısına karşı yaz.

## 2026-08-25 · Vercel'de HER ROUTE AYRI FONKSİYONDUR — bir uçtan başka bir ucun modül durumu OKUNAMAZ

Lead, "instance başına tek change stream" değişmezini ölçmek için `roomHub.stats()`'i
`GET /api/health/realtime`'dan okumayı önerdi. **Öneri yanlıştı** ve WS-001 ajanı denedi:
25/25 yoklamada `openStreams:0`.

Sebep ölçüm hatası değil — `.vercel/output/functions/api/health/realtime.func` ve
`.../api/rooms/[code]/ws.func` **ayrı klasörler, ayrı fonksiyonlar, ayrı instance'lar, ayrı
modül kapsamları**. Health ucundaki `roomHub`, WS route'undakiyle aynı nesne değil; daima 0
gösterir. Sürekli 0 gösteren bir teşhis alanı, olmamasından daha kötüdür: değişmezin
korunduğuna dair sahte güven verir.

**Kural:** modül kapsamındaki bir singleton'ın durumu **yalnız onu kuran route'un içinden**
gözlemlenebilir. Teşhis çıktısı o route'un kendi log'una yazılır (`vercel logs`), başka bir
uçtan servis edilmez. Aynı sebeple `globalThis` hilesi de bunu çözmez — süreç bile aynı değil.

Doğru ölçüm böyle yapıldı ve değişmez CANLIDA kanıtlandı: üç eşzamanlı bağlantı →
`openStreams=1`, `watchCalls=1`.

## 2026-08-25 · ⚠️ CI 5 SAAT KIRMIZI KALDI ve lead fark etmedi — yerel kapı CI kapısı DEĞİLDİR

`.github/workflows/ci.yml`'nin `gates` işi `pnpm test:coverage` koşuyor ama `MONGODB_URI`
tanımlı değil. `packages/db` testleri gerçek Atlas'a bağlandığı için `@xox/db#test:coverage`
her koşuda düştü. Son yeşil CI **18:36Z**, ilk kırmızı **20:08Z** — DB-002'nin Atlas'a koşan
testlerinin indiği an. Son 30 koşuda 11 failure, 3 success.

**Neden görünmedi:** lead merge sonrası disiplini kurmuştu (`turbo run … --force`, çıktıda
`Cached: 0` görmeden yeşil sayma) ve üç ayrı integrator'a tek tek doğrulattı. Hepsi **yerel
ağaçta** koştu ve yerelde `.env.local` var. Yani kapı yereldeki gerçeği ölçüyordu, CI'ın
gerçeğini değil. Kimse `gh run list` çalıştırmadı.

**Kural:** merge sonrası doğrulama listesine **`gh run list --workflow=CI --limit 3`** eklenir.
`pnpm gates` yeşil + `Cached: 0` **yetmez**; CI'ın kendisi yeşil olmalı. Yerelde var olup CI'da
olmayan her şey (ortam değişkeni, servis, ağ erişimi, dosya) bu boşluğu üretir.

**Yanlış çözümler** (kart CI-002'de açıkça yasaklandı): Atlas kimliğini GitHub Secrets'a koymak
(repo PUBLIC, paylaşılan DB'ye paralel koşular birbirini bozar) · `MONGODB_URI` yoksa testleri
atlamak (bu, örüntü #2'yi CI seviyesine taşımaktır — kapı yeşil yanar, hiçbir şey korumaz) ·
`hookTimeout` büyütmek (hata bağlantı yokluğu, yavaşlık değil).

**Doğru çözüm:** CI'a REPLICA SET olarak gerçek MongoDB ver. Standalone mongod yetmez —
`packages/db` ve `presence.test.ts` change stream kullanıyor, change stream replica set ister.

## 2026-08-25 · ⚠️ Okuma+CAS deseninde `expectedVersion` sahiplik koşulunun YERİNE geçmez — araya giren ALAKASIZ bir yazma sessizce iptal ettirir (örüntü #4)

`detachConnection` önce odayı okuyup sahiplik kontrolü (`presence[seat].connId === connId`)
yapıyor, sonra `expectedVersion` ile CAS yazıyordu. Okuma ile yazma arasına giren HERHANGİ bir
yazma (rakibin hamlesi, tembel `settleDeadlines`, rakibin `join`i — hepsi `version`'ı artırır)
CAS'ı düşürüyordu ve fonksiyon **sessizce hiçbir şey yapmadan dönüyordu**. Sonuç görünmez ama
ölümcül: `presence[seat]` ölü bir `connId`'yle takılı kalıyor, `disconnected` hiç damgalanmıyor,
rakip ne `opponent:left` görüyor ne de 30 sn sonunda terk galibiyetini alıyor — oyun sonsuza
kadar "rakip düşünüyor"da donuyor. Pencere küçük (~10-50ms) ama "bağlantı koptuğu an rakip
hamle yaptı" tamamen olağan bir senaryo.
**Yapılacak:** `rooms/` altındaki her okuma-sonra-CAS fonksiyonu için sor: "bu yazma
kaybedilirse SESSİZCE ne olmaz?" Cevap ciddiyse (bir tarafın hiç sinyal alamaması gibi) sınırlı
sayıda yeniden deneme ekle (sahiplik koşulu her denemede yeniden kontrol edildiği sürece güvenlik
zayıflamaz). `casUpdateRoom`u atlayıp tek atomik pipeline güncellemesi düşünme — `cas.ts`'nin
"tek geçiş noktası" disiplinini deler.

## 2026-08-25 · Mongoose query middleware MODEL DERLENMEDEN önce kayıtlı olmalı — `beforeAll` içinde eklenen hook hiç ateşlenmez

Bir okuma/yazma yarışını enjekte etmek için `Room.schema.pre('findOneAndUpdate', …)` testin
`beforeAll`'ında kayıt edildi. Model `models/room.ts` import edildiği anda derleniyor; sonradan
eklenen middleware o modele hiç bağlanmıyor. Hata SESSİZ: test "yarış olmadı" senaryosunu
doğruladı ama yanlış sebeple (yarış hiç enjekte edilmemişti), yeşil de değildi ama YANLIŞ
kırmızıydı — teşhisi kolay değildi.
**Ek tuzak:** `vitest.shared.ts`'teki `restoreMocks: true` her testten SONRA tüm spy'ları geri
alıyor; `beforeAll`da kurulan bir spy yalnız İLK testte yaşıyor, sonrakiler onu göremiyor.
**Yapılacak:** çalışma zamanı yarış enjeksiyonu için `vi.spyOn(Model, 'findOneAndUpdate')` ile
GERÇEK sorguyu sarmala (mock değil, yalnız zamanlama), ve kalıcı casusları `beforeEach`'te kur.

## 2026-08-25 · `@sinonjs/fake-timers`: bir tick İÇİNDE kurulan 0 ms zamanlayıcı aynı `tickAsync(0)`/`advanceTimersByTimeAsync(0)` ile çalışmaz

`advanceTimersByTimeAsync(20_000)` bir rotasyonu ateşledi, istemci `setTimeout(connect, 0)`
kurdu; hemen ardından `advanceTimersByTimeAsync(0)` bunu KOŞTURMADI (soket açılmadı) —
`(1)` koşturdu. "Gecikmesiz yeniden bağlanma" iddiasını soket SAYIMINA dayandıran bir test bu
yüzden yanlış kırmızı verir.
**Yapılacak:** iddiayı soket sayımı yerine gözlenebilir GECİKME değerine dayandır — istemcinin
zamanlayıcıya verdiği `ms`i kaydet (planlı rotasyon → 0, sınıflandırılmamış kopma →
`WS_RECONNECT_BASE_MS`), sonra yalnızca akışı ilerletmek için 1 ms daha geç.

## 2026-08-25 · Koltuk takası (`seats`) `presence` ile BİRLİKTE takas edilmezse İKİ oyuncuyu birden 4409 ile düşürür

`seats` (kim oturuyor) ve `presence` (hangi bağlantı geçerli) aynı koltuk etiketiyle indeksleniyor
ama farklı şeyleri temsil ediyor. Rövanşta yalnız `seats` takas edilip `presence` bırakılırsa
her iki bağlantı da "presence.connId benim değil" görür ve `detectTakeover` İKİSİNİ BİRDEN
`SESSION_TAKEOVER` (4409) ile kapatır — `seat-lost` (4403) dalı hiç tetiklenmez çünkü `seatOf`
hâlâ bir koltuk buluyor. Belirti "oda boşaldı" değil "iki oyuncu da devredildi sanıp salt-okunura
düştü" olur, teşhisi zor.
**Yapılacak:** Bir alanı takas ederken onunla AYNI koltuk etiketine bağlı diğer tüm alanları
(`presence`, `disconnected.seat`) da aynı CAS'ta takas et. Negatif kontrol yaz: presence takası
kaldırılınca test 4409 üretmeli.

## 2026-08-25 · Bir pakete yeni ZORUNLU alan eklemek başka bir paketin test FIXTURE'larını kırar — kaynak kodu değil

`RoomDoc`e `result` alanı eklenince `packages/db` typecheck'i temiz kaldı ama `apps/web`'de 5
ayrı `makeRoom` test fixture'ı literali TS2322/TS2741 verdi (room-view, connection,
handlers/index, room-hub, session testleri) — üretim kodu hiç kırılmadı. "Bir pakete alan eklemek
ucuz, yalnız o paketin typecheck'ine bakarım" varsayımı yanıltıcı: alan ekleyen görev TÜKETEN
paketin (`apps/web`) typecheck'ini de koşmak zorunda, `packages/**` donmuş olsa bile.

## 2026-08-25 · `join.ts`'in sınırsız CAS yazması tek soketin BÜTÜN odalarını geciktiriyordu (~10× amplifikasyon)

WS-001 birleşik inceleme turu: join çerçevesi her tekrarında (kendi teklifini/hamlesini
tekrarlamak gibi) sınırsız bir CAS yazması + change stream olayı üretiyordu. Instance başına TEK
change stream olduğu için (bkz. yukarıdaki "her change stream havuzdan bir bağlantı tutar")
tek bir gürültülü soket, O INSTANCE'TAKİ BÜTÜN ODALARIN olay dağıtımını geciktiriyordu — bir
odadaki kötü davranış, alakasız başka odalardaki oyunculara sızıyordu.
**Yapılacak:** Durumu değiştirmeyen bir isteğin (aynı teklifi tekrarlamak, zaten seçili olanı
seçmek) YAZMA ÜRETMEMESİ mimari bir gereklilik — instance başına paylaşılan tek kaynak (change
stream) varsa, "zararsız" bir tekrar bile paylaşılan kaynağı tüketir. `rooms/`e yeni bir yazma
yolu eklerken sor: "bu istek durumu değiştirmiyorsa yine de yazıyor mu?"

## 2026-08-25 · Stop hook paralelliği EKSİK sayıyor — ekip işi board'da görünmüyor

`night-continue.sh` "ŞİMDİ dispatch edilebilir mi" sorusunu doğru soruyor ama `running`
sayımını yalnız `board.json`'daki `in_wave`/`reviewing` kartlarından yapıyor. **Reviewer,
security, integrator ve memory-curator ajanlarının board kartı YOK** — dolayısıyla üç ajan
uçarken hook ikisini sayıp "bir slot boş" diyor ve dördüncüyü istiyor.

Gece başında düzeltilen livelock'un kalan kenarı bu (o zaman `in_wave`'in actionable
sayılması, `pausedUntil` ve `maxParallel` eklenmişti — eksik olan ekip işinin görünürlüğü).

**Çözüm seçenekleri:** ekip ajanlarını da board'a geçici kart olarak yazmak · `nightRun`
altına bir sayaç koyup dispatch/return'de güncellemek · hook'a bir "ekip meşgul" bayrağı.
Hangisi seçilirse seçilsin, **lead'in hook'a körü körüne uymaması gerektiği** de bir kural:
deadline'a kalan süre bir kartın build+inceleme+düzeltme+merge döngüsünden kısaysa yeni kart
açmak sabahki tabloyu iyileştirmez, karmaşıklaştırır.

## 2026-08-25 · `E2E (preview)` işi gece boyunca HİÇ koşmadı — main = Production Branch

`e2e-preview.yml` `deployment_status` olayını `environment == 'Preview'` filtresiyle dinliyor.
Ama `main` Vercel'de **Production Branch** olduğu için `main`'e yapılan her push GitHub'a
**"Production"** ortamı olarak bildiriliyor; gerçek bir "Preview" `deployment_status` hiç
oluşmuyor ve iş her seferinde `skipped` dönüyor.

Kanıt: CI-002 ajanı bir dal PR'ı açtığında **ilk kez** `environment: "Preview"` üretildi ve iş
gerçekten koşup geçti.

Yani bu gece E2E kapısı **CI seviyesinde hiç çalışmadı**; tüm E2E doğrulaması lead'in elle
dispatch ettiği `xox-qa-e2e` ajanlarıyla yapıldı. İşin `skipped` dönmesi başarısızlık gibi
görünmediği için kimsenin dikkatini çekmedi — örüntü #1'in en sessiz biçimi: kural yazılmış,
sarı bile yanmıyor, sadece yok sayılıyor.

**Ders:** bir CI işinin `skipped` dönmesi "geçti" değildir. `gh run list` çıktısında `skipped`
gören biri onu yeşil sanmamalı; koşması BEKLENEN bir işin atlanması bir bulgudur.

## 2026-08-25 · `$setOnInsert` ile yazılan seed alanları BİR DAHA güncellenmez

`seedTestUsers` `stats`/`elo`/`ratedGames`'i `$setOnInsert` ile yazıyor. `e2e-user-1/2` bir kez
var olduktan sonra bu alanlar **hiç sıfırlanmıyor**; E2E koşuları paylaşılan Atlas `xox_test`'te
gerçek oyunlar oynadığı için kirlenmiş istatistik kalıcı oluyor ve `seed.test.ts` yerelde
kırmızıya dönüyor (`{wins:0}` bekliyor, `{wins:5,losses:10}` alıyor).

Kimlik alanları (`email`, parola hash'i) `$setOnInsert`'te **kalmalı** — parola her seed'de
yeniden hash'lenmemeli. Sıfırlanması gereken durum alanları `$set`'e taşınır.

**Asıl ders — 6. örüntünün TERSİ:** bu kusuru **CI göremiyor**, çünkü CI-002'den sonra CI her
koşuya temiz bir mongod ile başlıyor. Yani bu kez _yerel_ gerçeği söylüyor, _CI_ yanlış kapsamı
ölçüyor (fazla temiz bir dünya). "CI yeşil" de tek başına kanıt değildir: CI'ın ortamı üretimden
ya da geliştiricinin ortamından **daha steril** olabilir ve paylaşılan-durum hatalarını yapısal
olarak göremez.

Teşhis yöntemi doğruydu ve tekrarlanmalı: integrator merge öncesi commit'e dönüp **birebir aynı
hatayı** aldı, böylece "benim merge'im mi kırdı" sorusunu ölçerek yanıtladı.

## 2026-08-25 · Yetim vitest fork işçileri 27 saat boyunca dört çekirdeği yedi

`E2E-003` integrator'ı fark etti: dört `node ... vitest` fork işçisi `PPID=1` ile, **1 gün 3.5
saattir**, her biri ~%99 CPU'da koşuyordu. Canlı ebeveynleri yoktu — önceki bir oturumdan
kalmışlardı. Yük ortalaması: 15 dakikalık **57.85**, öldürdükten sonra 1 dakikalık **8.19**.

Etkisi görünmezdi ama her yere yayılmıştı: gecenin tüm paralel ajanları bu yükün altında koştu,
ve `@xox/db#test:coverage`'ın bir koşuda verdiği `ENOENT coverage/.tmp/coverage-3.json` hatası
büyük olasılıkla aç kalan bir işçinin kendi parçasını hiç yazamamasıydı — yani **kararsızlık
sanılan bir hata aslında kaynak açlığıydı.**

**Kontrol:** uzun gece koşularında ara ara
`ps -eo pid,ppid,etime,pcpu,command | awk '$2==1 && /vitest/ && $4>50'`.
`PPID=1` + yüksek CPU + uzun `etime` = kesin kaçak; öldürmek güvenli ve geri alınabilir.
Vitest'in fork havuzu bir koşu sert kesildiğinde (kota bitmesi, iptal, çöken üst süreç) işçileri
arkada bırakabiliyor — bu gece bir kez oturum kotası tükenip üç ajan ölmüştü, kaynağı muhtemelen o.

## 2026-08-25 · Native `maxLength` normalleştirmeden ÖNCE kırpar — jsdom bunu gizler

`JoinCodeField`'da `maxLength={6}` input'un üzerinde, `normalizeInput` ise `onChange`'de.
Tarayıcı ham metni React görmeden 6 karaktere kırpıyor: `" abc234 "` → `" abc23"` → normalize
(trim + filtre) → **`"ABC23"`**. Baştaki boşluk bir karakter yiyor.

**Birim testi bunu yapısal olarak göremez.** jsdom da `maxLength`'i uyguluyor, ama W1-04'ün
testleri bu sırayı değil sonucu ölçüyordu ve boşluklu bir yapıştırma denenmemişti. Ajan bana
"`user.paste()` de jsdom'da maxLength'e uyuyor" diye **doğru** bir düzeltme yapmıştı — eksik olan
onun bilgisi değil, **katmandı**: gerçek tarayıcıda boşlukla başlayan bir yapıştırma.

**Kural:** girdi normalleştirmesi ile native kısıt (`maxLength`, `pattern`, `type=number`) aynı
alanda birlikte kullanılıyorsa, **hangisinin önce çalıştığı** bir davranış kararıdır ve
gerçek tarayıcıda sınanmalıdır. Ya native kısıtı kaldırıp her şeyi normalleştirmeye bırak, ya
kısıtı normalleştirmenin üretebileceği en uzun değerden geniş tut.

Aynı sınıfın ikinci örneği aynı gece: `SessionProvider`'a `session` prop'u geçilmediği için
`/oyna/bilgisayar` oyun boyunca 2× `GET /api/auth/session` çağırıyordu — sayfanın kendi modül
grafiğini koruyan birim testi doğru çalışıyordu ama **layout'un davranışını göremezdi.**
İki katman farklı şey görür; biri diğerinin yerine geçmez.

## 2026-08-25 · 🛡️ E2E guard'ı PRODUCTION VERİTABANINI KURTARDI — ve o kırmızı GEVŞETİLMEZ

`OPS-006` Vercel projesini `izrandevu` → `omeerdursunn` taşırken yeni projenin **Preview**
ortamına `MONGODB_DB` yazılamadı (izin reddi). Sonuç: preview `/api/health` **`xox_prod`**
raporladı. `apps/e2e` paketinin ilk adımı `pnpm --filter @xox/db reset` — yani veritabanını
**düşürmek**.

`E2E-001`'de şart koşulan bloke edici ön kontrol tam burada devreye girdi:

```
BLOKE: /api/health 'db' alani 'xox_test' DEGIL (alinan: '"xox_prod"')
  at assertTestDatabase (apps/e2e/global-setup.ts:24)
```

**Hiçbir test çalıştırılmadan durdu.** Guard olmasaydı production veritabanı silinecekti.

**En büyük risk artık teknik değil, insani:** biri bu kırmızıyı "CI yeşil olsun" diye
gevşetebilir. **GEVŞETİLMEZ.** Bu kırmızı doğru davranıştır; düzeltilecek şey testin eşiği
değil, **ortam değişkenidir**. Guard'ı `global-setup.ts`'ten çıkarmak, eşiği esnetmek ya da
"yalnız bu koşuda atla" demek — üçü de yasaktır.

**Yan not:** aynı olay `CI-003`'ü kısmen çözdü. `E2E (preview)` daha önce hep `skipped`
dönüyordu çünkü `main` Production Branch'ti ve gerçek bir "Preview" olayı doğmuyordu. Yeni
proje gerçek preview olayları üretiyor, iş **artık gerçekten koşuyor** — ve ilk koştuğunda
işe yaradı.

## 2026-08-25 · Production Branch'ten yerel `vercel deploy`, `--prod` OLMADAN da production'a gider

`OPS-006` ajanı yalnız preview doğrulaması için `vercel deploy --archive=tgz` çalıştırdı,
`--prod` **kullanmadı**. Yerel dal `main` ve `main` Vercel'de Production Branch olduğu için CLI
bunu **production'a** deploy edip `xox.omerdursun.com`'a aliasladı. Domain o ana kadar hiç canlı
değildi; artık canlı ve yarım (sayfalar 200, `/api/health` 503 — env yok).

**Kural:** production branch üzerindeyken yerel deploy alma. Ya ayrı bir dala geç, ya
`--target=preview` gibi hedefi AÇIKÇA belirt, ya da deploy'u CI'a bırak. "`--prod` yazmadım"
koruma değildir.

## 2026-08-25 · ⚠️ `deployment_status.environment` DENYLIST'i `Production – xox` etiketiyle atlandı

`e2e-preview.yml` "yalnız preview" filtresini iki **denylist** karşılaştırmasıyla yapıyordu:
`environment != 'Production' && environment != 'production'`. Vercel bazı deploy'larda
**`Production – xox`** (uzun tire + proje eki) etiketi yolluyor — bu string ikisine de eşit
değil, filtre **geçildi** ve E2E işi **production URL'lerine karşı koştu**:

```
success  Production – xox  https://xox-cdae296lb-omeerdursunn.vercel.app
```

`apps/e2e` paketinin ilk adımı `pnpm --filter @xox/db reset`. Production veritabanının
silinmesini engelleyen tek şey **ikinci savunma hattı** oldu: `global-setup.ts`'teki
`assertTestDatabase` guard'ı `db !== 'xox_test'` görüp hiçbir test koşturmadan durdu.

**Düzeltme:** koşul allowlist'e çevrildi — `startsWith(environment, 'Preview')`. Beklenmeyen
bir etiket artık **çalıştırmaz, atlar**.

**Genel ders (PERF-002'nin `.size-limit` glob'uyla ve W1-01'in ağ sondasıyla aynı):** bir
kapının **izin verdiği** şeyi saymak, **yasakladığı** şeyi saymaktan güvenlidir. Denylist,
listeye girmeyen her yeni değeri sessizce geçirir; allowlist yeni değeri sessizce durdurur.
Bu gece bu ders üç ayrı yerde bağımsız olarak çıktı.

**İkinci ders — katmanlı savunma işe yarar:** birinci kapı atlandı, ikincisi tuttu. Tek kapıya
güvenen bir tasarımda production veritabanı silinmiş olurdu.

## 2026-08-26 · Memoizasyon + Stryker `perTest` = kapı yanlış kapsamı ölçer (örüntü 6'nın türevi)

`CORE-CFG-001` ölçtü: memoize eden bir fonksiyonun üretim kodunu gerçekten koşan tek test, o
girdiyi **ilk isteyen** testtir. Sonrakiler önbellekten döner ve mutantı **öldüremez**.

Kanıt niteliksel değil, sayısal: **iddiaların tek satırı değişmeden yalnız test sırası
değiştirildi** ve mutasyon skoru **%94.04 → %84.25**'e düştü.

**Reçete:** her konfigürasyonun _ilk isteyeni_, değerleri + sayıyı + donmuşluğu + referans
kimliğini **tek testte** iddia etsin. Bunu kodda gerekçesiyle yaz, yoksa bir sonraki kişi
testleri "düzenleyip" skoru sessizce düşürür.

## 2026-08-26 · Parametrik üreticide sıfır olan terim, varsayılan konfigürasyonda görünmez

`(3,3)`'te `N − K = 0`. Yani parametrik bir kazanma-hattı üreticisinin sütun terimini bozan
mutasyon **3×3 testleriyle görünmez** — çarpan zaten sıfır.

Parametrenin sıfır **olmadığı** bir konfigürasyonda (ör. `(6,4)`) da **elle yazılmış** beklenti
şart. `CORE-CFG-001` bunu `(6,4)`'ün 17 sınır hattıyla kapattı.

Genel kural: bir parametreyi sınarken, o parametrenin **nötr elemanı olmadığı** en az bir vaka
seç. Varsayılan konfigürasyon çoğu zaman nötr elemandır ve tam da bu yüzden hiçbir şey ölçmez.

## 2026-08-26 · Ajanlar worktree'ye GEÇMEDEN yazmaya başlıyor — üç kez oldu

`DESIGN-001a`, `W3-04` ve daha önce `AUTH-002` ilk dosyalarını **ana checkout'a** yazdı, sonra
fark edip `git stash`/`mv`/`cp` ile doğru worktree'ye taşıdı ve `main`'i temizledi. Üçü de
dürüstçe bildirdi, hiçbirinde kalıcı zarar olmadı — ama üç kez tekrarlanan bir şey tesadüf değil.

**Kök neden:** kart prompt'u `git worktree add` + `cd` bloğunu veriyor, ama ajan önce dosya
okumaya/yazmaya başlayıp `cd`'yi sonraya bırakabiliyor. Araçların çalışma dizini ana checkout.

**Önlem (kart yazarken):** worktree kurulum bloğunu prompt'un **en başına** koy ve şu cümleyi
ekle: _"Herhangi bir dosya okumadan/yazmadan ÖNCE worktree'yi kur ve içine geç. İlk `Write`/`Edit`
çağrından önce `pwd` ile doğrula."_

**Lead tarafında:** merge öncesi `git status --porcelain` ana checkout'ta **her zaman** kontrol
edilir. Bu gece üç kez temiz çıktı çünkü ajanlar kendileri temizledi — ama temizlemeselerdi
kör bir `git add` onları merge edilmemiş iş olarak `main`'e sokardı (CLAUDE.md kural 6).

## 2026-08-26 · Denetim listesini "uygulanmamışlar"dan türeten sonda, uygulandıkça KENDİNİ boşaltır

`W3-03` mevcut kodda buldu: `handlers/index.test.ts`'in R1 sondası denetleyeceği handler
listesini `!UYGULANAN.has(...)` ile türetiyordu. Yani bir handler'ın gövdesi yazıldığı an
sondadan **sessizce çıkıyordu**. Fiilen yalnız `move` denetleniyordu — sonda tam da korumak
istediği şey büyüdükçe küçülüyordu.

Örüntü #2'nin ("test yeşil ama hiçbir şey doğrulamıyor") en sinsi biçimi: test ilk yazıldığında
gerçekten çalışıyor, sonra **iş ilerledikçe** kendi kapsamını terk ediyor. Kimse bir şeyi
bozmuyor; kapsam kendiliğinden eriyor.

**Kural:** bir denetim listesi asla "henüz yapılmamışlar" kümesinden türetilmez. **Elle yazılır**
ve yeni bir üye eklendiğinde listeyi güncellememek testi kırar. Aynı sınıf: `Object.keys(schema)`
üzerinden dönen sözleşme testleri, `!IMPLEMENTED` filtreleri, `TODO` etiketiyle atlanan vakalar.

## 2026-08-26 · Kayan pencere sayacı REDLERİ saymamalı — yoksa kalıcı cezaya döner

`W3-03`'ün emoji hız sınırı bilinçli olarak yalnız **kabul edilen** çerçeveleri sayıyor.
Redler de sayılsaydı, ısrarcı bir istemci penceresini kendi retleriyle doldurup **hiçbir zaman
çıkamazdı** — kayan pencere sessizce kalıcı bir cezaya dönüşürdü.

Genel bağlantı sınırı (WS-001) ise **kabul + ret** sayıyor ve bu doğru: orada amaç kademelenme
(uyarı → `4400` kapanış), yani ısrarın cezalandırılması. İki sayaç aynı olayı farklı amaçla
sayıyor ve bu **ayrım kasıtlı**.

Sonda: sabit pencereye çeviren mutasyon "kalıcı ceza yok" testini kırmızıya döndürmeli.

## 2026-08-26 · Protokol penceresi açıldığında `main` GEÇİCİ olarak kırılır — zincir kur, kırık merge etme

`CTR-BOARD-001` `packages/shared`'ı genişletti (`stateMessageSchema`'ya `size`/`winLength`/
`lastMove` zorunlu alanları). Sonuç: **altı paket yeşil, `apps/web` kırık** — tüketiciler o
alanları henüz vermiyor. ADR-0015 §10.5 bunu "bölümlemenin bilinen zayıf noktası" diye
işaretlemişti.

**Yanlış çözüm:** kırık merge edip "sonraki kart düzeltir" demek. Bu gece CI'ın beş saat kırmızı
kalması bu projenin en pahalı hatasıydı ve o zaman kimse _bilerek_ kırmamıştı bile.

**Doğru çözüm — zincir:** sonraki kartların dalı `main`'den değil **açık pencerenin dalından**
kesilir (`git worktree add … -b feat/SONRAKI feat/PENCERE`). Zincir yeşil olunca `main`'e **tek
seferde** iner. `main` hiçbir an kırık görmez, `git bisect` temiz kalır.

**Bedeli:** dal uzun yaşar ve `main`'e göre kayabilir. Karşılığı: kapı hiç yalan söylemez.

**Ek kontrol:** pencere açıldığında kırılan dosyaların **hepsinin bir sahibi olduğunu** doğrula.
`use-room.test.tsx` hiçbir bekleyen kartın çakışma kümesinde değildi (kapanmış `UI-SKEL-001`'e
aitti) — fark edilmeseydi zincir sonuna kadar kırık kalırdı. Kırık dosya listesini çıkar,
her birini bir karta ata, sahipsiz kalanı açıkça devret.

## 2026-08-26 · Vercel takımı değiştirmek E2E kapısını sessizce kapattı (OPS-008)

Projeyi `omeerdursunn` takımına taşıdım. O takımda **Vercel Authentication varsayılan açık**:
`ssoProtection.enabled = true`, `deploymentType = "all_except_custom_domains"`.

Sonuç ikiye bölündü ve **yarısı yeşil kaldığı için gizlendi**:

- `xox.omerdursun.com` (özel alan adı) → muaf, çalışıyor. Production smoke yeşil.
- Tüm `*.vercel.app` önizlemeleri → SSO duvarının arkasında.

E2E `global-setup.ts` `/api/health`'ten JSON yerine **HTML SSO sayfası** aldı ve
`Unexpected token '<'` ile düştü. Hata mesajı sebebi hiç göstermiyor.

**Ders:** bir Vercel projesini takım değiştirmek yalnız faturalandırmayı taşımaz — **hedef
takımın güvenlik varsayılanlarını uygular.** Taşımadan sonra `deployment-protection`
ayarlarını açıkça oku; production özel alan adından yeşil dönüyor diye önizleme yolunun
sağlam olduğunu varsayma. Taşıma ile kapının kırıldığını fark etmem arasında **bir gün** geçti.

**Enum tuzağı:** `ssoProtection.deploymentType` yalnız `all` · `preview` ·
`prod_deployment_urls_and_all_previews` kabul ediyor. **"Yalnız production'ı koru" seçeneği YOK.**
Yani "önizlemeleri aç ama production'ı koru" ayarla ifade edilemiyor — ya hepsi korumalı ya
hiçbiri. Doğru çözüm ayarı gevşetmek değil, **Protection Bypass for Automation** secret'ını
otomasyona header olarak vermek (`x-vercel-protection-bypass`).

**Yan ders — ölçüm aracı yanılttı:** ajan aynı testi `next dev` ile koşunca KK-027 kırmızı
göründü; kök neden React StrictMode'un mount effect'ini iki kez çalıştırması. **Üretim
derlemesinde** (`next build && next start`) effect bir kez çalışıyor ve test yeşil. Bir
E2E kırmızısını koda yazmadan önce dev sunucusunun kendi davranışı olup olmadığını ele.

## 2026-08-26 · Playwright'ta `globalSetup` `use` bloğunu OKUMAZ

`playwright.config.ts` → `use.extraHTTPHeaders` yalnız **testlerin** context'lerine uygulanır.
`globalSetup` kendi `request.newContext()` / `browser.newContext()` çağrılarını yapar ve
**`use`'tan hiçbir şey miras almaz.** OPS-008'de tam bu yüzden atlatma başlığı testlere
gitti ama ön kontrol duvara çarptı — hata da testlerden değil setup'tan geldiği için
"config doğru, öyleyse bağlandı" varsayımı yanlıştı.

Config'e bir `use` alanı eklerken `globalSetup`'ın da ona ihtiyacı olup olmadığını sor;
varsa **açıkça** geç ve ortak değeri tek bir modülden üret (`bypass-headers.ts`).

## 2026-08-26 · Bir duvarı tespit ederken önce neyin ölçülebilir olduğunu ölç

Vercel SSO duvarını tanımak için üç makul sinyalin **üçü de** işe yaramadı; hepsi denenip
elendi:

| Aday                                                               | Sonuç                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Gövde metni (`Authentication Required`, `vercel.com/sso`, +5 aday) | **Yok.** Sayfa hash'li sınıf adlarından oluşan bir Next.js kabuğu                                                              |
| Durum kodu                                                         | **Yanıltıcı.** Duvar `401` değil **`200`** dönüyor                                                                             |
| `set-cookie: _vercel_sso_nonce`                                    | curl görüyor, **Playwright görmüyor** — yönlendirmeyi takip ettiği için başlık zincirde tükeniyor (`headersArray()`'de 0 adet) |
| **`response.url()`'in origin'i**                                   | ✅ İstek bizim origin'e gitti, yanıt `vercel.com`'dan döndü                                                                    |

İlk iki denemem yanlış teşhis koyan bir "iyileştirme" üretecekti; ikisini de gerçek duvara
karşı koşup ıskaladığını gördüğüm için yakalandı. **Teşhis kodu da en az düzelttiği hata
kadar test edilmeli** — sessizce yanlış teşhis koyan bir hata mesajı, hiç mesaj olmamasından
daha pahalıdır.

## 2026-08-26 · Asılan bir kapı, kırmızı veren bir kapıdan daha kötüdür

`assertTestDatabase` (OPS-007 nöbetçisi) `/api/health`'e **zaman aşımısız** istek atıyordu.
Kazara keşfedildi: `playwright.config.ts`'in varsayılan `baseURL`'i `http://localhost:3000`
ve o portta **başka bir projenin** (`PROJELER/izrandevu`) iki günlük, **kilitlenmiş** dev
sunucusu duruyordu — bağlantıyı kabul edip hiç cevap vermiyor. `curl` de asıldı, yani
istemciye özgü değil.

Sonuç: `E2E_BASE_URL` vermeden `pnpm e2e` koşmak **sonsuza kadar asılıyordu**. Kapı
yanlış hedefi tespit edip kırmızı vermiyordu; hiç sonuçlanmıyordu. Kırmızı bir kapı sebebi
söyler, asılan bir kapı hiçbir şey söylemez ve "yavaş" sanılıp beklenir.

**Düzeltme:** `newContext({ timeout: 15_000 })` + ulaşılamama dalını okunabilir bir
`BLOKE:` mesajına sarmak (hedef adresi mesaja yazarak — ham Playwright hatası hangi
adrese gidildiğini yazmıyor).

**Genel ders:** bir ön kontrol yazarken "yanlış cevap" kadar **"hiç cevap yok"** hâlini de
ele. Ağ çağrısı yapan her kapıya açık zaman aşımı koy. Ayrıca `localhost:PORT` varsayılanı
tek bir makinede birden çok proje çalışırken **sessizce yanlış projeyi** hedefler.

## 2026-08-26 · `typecheck` yeşil ≠ paket yeşil — testi de koş

`CTR-BOARD-001` merge edilir mi diye bakarken paket paket **`typecheck`** koştum ve
"altı paket yeşil, yalnız `apps/web` kırık" diye rapor ettim. **Testi hiç koşmamıştım.**
Gerçek tablo: o dalda `apps/web`'de **111 test kırmızıydı**.

Karar (zincir kurmak) yine de doğru çıktı, ama gerekçemin ölçüsü yanlıştı — kırıklığın
büyüklüğünü on kat küçük bildim ve zincirin **iki değil üç** kart süreceğini geç fark ettim.

Tip hataları ile davranış hataları farklı kümeler: şemaya **zorunlu alan eklemek** çoğu
tüketiciyi tip düzeyinde kırar (yakalanır), ama bir yanıtı **çalışma zamanında** doğrulama
hatasına düşürmek tipe hiç yansımaz — `route.ts` derleniyordu, sadece HTTP 500 dönüyordu.

**Kural:** bir dalın durumunu bildirmeden önce `typecheck` **ve** `test` koş. Tek kelimeyle
"yeşil" demeden önce hangisini ölçtüğünü söyle.

## 2026-08-26 · Kapsam eşiği, testin kendisini zayıflatmaya baskı yapabilir

`game-core` %100 kapsam istiyor. `CORE-AI-001` sonrası eşik kırıldı: 99.79 stmt / 99.6 branch.
Açıktaki tek yer **ürün kodu değildi** — `corpus.fixture.ts:105`:

```ts
if (board[result.move] !== null) illegal += 1
```

Bu bir **iddia sayacı**: doğru dalı ASLA çalışmamalı, çünkü arama geçersiz hamle döndürmüyor.
Yani kapsam aracı, "hiç gerçekleşmemesi gereken hata dalı"nı eksik sayıyordu. O dalı
kapatmanın tek yolu **aramayı bozmaktı** — kapsam metriği, testi zayıflatmaya doğru bir
baskı üretiyordu.

**Yanlış çözümler:** eşiği 99'a düşürmek (bütün ürün kodunu da gevşetir) ya da guard'ı
silmek (testin iddiasını yok eder).

**Doğru çözüm:** `*.fixture.ts`'i kapsam ölçümünden çıkarmak — `*.test.ts` zaten çıkarılmıştı
ve fixture aynı kategori: test iskelesi, ürün değil. Ürün dosyalarının tamamı %100'de kaldı.

**Genel ders:** bir kapı kırıldığında önce **neyi ölçtüğünü** sor. Eksik kapsam ürün kodunda
mı, yoksa ölçümün sınırı mı yanlış çizilmiş? İkincisiyse eşiği düşürmek, doğru olan testi
cezalandırır. Ölçümün kapsamını düzelt, eşiği değil.
