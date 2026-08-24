# Tuzaklar

> Bir yaklaşımı denemeden ÖNCE burayı oku. Buradaki her satır, birinin zaman kaybetmesiyle öğrenildi.

## 2026-08-24 · Merge sonrasi lockfile yeniden uretimi TIP HATASI dogurabilir

Uc branch tek tek yesildi; birlesip `pnpm install --lockfile-only` kosulunca `@xox/db`
typecheck kirildi: `import.meta.dirname` TS-te `string | undefined` ve cozulen `@types/node`
surumu degisince daralma kayboldu. Branch-lerde gorulmez cunku her biri kendi lockfile
durumunda kalir.
**Yapilacak:** Integrator merge sonrasi lockfile-i yeniden uretip kapilari MUTLAKA yeniden
kossun — merge-in kendisi cakismasiz olsa bile. Ve `import.meta.dirname` yerine
`import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))` yaz; her surumde calisir.

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

## 2026-08-24 · `Stop` hook-u "su an harekete gecemem" durumlarini modellemeli

Hook-un tek sorusu "yapilacak is var mi" olmamali; "LEAD SU AN bu isi dispatch edebilir mi"
olmali. Uc kez ayni sinif kusur cikti ve her biri bos dongu yaratti:

1. `in_wave` gorevleri "islenebilir" saymak — agent zaten calisiyor.
2. Kota beklerken bloklamak — dispatch imkansiz (`pausedUntil` eklendi).
3. Paralellik tavani dolu iken bloklamak — yeni agent acilamaz (`maxParallel` eklendi).
   **Yapilacak:** Hook durusa izin versin; `todo`/`review` isi VARSA **ve** kapasite VARSA
   **ve** duraklama YOKSA bloklasin. Bildirim mekanizmasi lead-i zaten geri cagiriyor.

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

## 2026-08-24 · `Stop` hook'u `in_wave` görevleri "yapılacak iş" sayarsa CANLI KİLİT olur

Lead dalgayı arka plan agent'larına dispatch edip yield eder; bildirim onu geri çağırır.
Hook `in_wave`'i de "işlenebilir" sayarsa duruşu bloklar — lead yield edemez, dispatch edecek
iş de yoktur, oturum boşa döner. Yalnızca `todo` ve `review` sayılmalı.
**Yapılacak:** `in_wave` görev varsa ve dispatch edilebilir iş yoksa bayrağı koru, duruşa izin ver.
Kuru koşu bunu yakalayamaz — orada agent ön planda çalışır.

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
