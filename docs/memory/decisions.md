# Mimari kararlar

> Format: tarih · karar · bağlam · gerekçe · reddedilen alternatifler

## 2026-08-24 · `move:rejected` tahtaya DOKUNMAZ (spec'ten bilinçli sapma)

**Bağlam:** Spec §5.6 `move:rejected` gelince "hücreyi boşalt" diyordu.
**Karar:** Reducer tahtaya dokunmaz, yalnız `pending`'i temizler.
**Gerekçe:** R1 değişmezi gereği istemci kendi hamlesini sunucu yankısı olmadan tahtaya
**kalıcı yazmıyor** — taş oraya hiç konmadı. `board[index] = null` yazmak, `occupied`
reddinde (yani hücreyi RAKİBİN doldurduğu durumda) rakibin gerçek taşını silerdi.
**Reddedilen:** Spec'in literal okuması. Testle kilitlendi.

## 2026-08-24 · ✅ KARAR KAPISI GEÇİLDİ — change stream fan-out onaylandı (RT-PROBE-001)

Gerçek Vercel preview + gerçek Atlas, 5 koşu, 200 örnek, hiçbiri atılmadı:
**p50 96.2 ms · p95 98.6 ms · maks 633.6 ms** (tek soğuk başlangıç). Bütçe 1500 ms → p95
bütçenin **%6.6**'sı. Isınmış havuzda (N=175) p95 98.6 ms.

**Karar:** ADR-0002 doğrulandı. Gerçek zamanlı katman MongoDB change stream fan-out üzerine
kurulacak. **Upstash Redis pub/sub yedeği İPTAL.**

**Metodoloji bağımsız olarak doğrulandı (lead, 2026-08-24):**

- İki damga da aynı Node sürecinde `performance.now()` — monotonik tek saat, kayma yok.
- Zaman aşımına uğrayan örnek ATILMIYOR; `censored: true` ile `totalMs = timeout` alıyor,
  yani p95'i kötüleştiriyor. 200 örnekte sansür 0.
- Dinleyici yazmadan ÖNCE kaydediliyor — olay-yazma yarışı yok.
- **Gerçek oyun temposu sınandı:** 3 sn aralıklı 20 örnek → p50 96.2 · p95 100.7 · maks 100.8.
  Arka arkaya 20 örnek → p50 96.8 · p95 98.6 · maks 605.7. Sessiz bağlantıda gecikme ARTMIYOR;
  büyük maks değeri yalnızca ilk isteğin soğuk başlangıcı.

**Kapsam sınırı (dürüstlük notu):** Sonda "yazma → kendi stream-inde olay" ölçer, yani yazan
oyuncunun gördüğü süre. Karşı instance bacağı ölçülmedi; iki uçlu kanıt Dalga 0 E2E-001-in işi.
15× marj bu belirsizliği karşılıyor.

**Bölge düzeltildikten sonra yeniden ölçüldü (fra1, 25 örnek):**
**p50 5.5 ms · p95 8.7 ms · maks 69.1 ms** — iad1'den ölçülen 98.6 ms'e karşı **11× iyileşme**.
p95 artık 1500 ms bütçesinin **%0.58**'i. Teşhis doğrulandı: Atlas Avrupa'da, fonksiyonlar
Virginia'daydı. Proje `serverlessFunctionRegion` ayarı `fra1` (vercel.json'daki `regions`
Hobby/Pro'da yürümüyor — ayrı gotcha).

## 2026-08-24 · Auth.js sağlayıcısı: Credentials (e-posta + parola)

**Karar:** P0'da tek sağlayıcı — Auth.js Credentials. Parola `argon2id` ile hash'lenir,
`users.passwordHash` alanında saklanır. `/kayit` ve `/giris` ekranları var.
**Gerekçe:** Harici konsol kurulumu gerektirmez; gece koşusunda agentlar bir OAuth uygulaması
açılmasını bekleyip tıkanmaz. Web ve mobilde aynı akış, E2E girişi seed'lenmiş test
kullanıcılarıyla önemsiz.
**Reddedilenler:** Google OAuth (Google Cloud'da uygulama + redirect URI kurulumu insan eli
ister, gece bloklanır) · ikisi birden (P0 kapsamını büyütür, hesap birleştirme işi çıkarır).
**İleriye dönük:** Auth.js'te sağlayıcı eklemek `providers: []` dizisine satır eklemektir;
Google/Apple sonradan mevcut hesapları bozmadan eklenebilir.

