```yaml
task: SPEC-001
status: done
summary: >
  XOX ürün spec'i yazıldı: 28 kullanıcı hikayesi (P0/P1/P2), 88 numaralı ve
  gözlemlenebilir kabul kriteri, 9 zorunlu edge case + 13 ek sınır durumu,
  web (11 rota) ve mobil (10 rota) ekran envanteri, tam Türkçe metin ağacı
  ve 10 maddelik sözleşme boşluğu tablosu. Mevcut `game-core`/`shared`/`db`
  yapı taşları yeniden tanımlanmadı, üzerine inşa edildi; kapsam harness §5
  listesinin dışına çıkmadı.
files_changed:
  - docs/superpowers/specs/2026-08-24-xox-oyun-spec.md
  - docs/board/reports/SPEC-001.md
tests: { added: 0, passing: 0, coverage: 'yok — analiz görevi' }
decisions:
  - karar: >
      Rakip kopmasında 30 saniyelik grace (`DISCONNECT_GRACE_SECONDS`), süre
      dolunca kalan oyuncu `abandon` sebebiyle kazanır. Her iki taraf da bağlı
      değilse HİÇBİR sonuç yazılmaz; oda TTL ile silinir.
    gerekçe: >
      30 sn mobil ağ geçişini (wifi→LTE) kurtaracak kadar uzun, terk edilen
      oyuncuyu bekletmeyecek kadar kısa. "İkisi de yoksa yazma" kuralı, sonucu
      yazacak otoritenin bağlı bir istemci olması zorunluluğundan doğuyor.
    reddedilen_alternatif: >
      Anında hükmen mağlubiyet (tek bir tünel kesintisi oyunu kaybettirir) ·
      60 sn (hamle süresiyle aynı sabit ama terk edileni iki kat bekletir).
  - karar: >
      Aynı kullanıcının ikinci bağlantısı takeover'dır: eski bağlantı
      SESSION_TAKEOVER ile kapatılır, eski sekme otomatik yeniden bağlanmayı
      DENEMEZ. Koltuk sahipliği userId'ye aittir, bağlantıya değil.
    gerekçe: >
      Tek aktif bağlantı, iki farklı tahta görüntüsünü ve çift hamle yarışını
      kökten kaldırır; Playwright'ta deterministik olarak gözlemlenebilir.
      "Yeniden bağlanmayı deneme" kuralı açıkça yazıldı — yoksa iki sekme
      sonsuz takeover savaşına girer.
    reddedilen_alternatif: >
      İki sekmenin aynı koltuğu aynalaması — sunucu tarafında güvenli (sıra +
      doluluk kontrolü yeterli) ama kullanıcı deneyimi belirsiz ve test edilemez.
  - karar: >
      ODA_DOLU kontrolü koltuk SAHİPLİĞİNE bakar, bağlantı sayısına değil:
      seats.X === userId || seats.O === userId ise join bir yeniden bağlanmadır
      ve oda dolu olsa da kabul edilir.
    gerekçe: >
      Ters sırayla yazılırsa kopan oyuncu kendi odasına giremez. Klasik hata;
      KK-064 ile teste kilitlendi.
    reddedilen_alternatif: 'Bağlantı sayısına bakan doluluk kontrolü.'
  - karar: >
      Zaman aşımı iki yolla birden uygulanır: bağlı instance'taki zamanlayıcı +
      her gelen mesajdan ÖNCE `turnDeadline` tembel kontrolü.
    gerekçe: >
      Fluid Compute instance'ı ölünce setTimeout da ölür; tembel kontrol sonucu
      bir sonraki temasta kesinleştirir. Tek başına zamanlayıcı sessizce kaybolur.
    reddedilen_alternatif: >
      Cron/scheduled function (ek altyapı, saniye çözünürlüğü yok) · yalnızca
      istemcinin timeout iddiası (istemciye otorite vermek).
  - karar: >
      ELO çift-hesap savunması tespit değil ödül kısıtıdır: <3 hamlelik oyun
      puansız, aynı çift arasında 24 saatte en fazla 3 puanlı oyun, sıralamaya
      girmek için ≥5 puanlı oyun. stats (G/M/B) sayaçları etkilenmez.
    gerekçe: >
      Deterministik, test edilebilir ve yanlış pozitif üretmez. Puan pompalamayı
      ekonomik olarak anlamsız kılar.
    reddedilen_alternatif: >
      IP eşleşmesi (aynı evdeki iki gerçek oyuncuyu cezalandırır, Vercel ardında
      güvenilmez) · cihaz parmak izi (gizlilik ve kapsam dışı).
  - karar: >
      Rövanş teklifi kalıcı DEĞİL, bağlantıya bağlıdır; rakip ayrılınca iptal
      olur, 60 sn içinde kabul edilmezse düşer. Kabul edilince koltuklar yer
      değiştirir.
    gerekçe: >
      `state` mesajında rövanş alanı yok; teklifi kalıcılaştırmak protokol
      değişikliği gerektirir ve P0 için gereksiz. Koltuk değişimi ilk hamle
      avantajını dönüşümlü kılar.
    reddedilen_alternatif: >
      Teklifi oda dokümanında kalıcılaştırıp reconnect'te yeniden sunmak —
      serverMessageSchema.state'e yeni alan gerektirir.
  - karar: >
      Bilgisayara karşı oyun tamamen istemci tarafıdır; games'e yazılmaz,
      stats ve elo'yu değiştirmez.
    gerekçe: 'Sonsuz kolay-seviye tekrarıyla istatistik/puan şişirmeyi kapatır; sunucu yükü sıfır.'
    reddedilen_alternatif: 'Sunucuda AI oyunu tutmak — WS trafiği ve DB yazımı, hiçbir ürün faydası yok.'
  - karar: >
      Auth sağlayıcı olarak Credentials (e-posta + parola) VARSAYILDI, karar
      AS-01 olarak açık bırakıldı.
    gerekçe: >
      Yer gerçeğinde "kayıt/giriş" geçiyor (OAuth'ta ayrı kayıt adımı yok),
      .env.example'da hiçbir OAuth istemci değişkeni yok, seed sabit test
      kullanıcıları üretiyor ve Playwright'ın Google ekranını sürmesi pratik değil.
    reddedilen_alternatif: >
      Google/GitHub OAuth — daha az kod ama Ömer'in OAuth uygulaması açması ve
      E2E için ayrı test-login kaçış yolu tanımlanması gerekir.
gotchas:
  - >
    ⚠️ P0 BLOKLAYICI ŞEMA BOŞLUĞU: `gameStatusSchema`'nın `won` varyantı `line`
    alanını ZORUNLU kılıyor (`z.tuple([number,number,number])`). Pes etme, zaman
    aşımı ve terk galibiyetlerinde kazanan çizgi YOKTUR — mevcut şemayla bu
    sonuçlar hiç ifade edilemez. `line`'ın nullable yapılması + `reason` alanı
    eklenmesi gerekiyor. `game-core`'un kendi `GameStatus` tipi DEĞİŞMEMELİ;
    değişecek olan `shared`'daki taşıma tipidir.
  - >
    `serverMessageSchema.state.players` yalnızca userId taşıyor, görünen ad
    taşımıyor. `rakip-adi` (KK-032) için ya state'e ad eklenmeli ya da ayrı bir
    REST çağrısı yapılmalı; ilki KK-032'nin 2 sn bütçesine daha rahat sığar.
  - >
    `GameDoc` oyuncu kimliği taşımıyor (yalnızca `roomCode`). P1 stats
    idempotansı ve P2 maç geçmişi `players: { X: userId, O: userId }` alanı
    olmadan yazılamaz. Aynı dokümanda `endReason`, `rated`, `eloDelta` de yok.
  - >
    `game-core` sıra sahipliğini BİLEREK doğrulamıyor (index.ts başlığında
    yazılı). Sunucu her hamlede `nextPlayer(board) === istekSahibininTasi`
    kontrolünü kendisi yapmak zorunda; motora güvenmek çift-hamle açığı bırakır.
  - >
    `Room` TTL indeksi `updatedAt` üzerinde ve her hamlede tazeleniyor — bu
    İSTENEN davranış (aktif oda silinmemeli), hata değil. Terk edilen oda son
    hamleden 2 saat sonra silinir.
  - >
    `move:rejected.reason` şu an serbest `string`. Test string eşleşmesine
    dayanırsa kırılgan olur; `InvalidMoveReason | 'not-your-turn'` birliğine
    daraltılmalı. Sebep sözlüğü game-core'un kebab-case değerleriyle (
    'out-of-range' | 'game-over' | 'occupied') hizalı tutuldu.
  - >
    Auth.js v5'te Credentials provider adapter ile kullanıcı OLUŞTURMAZ ve
    yalnızca JWT session ile çalışır. Kayıt akışı ayrı bir uç nokta olmak
    zorunda; `signIn` çağrısı kullanıcı yaratmaz.
  - >
    Oda kodu çakışma yolu (unique index 11000 → yeniden deneme) gerçek hayatta
    ~1/1e9 olasılıkla tetiklenir. Test kodu ÖNCEDEN ekleyerek çakışmayı zorlamazsa
    bu dal hiç çalıştırılmadan "kapsandı" sanılır (ESLint çözümleyici dersiyle
    aynı başarısızlık biçimi).
  - >
    Kabul kriterleri `data-testid`/`testID` sözleşmesine (§2.0) dayanıyor. Web ve
    mobil AYNI kimlikleri kullanmalı; kimlikler bir sabit modülünde toplanmalı,
    JSX içine string olarak serpiştirilmemeli — yoksa e2e senaryoları iki kez yazılır.
blocked_reason: >
  Görev tamamlandı, ancak spec içinde iki kriter dış bağımlılıkla bloklu:
  AS-02 (Sentry hesabı/DSN yok → KK-102, KK-103) ve AS-03 (xox.omerdursun.com
  bağlanmadı, OPS-001 ile aynı → KK-100). İkisi de P1'dir; P0 ve P1'in geri
  kalanı preview üzerinde doğrulanabilir.
next_suggestions:
  - >
    `xox-architect` işe §8 "Sözleşme boşlukları" tablosundan başlamalı. Özellikle
    B1 (`won.line` zorunluluğu) bir P0 bloklayıcısıdır ve shared şema değişikliği
    ilk dalgaya girmeli — sonradan değişirse WS istemcisi, sunucu ve testler
    birlikte kırılır.
  - >
    Yeni sabitler tek commit'te `@xox/shared/constants.ts`'e eklenmeli:
    DISCONNECT_GRACE_SECONDS=30, REMATCH_OFFER_TTL_SECONDS=60, emoji hız sınırı
    (5/10sn), ELO sabitleri (K=24, çift başına 24 saatte 3 puanlı oyun, sıralama
    için ≥5 oyun, taban 100).
  - >
    §2.0'daki test kancası sözleşmesi paylaşılan bir sabit modülü olarak
    planlanmalı (`packages/shared` ya da `ui-tokens` yanında). `xox-qa-e2e` bu
    modülden okursa web ve mobil senaryoları tek kaynaktan sürülebilir.
  - >
    `xox-planner` kabul kriterlerini görev kartlarına birebir kopyalamalı;
    KK numaraları board'da izlenirse `xox-reporter` yüzdeyi §9 tablosundan
    otomatik hesaplar (P0=50, P1=22, P2=16, toplam 88; KK-093 insan doğrulaması).
  - >
    Ömer'den AS-01 (Credentials mı OAuth mu), AS-02 (Sentry) ve AS-03 (domain)
    kararları istenmeli. AS-01 varsayımla ilerliyor ama karar OAuth'a dönerse
    /kayit ekranı, passwordHash alanı ve E2E giriş fixture'ı yeniden yazılır —
    bu yüzden Dalga 0'dan ÖNCE sorulması en ucuzudur.
```
