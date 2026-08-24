```yaml
task: ARCH-001
status: done
summary: >
  XOX teknik tasarımı ve 9 ADR üretildi. Spec §8'deki 10 sözleşme boşluğunun
  tamamı karara bağlandı — P0 bloklayıcısı (`gameStatusSchema.won.line`
  zorunluluğu) `game-core`'a dokunmadan, `shared`'da ayrı bir TAŞIMA tipiyle
  çözüldü (`line: WinLine | null` + `reason: 'line'|'resign'|'timeout'|'abandon'`,
  tutarlılık `superRefine` ile şema seviyesinde dayatılıyor). Change stream
  fan-out'u tam tasarlandı: Fluid instance başına TEK abonelik (resmi MongoDB
  dokümanı "her change stream havuzdan bir bağlantı tutar" diyor; maxPoolSize=10
  ile bağlantı-başına stream 5 oyuncuda çöker). Yürüyen iskelet (Dalga 0) beş
  alt dalgaya bölündü ve çıkış kriteri gerçek preview + gerçek Atlas'a bağlandı.
  25 görev, 5 ana dalga, her göreve dosya deseni düzeyinde çakışma kümesi.
files_changed:
  - docs/superpowers/specs/2026-08-24-xox-teknik-tasarim.md
  - docs/adr/0001-tasima-oyun-durumu-tipi.md
  - docs/adr/0002-change-stream-fan-out.md
  - docs/adr/0003-eszamanlilik-versiyonlama-ve-otorite-yeri.md
  - docs/adr/0004-sure-asimi-ve-terk-cift-yurutme.md
  - docs/adr/0005-mobil-auth-koprusu.md
  - docs/adr/0006-ws-kimlik-dogrulama-ve-bilet.md
  - docs/adr/0007-ws-baglanti-omru-ve-planli-rotasyon.md
  - docs/adr/0008-oda-yasam-dongusu-ve-presence-modeli.md
  - docs/adr/0009-kimlik-credentials-argon2id-adapter-yok.md
  - docs/memory/gotchas.md
  - docs/memory/api-contract.md
  - docs/board/reports/ARCH-001.md
tests: { added: 0, passing: 0, coverage: 'yok — tasarım görevi' }

decisions:
  - karar: >
      Taşıma katmanı oyun durumu `shared`'da AYRI bir tip olarak tanımlandı:
      `line: WinLine | null` + `reason: EndReason`, tutarlılık `superRefine` ile
      (`reason === 'line'` ⟺ `line !== null`). `game-core`'un `GameStatus` tipi
      DEĞİŞMEDİ. Tek yönlü köprü: `toTransportStatus` + `forfeitStatus`.
    gerekçe: >
      Motor pes etme kavramını bilmez ve bilmemelidir; %100 kapsam ve %98.56
      mutasyonlu sertleştirilmiş bir paket ürün kavramı için açılmaz. `reason`
      ayrıca `tr.game`'deki dört ayrı Türkçe metni (youWon/wonByResign/
      wonByTimeout/wonByAbandon) ayırt etmenin tek yoludur.
    reddedilen_alternatif: >
      `game-core`'a `reason` eklemek (ürün mantığı motora sızar) · `line: []`
      boş dizi konvansiyonu (yazılı olmayan bilgi, kontrol her tüketiciye
      dağılır) · sebebi yalnız `game:over` mesajında taşımak (yeniden bağlanan
      istemci o mesajı kaçırır, yalnız `state` alır → sonuç metni yanlış çıkar).
    adr: 0001

  - karar: >
      Change stream fan-out'u: Fluid instance başına EN FAZLA BİR abonelik
      (modül kapsamı `RoomHub` singleton'ı). Pipeline yalnız `operationType`
      üzerinde filtreler; oda kodu filtresi süreç içinde `Map.get`. Son abone
      gidince stream kapanır. Kopmada `startAfter(resumeToken)` ile yeniden
      açılır ve TÜM yerel abonelere zorla tam `state` yayınlanır.
    gerekçe: >
      MongoDB resmi dokümanı: "Each change stream holds a connection open with a
      getMore operation while waiting for the next event… ensure that the pool
      size is greater than the number of open change streams." `maxPoolSize: 10`
      ile bağlantı-başına stream 5 oyuncuda havuzun yarısını kilitler, 10
      oyuncuda tüm sorguları durdurur. Bu bir tercih değil, kısıt.
    reddedilen_alternatif: >
      Bağlantı başına filtreli stream (havuz tükenmesi) · odalar değiştikçe
      stream'i yeniden açmak (açılışlar arası olay kaybı + resume token
      disiplini) · `fullDocument.code` üzerinde `$match` (MongoDB dokümanı
      updateLookup ile birleşimini "Resume Token Not Found" riski olarak
      uyarıyor) · Redis pub/sub (decisions.md zaten yedeğe aldı) · sticky
      routing (Vercel garanti etmiyor).
    adr: 0002

  - karar: >
      DEĞİŞMEZ R1 — fan-out saflığı: bir bağlantı, başka bir bağlantının
      ürettiği hiçbir mesajı change stream dışında almaz. Aynı instance'taki iki
      oyuncu için bile süreç-içi kısayol YOKTUR; yazan bağlantı kendi hamlesini
      de change stream yankısıyla öğrenir.
    gerekçe: >
      Dalga 0'ın E2E'si iki Playwright bağlamının hangi instance'a düşeceğini
      kontrol EDEMEZ. Süreç-içi kısayol olsaydı test aynı instance'a düştüğünde
      yeşil yanar ve fan-out'u hiç kanıtlamazdı — gotchas.md'deki "ESLint
      çözümleyici" dersinin aynı başarısızlık biçimi. R1 sayesinde test,
      instance dağılımından BAĞIMSIZ olarak fan-out'u kanıtlar. Ayrıca tek
      gecikme profili, tek kod yolu, yarı sayıda dallanma.
    reddedilen_alternatif: >
      Süreç-içi kısayol + change stream yalnız uzak bağlantılar için — iki kod
      yolu, iki gecikme profili ve değersizleşmiş bir Dalga 0 kanıtı.
    adr: 0002

  - karar: >
      Otoriter durum geçişleri `packages/db/src/rooms/` içindedir (createRoom,
      joinRoom, detachConnection, applyMove, resign, offerRematch,
      acceptRematch, settleDeadlines, pushEmoji, finishGame). `apps/web`
      yalnız zarf açar ve sonucu mesaja çevirir. CANLI TAHTA `rooms`
      dokümanındadır; `games` yalnız arşivdir (oyun başında `finishedAt: null`
      ile açılır, bitişte bir kez CAS ile doldurulur).
    gerekçe: >
      `db → game-core` ve `db → shared` sınır politikaları zaten izinli. Kural +
      sıra sahipliği + koşullu yazma tek fonksiyonda olmazsa "kim kontrol etti?"
      her PR'da yeniden sorulur. Belirleyici sebep test edilebilirlik: packages/db
      içinde düz `vitest run` gerçek xox_test Atlas'ına karşı koşar; apps/web'de
      olsaydı yarış testi (aynı version ile iki yazma) neredeyse yazılamazdı.
      Tahta odada olunca hamle = TEK doküman yazması = atomik + TEK change
      stream olayı.
    reddedilen_alternatif: >
      Mantığı `apps/web/lib/game/`'e koymak (Next.js bağlamı taklidi gerekir;
      mobil zaten @xox/db import edemez, "paylaşım" argümanı geçersiz) · canlı
      tahtayı `games`'te tutmak (hamle iki dokümana yazar → atomiklik kaybı +
      ikinci change stream → havuz) · Mongo transaction (tek doküman zaten
      atomik, ek round-trip) · dağıtık kilit (kilit tutan instance ölürse oda
      kilitli kalır).
    adr: 0003

  - karar: >
      `version` disiplini dört kural: (1) durum değiştiren her yazma `$inc: 1`
      içerir — tek istisna emoji; (2) yazma HER ZAMAN `{ code, version: beklenen }`
      koşuluyla yapılır; (3) `version` asla sıfırlanmaz, rövanşta bile;
      (4) `version` asla atlamaz. İstemci `move` mesajına version KOYMAZ.
    gerekçe: >
      `findOneAndUpdate`'in 0 doküman güncellemesi kaybedeni KESİN olarak
      bildirir. İstemcinin version göndermesi ek koruma sağlamaz (sıra sahipliği
      + hücre doluluğu tam korumadır) ama ağ gecikmesinde GEÇERLİ hamleleri
      reddeder. Monotoniklik bozulursa "boşluk = resync" kuralı yanlış tetiklenir
      ve rövanştan sonra sonsuz resync döngüsü oluşur (KK-058'in gerçek sebebi).
    reddedilen_alternatif: >
      Koşulsuz `updateOne` + sonradan doğrulama (yarışı kaybedeni tespit edemez,
      iki hamle üst üste uygulanabilir) · istemcinin version göndermesi.
    adr: 0003

  - karar: >
      Emoji yazması `version` ARTIRMAZ. Bedeli: change stream tüketicisi emoji
      kontrolünü `version` kapısından ÖNCE, `lastEmoji.at` karşılaştırmasıyla
      yapmak zorundadır.
    gerekçe: >
      Emoji seli `version`'ı şişirir ve her istemcide gereksiz "boşluk → resync"
      tetikler; 10 sn'de 5 emoji sınırıyla bile bir oyunda onlarca gereksiz tam
      `state` yayını demek.
    reddedilen_alternatif: >
      Emojiyi ayrı bir taşımadan (ikinci change stream / Redis) yayınlamak —
      ADR-0002'nin havuz kısıtı.
    adr: 0003

  - karar: >
      Süre aşımı ve terk için ÇİFT yürütme: (1) bağlı instance'ta setTimeout,
      (2) her gelen WS mesajından ÖNCE tembel `settleDeadlines` kontrolü.
      Karar fonksiyonu saf (`dueSettlement(room, now)`), CRON YOK. Aynı tembel
      kalıp rövanş teklifinin düşmesinde de kullanılır.
    gerekçe: >
      Tek başına zamanlayıcı yetmez — Fluid instance zaten 300 sn'de ölüyor,
      60 sn'lik bir hamle süresi ömrün son 60 saniyesinde başlarsa hiç
      ateşlenmez. Tek başına tembel kontrol de yetmez — ama rakip 25 sn'de bir
      ping attığı için garanti gecikmesi ≤ 25 sn'dir. İkisi birbirinin yedeği.
      CRON OLMAMASI bir eksiklik değil GEREKSİNİM: KK-076 "iki taraf da bağlı
      değilse hiçbir sonuç yazılmaz" diyor; bir süpürücü tam tersini yapardı.
      Tembel çağrı handler'ların İÇİNE değil dispatcher'a konur — tek yer, atlanamaz.
    reddedilen_alternatif: >
      Vercel Cron (1 dk çözünürlük + KK-076 ihlali) · Mongo TTL ile bitirme
      (TTL siler, güncellemez) · istemcinin "süre doldu" iddiası (saati ileri
      alan istemci rakibini anında yener) · "en son gerçekleşen kazansın"
      (iki damga aynı ms'ye düşebilir; deterministik sıra yazıldı: önce dolan,
      eşitlikte timeout).
    adr: 0004

  - karar: >
      Mobil auth köprüsü: `/api/auth/mobile/authorize` (oturum kapısı) →
      `/api/auth/mobile/callback` (token basar) → `xox://auth?token=…&refresh=…`.
      `jose` HS256, `aud: 'xox-mobile'` ayrımı, access 15 dk, refresh 30 gün ve
      DÖNDÜRMELİ (`mobileRefreshTokens` koleksiyonu TTL indeksli, kullanılan jti
      silinir → yeniden kullanım tespiti). Kayıt da aynı köprüden geçer.
    gerekçe: >
      KK-009 deep link'te token'ı açıkça şart koşuyor. `aud` claim'i aynı
      AUTH_SECRET kullanılsa bile web oturum JWT'siyle mobil token'ı birbirinin
      yerine kabul edilemez kılar — sıfır operasyonel maliyetle izolasyon.
      Döndürmeli refresh, deep-link sızıntısının etkisini somut biçimde azaltır.
    reddedilen_alternatif: >
      PKCE + kod değişimi — GÜVENLİK AÇISINDAN DAHA İYİ (token hiç URL'e girmez)
      ama KK-009'un metnine aykırı ve dördüncü uç nokta + istemci S256 gerektirir;
      yükseltme yolu ADR'da yazılı, tetikleyici: mağazaya çıkış · mobilde yerel
      parola formu (iki doğrulama yüzeyi, iki zamanlama saldırısı yüzeyi; AS-09
      de reddetmiş) · gömülü WebView'dan çerez okuma · süresiz token.
    adr: 0005

  - karar: >
      WS kimlik doğrulaması üç kaynaklı TEK çözücü: Bearer (native mobil) →
      Auth.js çerezi (web) → `?ticket=` (30 sn, `aud: 'xox-ws'`, durumsuz;
      react-native-web ve başlık gönderemeyen istemciler için). Kimlik yoksa
      upgrade edilip DERHAL `close(4401)`.
    gerekçe: >
      `react-native-web` hedefi (KK-090/091 doğrulama yüzeyimiz) tarayıcı
      WebSocket API'sini kullanır ve ÖZEL BAŞLIK GÖNDEREMEZ. Uzun ömürlü token'ı
      sorgu dizesine koymak onu Vercel erişim günlüklerine yazar; 30 saniyelik,
      tek amaçlı bir bilet günlükte durduğunda pratikte değersizdir. KK-008 bir
      kapanış KODU iddia ettiği için HTTP 401 yetmez — başarısız handshake
      istemciye 1006 verir ve "ağ hatası" sanılıp sonsuz yeniden bağlanma olur.
    reddedilen_alternatif: >
      Yalnız çerez (RN web farklı origin) · yalnız Bearer (tarayıcı gönderemez) ·
      `Sec-WebSocket-Protocol` içinde token (sunucunun alt protokolü yankılaması
      gerekir; `experimental_upgradeWebSocket` handshake yanıtına erişim
      vermiyor — doğrulanamayan mekanizmaya temel atılmadı) · tek kullanımlık
      bilet (her bağlantıda bir yazma; ADR-0007 yüzünden bağlantı kurulumu sık) ·
      kimliği ilk `join` mesajında taşımak (kimliksiz açık soket = DoS yüzeyi).
    adr: 0006

  - karar: >
      WS bağlantı ömrü 300 saniye gerçeği kabul edildi ve PLANLI ROTASYON
      tasarlandı: sunucu `getDeadline()` ile süre dolmadan 10 sn önce
      `close(4499)` yapar; istemci bu kodu görünce backoff'u SIFIRLAYIP anında
      bağlanır ve tam `state` alır. `maxDuration` koda gömülmez.
    gerekçe: >
      Vercel dokümanı: "WebSocket connections close when a Vercel Function
      reaches its maximum duration" — Hobby'de 300 s varsayılan VE maksimum.
      Yani yeniden bağlanma bir kenar durum değil ANA AKIŞ. Planlı olmazsa
      istemci 1006'yı bekler (2 heartbeat = 50 sn'ye kadar donma) ve backoff
      sayacı hiç sıfırlanmadığı için birkaç saat sonra her rotasyon 10 saniyelik
      donmaya döner. Yan fayda: KK-063'ün resync yolu artık her 5 dakikada bir
      gerçekten çalışır — nadir değil, sürekli sınanan bir kod yolu.
    reddedilen_alternatif: >
      Hiçbir şey yapmayıp 1006'yı beklemek · `maxDuration`'ı 300_000 olarak koda
      gömmek (plan yükseltmesinde yanlış) · maxDuration'ı 800/1800'e çıkarıp
      sorunu ERTELEMEK (seyrek çalışan yeniden bağlanma = test edilmemiş yol) ·
      SSE + POST (aynı süre sınırı, üstelik çift kanal) · polling.
    adr: 0007

  - karar: >
      `presence: { X: {connId, since} | null, O: … }` ODA DOKÜMANINDA tutulur.
      Takeover change stream ile yayılır (kendi connId'sini bulamayan bağlantı
      4409 ile kapanır); kopma yazması KOŞULLUDUR (`presence.X.connId === benim`).
      Doluluk kontrolü sahipliğe bakar, bağlantı sayısına değil — üç dalın SIRASI
      normatiftir.
    gerekçe: >
      İki oyuncu iki instance'ta olabilir; süreç-içi kayıt defteri diğerini
      göremez. Koşullu yazma olmadan takeover anında SAHTE bir "rakip koptu"
      yayınlanır — klasik yarış hatası, kökten kapatıldı. Dal sırası ters
      yazılırsa kopan oyuncu kendi odasına giremez (spec §3.3'ün uyarısı,
      KK-064 ile kilitlendi).
    reddedilen_alternatif: >
      Süreç-içi `Map<userId, ws>` (instance dağılımı garanti değil) · `presence`
      yerine `lastSeenAt` (takeover'ı ayırt edemez) · iki sekmenin koltuğu
      aynalaması (spec §3.2 reddetti) · doluluğu bağlantı sayısıyla ölçmek.
    adr: 0008

  - karar: >
      SPEC'İN §3.8 KARARI DEĞİŞTİRİLDİ: rövanş teklifi oda dokümanında VE `state`
      mesajında taşınır (`rematch: { by, expiresAt } | null`). Davranışsal
      semantik aynen korundu (rakip ayrılınca iptal, 60 sn'de düşer, karşılıklı
      teklif = mutabakat).
    gerekçe: >
      Spec'in gerekçesi "state mesajında rövanş alanı yok" idi — bu mevcut
      şemanın kısıtıydı, ürün kararı değil, ve ADR-0001 ile zaten geçersizleşti.
      İki bağımsız zorunluluk var: (a) R1 gereği yayın SADECE change stream'den
      geçebilir, yani teklif zaten dokümana yazılmak ZORUNDA; (b) ADR-0007'nin
      300 sn rotasyonu, `state`'te taşınmayan her efemer durumu görünmez kılar.
      Dokümanda olup `state`'te olmaması bilinçli bilgi saklama olurdu.
    reddedilen_alternatif: >
      Teklifi yalnız bağlantı belleğinde tutmak — rakibe hiç ulaşmaz (R1).
    adr: 0008

  - karar: >
      P0'da `@auth/mongodb-adapter` KULLANILMAZ. Credentials + `session.strategy:
      'jwt'` (açıkça yazılır), kayıt ayrı REST uç noktası, `_id: randomUUID()`,
      `users.email` unique indeks, `passwordHash` `{ select: false }`,
      `@node-rs/argon2` (argon2 değil), sabit zamanlı giriş (kullanıcı yoksa da
      sahte verify), middleware SPLIT CONFIG.
    gerekçe: >
      Adapter `users._id`'yi ObjectId olarak yönetir; bizim modelimiz string ve
      seed sabit string kimlikler yazıyor, Room.seats/Game.players/participants
      hepsi string userId taşıyor. Üstelik adapter Credentials + JWT'de HİÇBİR İŞ
      YAPMIYOR (kullanıcı oluşturmuyor, sessions kullanılmıyor) — yani sıfır
      işlev karşılığında çakışma riski. `@node-rs/argon2` linux-x64-gnu prebuilt
      yayınlıyor (npm registry'den doğrulandı), node-gyp yok. Middleware kenar
      çalışma zamanında; `mongoose`+native ikili import ederse build patlar.
    reddedilen_alternatif: >
      Adapter kullanmak · `UserDoc._id`'yi ObjectId'ye çevirmek (dört model +
      seed yeniden yazılır) · `argon2` node-pre-gyp (bundle'da native ikili
      taşıma şansa bağlı) · bcrypt/scrypt · middleware'de yalnız çerez varlığına
      bakmak (sahte çerez geçer) · middleware yerine her sayfada kontrol
      (7 rota × 2 uygulama; unutulan tek rota = koruma boşluğu) · kayıtta
      "önce oku sonra yaz" (yarış).
    adr: 0009

  - karar: >
      `games` koleksiyonuna türetilmiş `participants: string[]` ve
      `pairKey: string` (sıralı `a|b`) alanları eklendi; `users`'a `ratedGames`
      sayacı. Sıralama indeksi kısmi: `{ elo: -1 }` +
      `partialFilterExpression: { ratedGames: { $gte: 5 } }`.
    gerekçe: >
      KK-117 COLLSCAN yasağı `players.X`/`players.O` üzerinde `$or` ile
      sağlanamaz — `$or` + `sort` tek indeksten karşılanmaz. Çok anahtarlı
      `{ participants: 1, finishedAt: -1 }` hem filtreyi hem sıralamayı indeksten
      verir. `pairKey` KK-113'ün (24 saatte 3 puanlı oyun) ve KK-126'nın
      (yalnız birlikte oynanmış rakibi ekleyebilme) tek indeksli sorgusudur.
      Kısmi indeks sorgu yüklemiyle birebir eşleştiği için SORT aşaması oluşmaz.
    reddedilen_alternatif: >
      `$or` ile `players.X`/`players.O` sorgulamak · `finishedAt: { $ne: null }`
      için kısmi indeks (Mongo kısmi filtre ifadesi `$ne` desteklemiyor —
      doğrulandı; onun yerine `finishedAt` indeksin ikinci alanı yapıldı).

  - karar: >
      Dalga 0 (yürüyen iskelet) BEŞ alt dalgaya bölündü: 0a sözleşme+risk (4
      paralel) → 0b otorite (DB-001) → 0c kimlik+yüzey (2 paralel) → 0d gerçek
      zamanlı (WS-001) → 0e KAPI (E2E-001, gerçek preview + gerçek Atlas).
      Kritik yol beş halka ve KISALTILAMAZ.
    gerekçe: >
      Zincirdeki her halka bir öncekinin TİPİNİ import ediyor. Kısaltma denemesi
      (örn. AUTH-001 ve WS-001'i paralelleştirmek) `lib/auth/identity.ts`'in iki
      worktree'de birden yazılmasına ve typecheck kırılmasına yol açar. Yürüyen
      iskelet zaten ince bir iplik olmalı; onu genişletmek amacını bozar.
    reddedilen_alternatif: >
      Tek büyük "Dalga 0" görevi (tek agent, paralellik yok, kurtarma yok) ·
      AUTH ve WS'i paralelleştirmek (dosya çakışması).

  - karar: >
      `RT-PROBE-001` (`GET /api/health/realtime`) Dalga 0a'ya, HERHANGİ BİR UI
      YAZILMADAN ÖNCE kondu. Çıktısı bir KARAR KAPISI: change stream gecikmesi
      p95 > 1500 ms ise ADR-0002 revize edilir ve Redis pub/sub yedeği devreye
      girer.
    gerekçe: >
      KK-040'ın 1500 ms bütçesi tüm gerçek zamanlı tasarımın temeli. Bu ölçümü
      Dalga 0e'ye (E2E'ye) bırakmak, yanlış bir temele beş dalga inşa etme riski
      demek. Sonda mevcut `Room` modeliyle çalışır, hiçbir bağımlılığı yok —
      bu yüzden ilk dalgada, paralel koşabiliyor.
    reddedilen_alternatif: >
      Gecikmeyi ilk E2E'de ölçmek (beş dalga sonra öğrenmek).

  - karar: >
      WS handler kayıt defteri (`lib/realtime/handlers/index.ts`) Dalga 0'da TÜM
      mesaj tipleriyle EKSİKSİZ doldurulur; yazılmamış olanlar tek satırlık
      iskeletlerdir. Aynı şekilde istemci reducer'ı (`shared/room-client.ts`)
      Dalga 0a'da TAM yazılır.
    gerekçe: >
      Bu iki dosya doğal "sıcak dosya"dır ve her gerçek zamanlı görev onlara
      dokunmak isterdi — sonuç: Dalga 1'de W1-02 ve W1-03 paralel gidemezdi.
      Eksiksiz kayıt defteri sayesinde sonraki görevler YALNIZ kendi handler
      dosyalarını değiştirir. Bu, dalga bölümlemesinin ön koşuludur.
    reddedilen_alternatif: >
      Kayıt defterini büyüterek ilerlemek (her dalgada aynı dosyada çakışma) ·
      reducer'ı parçalara bölmek (yapay bölünme, aynı switch'in üç dosyaya
      dağılması).

gotchas:
  - >
    ⚠️ HAVUZ: Her change stream `getMore` boyunca havuzdan BİR bağlantı tutar
    (MongoDB resmi dokümanı). `maxPoolSize: 10` ile bağlantı-başına stream
    5 oyuncuda havuzun yarısını kilitler, 10 oyuncuda tüm sorguları durdurur.
    Instance başına TEK stream — ADR-0002. gotchas.md'ye yazıldı.
  - >
    ⚠️ 300 SANİYE: Vercel WS bağlantısı fonksiyon maksimum süresinde kapanır
    (Hobby: 300 s varsayılan VE maksimum). Yeniden bağlanma kenar durum değil
    ana akış. Planlı rotasyon (`getDeadline()` → `close(4499)`) — ADR-0007.
  - >
    Yerel WS geliştirme `next dev` ile ÇALIŞMAZ; `vc dev` (CLI ≥ 54.14.2) gerekir.
    `pnpm dev` ile denenirse hata "Vercel WS bozuk" diye yanlış okunur —
    tam olarak `ws` paketi tuzağının tekrarı. `apps/web`'e `dev:ws` script'i şart.
  - >
    `experimental_upgradeWebSocket` handler'ına `Request` VERİLMEZ; imza
    `(ws) => void`. Kimlik/oda kodu upgrade'den ÖNCE route handler'ın kendi
    `Request`'inden çözülüp closure ile taşınmalı. `maxPayload` varsayılanı
    256 KiB → 8 KiB'a düşürülüyor.
  - >
    Mongo kısmi indeks filtresi `$ne` DESTEKLEMEZ (yalnız eşitlik, `$exists:true`,
    `$gt/$gte/$lt/$lte`, `$type`, `$in`, `$and`, `$or`). `finishedAt: { $ne: null }`
    için kısmi indeks kurulamaz; `{ participants: 1, finishedAt: -1 }` tam indeksi
    kullanılıyor.
  - >
    Auth.js middleware'i `mongoose`/native ikili import EDEMEZ (kenar çalışma
    zamanı). `auth.config.ts` (kenar-güvenli) / `auth.ts` (tam) ayrımı YAPILMAZSA
    build patlar. Bu, Dalga 0c'nin en olası kırılma noktası.
  - >
    Auth.js v5 dokümanları "Credentials yalnız JWT ile çalışır" ifadesini artık
    İÇERMİYOR — doğrulanamadı. `session: { strategy: 'jwt' }` AÇIKÇA yazılmalı,
    varsayılana güvenilmemeli (adapter varlığında `database` olabilir).
  - >
    Rövanş kabulünde `presence` de `seats` ile birlikte TAKAS EDİLMELİ. Unutulursa
    her iki bağlantı da kendi connId'sini yanlış koltukta arar, bulamaz ve
    İKİSİ BİRDEN 4409 ile kapanır. Sessiz ve kafa karıştırıcı; test maddesi olarak
    yazıldı (ADR-0008).
  - >
    Emoji `version` artırmadığı için change stream tüketicisinde emoji kontrolü
    `version` kapısından ÖNCE gelmeli. `connection.ts`'teki tek sıra-bağımlı adım;
    yorumla işaretlendi. Sıra bozulursa emojiler sessizce kaybolur.
  - >
    ADR-0007'nin rotasyonu yüzünden rakip kısa bir `opponent:left` →
    `opponent:returned` çifti görebilir. İstemci 2 saniyelik GÖSTERİM EŞİĞİ
    uygular. Bu eşik testte kilitlenmeli — yoksa bir agent onu "gereksiz gecikme"
    sanıp siler ve her rotasyonda sahte "rakip koptu" görünür.
  - >
    `transportStatusSchema` `superRefine` kullandığı için `ZodEffects`'tir ve
    `discriminatedUnion` içine DOĞRUDAN gömülemez. `ws-protocol.ts` iç birliği
    ayrıca `transportStatusInnerSchema` olarak dışa vermeli.
  - >
    KK-102 ve KK-103 (Sentry) `decisions.md`'nin "Sentry yok" kararıyla DÜŞTÜ.
    Board'da "iptal (karar)" olarak işaretlenmeli, "yapılmadı" olarak değil —
    yoksa xox-reporter yüzdeyi kalıcı olarak eksik hesaplar (88 → 86 otomatik,
    KK-093 insan doğrulaması ayrı satır).

blocked_reason: >
  Görev tamamlandı, blokaj yok. İki tasarım varsayımı Dalga 0'da EMPİRİK olarak
  doğrulanacak ve ikisinin de geri çekilme planı ADR'larda yazılı:
  V1 — `ws.close(4401)` özel kapanış kodunun istemciye ulaşması (Dalga 0d sondası;
  ulaşmazsa upgrade öncesi HTTP 401 + KK-008 metni güncellenir).
  V2 — Credentials + JWT çerezinin preview'da tarayıcı kapanıp açıldıktan sonra
  sürmesi (Dalga 0e, KK-006).
  Ayrıca OPS-001 (xox.omerdursun.com) hâlâ Ömer'de; yalnız KK-100'ü etkiliyor,
  Dalga 0–3'ün hiçbirini bloklamıyor.

next_suggestions:
  - >
    `xox-planner` §12'deki dalga tablolarını board.json'a BİREBİR kopyalamalı —
    özellikle `conflictSet` sütunlarını. Dosya deseni düzeyinde yazıldılar ve
    kesişimleri mekanik olarak kontrol edilebilir. Kesişen iki görevi aynı dalgaya
    koymak, gece koşusunda merge çakışmasıyla ilerlemeyi durdurur.
  - >
    Dalga 0a'nın DÖRT görevi de tam paralel ve bağımsız: CTR-001, UI-001,
    OPS-002, RT-PROBE-001. Gece koşusunun ilk dispatch'i bu dördü olmalı.
    RT-PROBE-001'in raporu ölçülen gecikmeyi SAYI olarak içermeli; p95 > 1500 ms
    ise lead ADR-0002'yi yeniden açar ve Redis yedeğini planlar.
  - >
    Dalga 0e'nin (E2E-001) çıkış kriteri KAPIDIR: KK-001, KK-006, KK-030, KK-031,
    KK-032, KK-040, KK-041 gerçek preview üzerinde yeşil yanmadan Dalga 1
    başlamaz. Rapor ölçülen fan-out gecikmesini sayı olarak yazmalı.
  - >
    CTR-001 en yüksek kaldıraçlı görev: protokol + saf istemci reducer + WS
    taşıması. Tamamı saf ve DOM'suz, yani KK-046/047/060/061/065 E2E'ye
    bırakılmadan BİRİM TESTİ olarak kapatılabilir. Kapsam eşiği burada yüksek
    tutulmalı; `xox-dev-core` + `xox-test-writer` çifti uygun.
  - >
    `xox-security` Dalga 0'dan SONRA değil, Dalga 0c biter bitmez çağrılmalı:
    argon2 parametreleri, sabit zamanlı giriş (KK-005 ±100 ms), `select: false`
    ve WS bileti (ADR-0006) tek incelemede doğrulanabilir. Sonraki dalgalarda bu
    yüzeyler donuyor.
  - >
    Ömer'den karar gerekmiyor — AS-01/AS-02 kapandı (decisions.md), AS-04…AS-09
    varsayımları tasarıma alındı. Tek insan bağımlılığı OPS-001 (domain) ve
    KK-093 (Expo Go manuel doğrulaması). İkisi de gece koşusunu bloklamıyor.
```