## 2026-08-24 · Gözlemlenebilirlik: Vercel'in kendi araçları, Sentry yok

**Karar:** Vercel Analytics + Speed Insights + Runtime Logs. Sentry entegrasyonu yapılmayacak.
**Gerekçe:** Sıfır kurulum, ek vendor ve ek anahtar yok; DSN bekleyen bloklu görev kalmaz.
**Reddedilen:** Sentry (daha zengin hata takibi ama DSN gerektiriyor ve P1'i bloklardı).
**Yeniden değerlendirme:** Gerçek kullanıcı trafiği başladıktan sonra.

## 2026-08-24 · Vercel Fluid Compute WebSocket'i GERÇEK deploy'da doğrulandı ✅

`experimental_upgradeWebSocket` gerçek bir Vercel preview deploy'unda çalışıyor.
Kanıt: `wss://<preview>/api/ws/echo` bağlantısı açıldı, `merhaba` gönderildi, `echo:merhaba` döndü.
(O echo ucu 2026-08-25'te **silindi** — kimlik doğrulaması yoktu ve açık bir yansıtıcıydı; kanıt
görevi bitmişti. Yerine geçen canlı kanıt: `/api/rooms/[code]/ws` üzerinde 4401/4403/4404
kapanış kodlarının istemciye ulaşması ve R1 fan-out ölçümü.)
Aynı deploy'da `/api/health` `{"ok":true,"db":"xox_test"}` verdi — Atlas erişilebilir ve preview
ortamı doğru veritabanına bakıyor. `apps/e2e` paketinin 4 testinin tamamı preview'a karşı geçti.

**Sonuç:** Gerçek zamanlı katman WebSocket üzerine kurulacak. `decisions.md`'deki Upstash Redis
pub/sub yedeğine **gerek yok**. Change stream fan-out'u (iki oyuncunun farklı Fluid instance'ına
düşmesi durumu) hâlâ Dalga 0'da ayrıca kanıtlanmalı — echo tek bağlantıyı test eder, iki
instance arası yayını değil.

**Kritik ön koşul:** `ws` paketi `apps/web`'de doğrudan bağımlılık olmalı. `@vercel/functions`
onu opsiyonel peer yapar; kurulmazsa çalışma anında `The "ws" package is required` fırlatır ve
bu kolayca "Vercel WS desteklemiyor" diye yanlış okunur.

## 2026-08-24 · Instance-arası WS yayını MongoDB Change Streams ile

**Bağlam:** İki oyuncu farklı Fluid Compute instance'ına düşebilir; bir instance'taki
WebSocket handler diğerine doğrudan mesaj gönderemez.
**Karar:** Her WS bağlantısı, odanın `rooms` dokümanı üzerinde koda filtreli bir change stream'e
abone olur. Sunucu otoriterdir; hamle önce dokümana yazılır, yayın stream'den gelir.
**Reddedilenler:** Upstash Redis pub/sub (ek vendor + maliyet) · sticky routing (Vercel garanti etmiyor).
**Yedek:** Change stream gecikmesi kabul edilemezse Redis pub/sub'a geçilir. Kararı Dalga 0 verir.

## 2026-08-24 · Workspace paketleri derlenmez, kaynak dışa verilir

**Karar:** `packages/*` `exports: { ".": "./src/index.ts" }` kullanır; Next `transpilePackages`,
Metro workspace çözümlemesi ile tüketir.
**Gerekçe:** Gece koşusunda paralel agentların build zincirini beklemesini ortadan kaldırır.
**Reddedilen:** tsup/tsc ile önden derleme — her değişiklikte `^build` bariyeri.

