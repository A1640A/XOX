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