## 2026-08-24 · Lead ana oturumda, subagent değil

**Karar:** Orkestrasyon ana oturumda kalır; 18 agent yalnızca dispatch edilir.
**Gerekçe:** İç içe subagent dispatch'i kırılgan; lead worktree/dalga/board state'ini kaybetmemeli.

## 2026-08-24 · Taşıma katmanı "neden kazandın" bilgisini `shared`'da taşır, `game-core`'a sızdırmaz (ARCH-001)

**Karar:** `line: WinLine | null` + `reason: EndReason` `shared`'da AYRI bir taşıma tipi;
tutarlılık `superRefine` ile (`reason === 'line'` ⟺ `line !== null`). `game-core`'un
`GameStatus` tipi DEĞİŞMEDİ. Tek yönlü köprü: `toTransportStatus` + `forfeitStatus`.
**Gerekçe:** Motor pes etme/zaman aşımı kavramını bilmez ve bilmemeli — %100 kapsam ve %98.56
mutasyonlu sertleştirilmiş bir paket ürün kavramı için açılmaz. `reason` ayrıca `tr.game`'deki
dört ayrı Türkçe sonuç metnini (youWon/wonByResign/wonByTimeout/wonByAbandon) ayırt etmenin
tek yolu.
**Reddedilenler:** `game-core`'a `reason` eklemek (ürün mantığı motora sızar) · `line: []` boş
dizi konvansiyonu (yazılı olmayan bilgi, kontrol her tüketiciye dağılır) · sebebi yalnız
`game:over` mesajında taşımak (yeniden bağlanan istemci o mesajı kaçırır, yalnız `state` alır →
sonuç metni yanlış çıkar).

## 2026-08-24 · CI, `ensureIndexes()`'i HTTP route ile değil doğrudan CLI ile çağırır (OPS-003)

**Karar:** İki çağıran ayrıştı: (a) `packages/db/src/migrate.ts` — CI runner'ından doğrudan
çağrı, HTTP/DNS/TLS yok; `e2e-preview.yml` her preview deploy'undan sonra
`pnpm --filter @xox/db migrate` koşturuyor. (b) `POST /api/admin/migrate` — YALNIZ production
runbook'u (`MIGRATION_SECRET` başlığı + `?db=` pozitif doğrulama, bkz. `api-contract.md`).
**Gerekçe:** İlk turda route hem CI'dan hem production'dan HTTP ile çağrılıyordu. Güvenlik
denetimi: workflow dosyası default branch'ten okunur ama deploy edilen kod PR head'idir — PR
yazarı sırrı çalabilir, workflow zaten yanıtı public Actions log'una basıyordu. CI zaten
`MONGODB_URI` sırrına sahip; aynı yetkiyle `ensureIndexes()`'i doğrudan çağırmak sızıntı
yüzeyini küçültmek yerine YOK EDİYOR.
**Reddedilen:** Route'u CI'dan HTTP ile çağırmaya devam edip sır rotasyonu/kısa ömürlü token
gibi azaltıcı önlemler eklemek — kökten çözüm dururken yüzeyi küçültmek tercih edilmedi.

## 2026-08-24 · SEC-003: indeks çakışmasında "mükerrer-tarama + telafili düşür/kur", "boşluksuz takas" DEĞİL (OPS-003)

**Karar:** `unique` istenirken önce mükerrer değer taranır (ihlal varsa eski indekse
dokunulmaz, anlaşılır hata döner); temizse düşür + kur; ikinci kurma da patlarsa eski indeks
ORİJİNAL seçenekleriyle geri kurulur.
**Gerekçe:** Önerilen "boşluksuz takas" (yeni indeksi farklı adla kur, başarılıysa eskisini
düşür) canlı Atlas'ta REDDEDİLDİ — kanıt: `docs/memory/gotchas.md` "Mongo aynı anahtara ikinci
indeksi ADA BAKMAKSIZIN reddeder". Gerçek çalışan tasarım denenerek bulundu.
**Reddedilen:** Boşluksuz takas (canlıda çalışmıyor) · sessiz `syncIndexes()` (drop+create,
üretim yolunu maskeler, ayrı gotcha).

## 2026-08-24 · Kopma toleransı: 30 sn grace + ikinci bağlantı = devralma (SPEC-001)

**Karar:** Rakip kopmasında 30 saniyelik grace (`DISCONNECT_GRACE_SECONDS`); süre dolunca kalan
oyuncu `abandon` sebebiyle kazanır, ikisi de bağlı değilse HİÇBİR sonuç yazılmaz (oda TTL ile
silinir — sonucu yazacak otorite bağlı bir istemci olmalı). Aynı kullanıcının ikinci bağlantısı
takeover'dır: eski bağlantı `SESSION_TAKEOVER` ile kapatılır ve otomatik yeniden bağlanmayı
DENEMEZ — koltuk sahipliği userId'ye aittir, bağlantıya değil.
**Gerekçe:** 30 sn mobil ağ geçişini (wifi→LTE) kurtaracak kadar uzun, terk edilen oyuncuyu
bekletmeyecek kadar kısa.
**Reddedilenler:** Anında hükmen mağlubiyet (tek bir tünel kesintisi oyunu kaybettirir) · 60 sn
(hamle süresiyle aynı sabit ama terk edileni iki kat bekletir).

## 2026-08-24 · Vercel CLI worktree kurulumunda `-y/--yes` değil `-L/--local` (OPS-002)

**Karar:** Gece koşusu script'leri `vercel link -L` / `vercel pull -L` kullanır.
**Gerekçe:** `-y` yalnız promptları otomatik onaylar ama hâlâ bir Vercel projesine bağlanmayı
DENER (API çağrısı, `.vercel/project.json` oluşturma) — ağ erişimi yoksa ya da proje eşleşmesi
belirsizse gece koşusunda kırılgan kalır. `-L/--local` hiçbir Vercel API çağrısı yapmadan,
proje bağlı olsun olmasın deterministik çalışır.
**Reddedilen:** `-y/--yes` — hâlâ ağ bağımlı, hâlâ proje eşleştirme belirsizliği taşıyor.

## 2026-08-25 · `GET /api/rooms/[code]` kimlik ister — anonim değildir (ROOM-API-001)

**Karar:** Oda özeti uç noktası `resolveIdentity` ile kapatıldı; kimliksiz istek 401
`UNAUTHENTICATED` alır. Kimlik kontrolü **kod doğrulamasından ÖNCE** koşar, böylece kimliksiz
çağıran "bu kod geçerli formatta mı" bilgisini bile öğrenmez. Bilet (`allowTicket`) burada da
geçmez — yalnız WS upgrade'inde geçerli.
**Gerekçe:** Yanıttaki `seats` iç `userId` + görünen ad taşıyor ve o `userId`,
`friendRequestBodySchema`'nın birebir kabul ettiği değer. Sızmış tek bir oda kodu, anonim bir
tarafa hedeflenebilir kimlik veriyordu. Kapatmanın davet akışına maliyeti sıfır: hesap zaten
zorunlu, davet linkini açan kişi katılmadan önce nasılsa giriş yapıyor. Tasarım §7 tablosu bu
uç için kimlik şartı belirtmiyordu — boşluk lead kararıyla dolduruldu.
**Reddedilen:** `userId`'yi anonim projeksiyondan düşürmek — `roomStateResponseSchema`'yı
değiştirmeyi gerektiriyor, `packages/shared` CTR-001'de DONDU, ayrı görev + unfreeze demekti;
üstelik görünen adı yine sızdırıyordu.
**Not:** Uç noktayı bugün hiçbir istemci çağırmıyor (tüketici sondası: `JoinCodeField` doğrudan
`/oda/[kod]`e push ediyor, `use-room` doğrudan WS'e bağlanıyor) — yani kapatmanın kırdığı bir
akış yok.

## 2026-08-25 · Kök layout tema çerezi okur — tüm rotalar dinamik (UI-SKEL-001)

**Karar:** `app/layout.tsx` `resolveTheme()` → `cookies()` çağırıyor; sonuç olarak `next build`
çıktısında 13 rotanın hepsi dinamik (ƒ), hiç dinamik verisi olmayan `/giris` ve `/kayit` dahil.
Bilinçli kabul ediliyor, geri alınmıyor.
**Gerekçe:** Uygulama zaten baştan sona zorunlu hesap arkasında — rotaların ezici çoğunluğu
nasılsa dinamik. Temanın SSR'de doğru çözülmesi tema yanıp sönmesini (FOUC) önlüyor; alternatif
her yüklemede yanlış temayla boyanıp istemcide düzeltmek olurdu. `/giris` + `/kayit`'ın statik
CDN önbelleğini kaybetmesi bu iki sayfa için kabul edilebilir maliyet.
**Reddedilen:** Tema okumasını Suspense sınırındaki küçük bir sunucu bileşenine indirip statik
kabuğu korumak — iki sayfa için kök layout'a Suspense karmaşıklığı eklemeye değmez.
**Geri dönüş yolu:** Ölçülen bir maliyet çıkarsa (Vercel fonksiyon çağrısı hacmi) reddedilen
seçenek hâlâ geçerli; `layout.tsx` dondurulmuş dosya olduğu için ayrı bir kart gerekir.

## 2026-08-25 · `rooms` dokümanına `result` alanı eklendi — sonuç `games`ten değil `rooms`tan okunur (W1-02)

**Karar:** Pes/süre-aşımı/terk sonucunun kazananı `RoomDoc.result: RoomResult { kind, winner,
line, reason }` alanına, `state:'finished'` ile AYNI CAS'ta yazılır. `apps/web/lib/game/room-view.ts`
önce `result`i okur (varsa `transportStatusSchema` ile doğrulanıp döner), yoksa tahtadan
`evaluateStatus` (yalnız normal biten/berabere oyun), o da yoksa gürültülü bir `console.error` +
`{kind:'draw'}` düşer — üçüncü dal artık gerçekten ulaşılamaz ama sessiz değil.
**Gerekçe:** Canlı katman yalnız `rooms`u görüyor (change stream odayı taşır, `state` mesajı
odadan üretilir); sonuç tahtadan hesaplanamaz (pes/terk/süre aşımında tahta "bitmiş" görünmez).
Aynı CAS'ta yazmak, iki ayrı yazma arasına bir change stream olayının düşüp istemcinin bir an
"kazananı olmayan bitmiş oyun" görmesini engelliyor.
**Reddedilen:** Sonucu `games`ten okumak — `apps/web` odayı change stream'den alıyor, her olayda
ikinci bir `games` sorgusu R1'i (tek okuma kaynağı) bozar ve instance başına tek stream
bütçesine (M0'da 100 işlem/sn) ek Atlas işlemi bindirirdi.
**Yan etki:** `RoomDoc`e zorunlu alan eklemek `apps/web`de 5 test fixture'ını kırdı (bkz.
gotchas.md) — paket sınırları donmuş olsa bile tüketen paketin typecheck'i koşulmalı.

## 2026-08-25 · Rövanşta koltuk (`seats`) VE bağlantı geçerliliği (`presence`) BİRLİKTE takas edilir (W1-02)

**Karar:** `startRematch` koltuk sahipliğini takas ederken `presence` ve `disconnected.seat`i de
aynı CAS'ta takas eder.
**Gerekçe:** Koltuk sahipliği `seats[*].userId`ye, bağlantı geçerliliği `presence[seat].connId`ye
bakıyor — ikisi aynı koltuk etiketiyle indeksleniyor ama farklı şeyi temsil ediyor. Yalnız
`seats` takas edilseydi iki oyuncu da kendi YENİ koltuğunda "başka bir bağlantı" görür ve
`detectTakeover` İKİSİNİ BİRDEN 4409 ile kapatırdı — rövanş her seferinde iki tarafı da düşürürdü.
**Reddedilen:** Yalnız `seats`i takas edip `presence`i sonraki bir reconnect'e bırakmak — kısa
süreli de olsa her rövanşta iki oyuncuyu birden oturumdan düşürüyor, kabul edilemez.

## 2026-08-25 · Durum değiştirmeyen istekler (tekrar teklif, aynı teklifi kabul) YAZMA ÜRETMEZ (W1-02 + WS-001)

**Karar:** `rematch` teklifini tekrarlamak ya da kendi teklifini kabul etmeye çalışmak gibi
durum değiştirmeyen istekler `rooms`a hiçbir CAS yazması üretmez.
**Gerekçe:** Instance başına TEK change stream var (bkz. gotchas "her change stream havuzdan bir
bağlantı tutar"); WS-001'in birleşik inceleme turu `join` çerçevesinde tam bu sınıftan bir hatayı
(~10× yazma amplifikasyonu) blocker olarak buldu — tek gürültülü soket, o instance'taki BÜTÜN
odaların olay dağıtımını geciktiriyordu. Aynı riski taşıyan her yeni yazma yolu için aynı kural
uygulandı.
**Reddedilen:** Her isteği koşulsuz yazmak ve "zaten aynı değer" idempotansına güvenmek — CAS
kendisi ucuz olsa bile paylaşılan change stream'in olay hacmini gereksiz büyütür.

## 2026-08-25 · `ConnectionBadge` `data-durum` DÖRT değer yazar — spec §2.0'ın üçlü tablosu genişletildi (W1-03)

**Karar:** `data-durum` artık `bagli` / `kopuk` / `bekliyor` / `devredildi` (dört değer). Kaynak
spec §2.0'ın üçlü tablosu bu haliyle GERİDE KALDI, `docs/memory/api-contract.md` güncel kaynak.
**Gerekçe:** İskelet `devredildi`yi `kopuk`a eşliyordu ve bir test bunu YANLIŞLIKLA kilitliyordu.
Bu eşleme davranışı TAM TERS olan iki durumu tek DOM değerine sıkıştırıyor: `kopuk` → üstel geri
çekilmeyle yeniden bağlan + "Tekrar dene" göster; `devredildi` → hiçbir yeniden bağlanma
denenmemeli, düğme yok (sonsuz takeover savaşını önler). Ayrım DOM'a yazılmazsa E2E "yeniden
bağlanma denenmedi"yi ekrandan hiç doğrulayamaz.
**Reddedilen:** Mevcut üçlü tabloyu korumak — iki farklı davranışı aynı görünür duruma
sıkıştırmak, hem kullanıcıyı (yanlış "tekrar dene" beklentisi) hem E2E'yi (ayrımı gözlemleyemez)
yanıltırdı. Yanlış davranışı kilitleyen eski test, düzeltmeyle BİRLİKTE güncellendi.

## 2026-08-25 · `detachConnection` kaybedilen CAS yarışında SINIRLI sayıda yeniden dener (W1-03)

**Karar:** Okuma ile CAS yazması arasına başka bir yazma girip `expectedVersion`'ı düşürürse,
sahiplik koşulu (`presence[seat].connId === connId`) her denemede YENİDEN kontrol edilerek 3
kez yeniden denenir; hepsi tükenirse sessizce pes eder (istisna fırlatmaz).
**Gerekçe:** Sahiplik koşulu korumanın TAMAMI; `expectedVersion` yalnız `casUpdateRoom`un
tek-geçiş disiplini için var. Yeniden deneme olmadan, alakasız bir yazma (rakibin hamlesi) bu
detach'i sessizce iptal ediyordu — sonuç: terk eden taraf hiç damgalanmıyor, rakip 30 sn sonunda
kazanamıyor, oyun sonsuza dek "rakip düşünüyor"da donuyordu.
**Reddedilen:** `casUpdateRoom`u atlayıp tek atomik aggregation-pipeline güncellemesi yazmak —
`cas.ts`'nin "koşulsuz yazma yasak, tek geçiş noktası burası" disiplinini delerdi ve `cas.ts` bu
görevin çakışma kümesinde değildi.

## 2026-08-25 · Görsel yön: A — Kağıt & Mürekkep (DESIGN-001)

**Karar:** Ömer üç yön arasından **A**'yı seçti. Sıcak, minimal, hairline ızgaralı editoryal
tasarım; dekorasyon yerine boşluk ve tipografiye yatırım.
**Gerekçe (seçim Ömer'in, teknik değerlendirme burada):** A, 11×11'de **hiçbir dekoru sökmek
zorunda kalmıyor** — hairline tabanlı olduğu için yalnız ölçü küçülüyor (76→52→34 px). Bu,
boyuta göre dallanan iki ayrı görsel kod yolu riskini ortadan kaldırıyor.
**Reddedilenler:** **B (Neon Arcade)** — en yüksek vitrin etkisi ama n≥6'da köşe yuvarlama,
gölge ve parlamayı kural gereği söküyor; 121 kart gölgesi görsel çamura dönüyor. Boyuta bağlı
dekorasyon disiplini kalıcı bir bakım yükü. **C (Sistem/Veri Izgarası)** — tasarımcının kendi
önerisiydi (en az mühendislik riski, en geniş kontrast marjı, ELO/sıralamayla örtüşme) ama Ömer
A'nın tonunu tercih etti.
**Bağlayıcı kısıtlar (tasarımcının ölçtüğü, uygulamada korunacak):** 11×11'de hücre ≥28 px
(mutlak taban 24, WCAG 2.2 SC 2.5.8'in 24×24 AA eşiği) · boşluk ≥2 px · **tahta kaydırılmaz**,
ölçeklenir · kazanan çizgi renkten bağımsız ≥3 px dış çizgi + diğer hücrelerde ≥%40 opaklık
düşüşü · tüm metin token'ları ≥4.5:1, kenarlıklar ≥3:1, iki temada da.
**Not:** kontrastlar tahmin edilmedi, `contrast.ts` ile aynı WCAG formülüyle hesaplandı.

## 2026-08-28 · `dueSettlement` `apps/web`ten `packages/db`ye TAŞINDI — `game-core` değil (W2-01)

**Bağlam:** Süre aşımı/terk kararının saf hâli `apps/web/lib/game/deadlines.ts`teydi ve tek
üretim tüketicisi olacak `packages/db/src/rooms/settle.ts` onu import EDEMİYORDU — bağımlılık
yönü `packages/db → apps/web` olamaz. WS-001 incelemesi bunu borç olarak yazmıştı: gövde
yazılırken kural `packages/db` içinde YENİDEN yazılsaydı aynı kural iki yerde yaşar ve saparlardı.
**Karar:** Kural `packages/db/src/rooms/deadlines.ts`e taşındı (`dueSettlement` + `nextDeadlineAt`).
`apps/web/lib/realtime/timers.ts` `nextDeadlineAt`i `@xox/db`den tüketiyor; `settleDeadlines`
`dueSettlement`i aynı klasörden çağırıyor. Eski dosya ve testi SİLİNDİ.
**Reddedilenler:** **`packages/game-core`** (kartın önerdiği ilk yer) — ADR-0001 gereği kural
motoru pes etme/süre aşımı/terk kavramlarını BİLMEZ ve bilmemelidir; `reason: 'timeout'|'abandon'`
üreten bir fonksiyon %98.56 mutasyonla sertleştirilmiş saf motora ürün kavramı sokardı.
**`packages/shared`** — karar `RoomDoc` şekline (`presence`, `disconnected`, `size/winLength`)
bağlı; ayrıca `packages/shared` bu dalgada PERF-005 tarafından yeniden düzenleniyordu.
**Tasarım §5.7 dosya yolunu `apps/web` diye yazıyor — spec kendi mimarisiyle çelişiyordu, yol
lead kararıyla düzeltildi.**

## 2026-08-28 · "Kimse bağlı değilse yazma" kuralı SAF karar fonksiyonunun İÇİNDE (W2-01)

**Karar:** KK-076'nın `presence.X === null && presence.O === null → null` koşulu
`dueSettlement`in içinde yaşıyor, `settleDeadlines`in yazma yolunda değil.
**Gerekçe:** Çift yürütmenin iki yolu da (zamanlayıcı + tembel) aynı saf karara bakar. Koşul
yazma yolunda dursaydı `settleDeadlines`e ikinci bir "karar" sızardı ve iki yol farklı
davranabilirdi. `nextDeadlineAt` bilerek `presence`e BAKMAZ: zamanlayıcı kurmak yazma değildir,
odaya yalnız "yine de bir kez bak" der.
**Sonuç:** İki oyuncu da düşmüşse oyun `finishedAt:null` kalır ve oda TTL ile silinir —
telafi eden cron/süpürücü BİLEREK yoktur (ADR-0004 değişmezi).

## 2026-08-28 · Süre saati ENJEKTE edilir: `applyMove(code, userId, index, now?)` (W2-01)

**Karar:** `applyMove` ve `joinRoom` son parametre olarak opsiyonel bir epoch-ms saat alır
(`now`/`nowMs`, varsayılan `Date.now()`); `settleDeadlines(code, now)` ve `dueSettlement(room, now)`
saati ZORUNLU alır ve içeride `Date.now()` HİÇ çağırmaz. `TurnTimer` de aynı disiplinle
opsiyonel `clock` prop'u alır.
**Gerekçe:** `game-core`'un `searchMove(options.now)` / `rng` konvansiyonunun aynısı — duvar
saatine bağlı bir test CI'da kararsız olur. Opsiyonel parametre `RoomTransitions` arayüzünü
BOZMAZ (daha az parametreli imzaya atanabilir), yani `context.ts`/`handlers/**` açılmadı.
**Reddedilen:** Ayrı bir `Clock` bağımlılığı enjekte etmek — `packages/db`de böyle bir kalıp yok,
tek parametre yeterli.

## 2026-08-28 · `move:applied` ince yolu `turnDeadline` TAŞIMIYOR — bilinen açık, takip kartı gerekiyor (W2-01)

**Bağlam:** CTR-002'nin ince `move:applied` çerçevesinde `turnDeadline` alanı yok. P0'da
`turnDeadline` daima `null` yazıldığı için etkisizdi; W2-01 saati AÇTIĞI için artık etkili.
**Bugünkü davranış:** Sunucu otoritesi DOĞRU (her hamlede saat yeniden kuruluyor, iki yürütme
yolu da doğru sonlandırıyor). Yanlış olan tek şey İSTEMCİNİN GÖSTERDİĞİ sayaç: tam `state`
mesajları arasında (rotasyon, resync, rövanş, boşluk) sayaç oyunun BAŞLANGIÇ son tarihinde
takılı kalır ve 60 sn sonra 0 gösterir — oysa sunucu hâlâ süre veriyordur.
**Karar:** Doğru çözüm `move:applied`e `turnDeadline: epochMsSchema.nullable()` EKLEMEK
(her hamlede tam `state` yayınlamak DEĞİL — R1 fan-out bütçesini ~350 bayta çıkarır ve
instance başına tek change stream'in olay hacmini büyütür, bkz. 2026-08-25 kararı).
**Neden bu kartta yapılmadı:** üç dosya da W2-01'in çakışma kümesi DIŞINDA —
`packages/shared/src/ws-protocol.ts` (PERF-005 paralel), `packages/shared/src/room-client.ts`,
`apps/web/lib/realtime/connection.ts`. **Takip kartı açılmalı.**

## 2026-08-28 · Rövanşın İLK hamlesi süresizdir — bilinen açık (W2-01)

`rooms/rematch.ts` yeni oyunu `turnDeadline: null` ile başlatıyor ve o dosya W2-01'in çakışma
kümesinde değildi. Saat rövanşta ancak İLK hamleden SONRA (`applyMove`) kurulur; grace yolu
etkilenmez. W3-01 (rövanş/istatistik) bu satırı `joinRoom`daki ile aynı şekilde doldurmalı:
`turnDeadline: new Date(nowMs + MOVE_TIMEOUT_SECONDS * 1000)`.
