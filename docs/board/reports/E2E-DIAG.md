# E2E-DIAG — rapor

Görev: preview E2E kapısındaki üç kırmızının (69f56bf → 6da73f2 arası, dört merge
sonrası: `W2-03`, `SEC-005`, `UI-004`, `DRY-002`) kök nedenini KANITLAMAK, sonra
mümkün olanı `apps/e2e` sınırı içinde düzeltmek. Kural mantığına (`packages/**`)
ve `apps/web`'e dokunulmadı — yalnız `apps/e2e/tests/timeout-abandon.spec.ts`
değişti.

## Yöntem

- Dört merge'ün diff'leri okundu (`git show`, ilgili rapor dosyaları).
- `packages/db/src/rooms/{settle,deadlines,finish}.ts`, `apps/web/components/room/
{RoomScreen,OpponentLeftBanner,status-text}.ts(x)` okundu — KK-072/070'in
  gerçek çalıştırma yolu.
- `apps/e2e/tests/timeout-abandon.spec.ts`in `69f56bf..6da73f2` arasındaki TEK
  commit'i (`a66d9f3`, karantina kaldırma) satır satır diff'lendi — KK-072'nin
  gövdesi DEĞİŞMEDİĞİ doğrulandı.
- `profile.spec.ts` KK-083 için: yerel ÜRETİM derlemesi (`next build && next
start`), `MONGODB_DB=xox_test` ile sıfırlanıp tohumlandı, sonra gerçek
  yük altında (10 worker, aynı süreçte eşzamanlı kayıt/giriş akışları) İKİ
  kez tekrar koşuldu.
- KK-070/KK-072 (WS gerektiren testler) **yerelde koşulmadı** — kart notu ve
  `E2E-004`in daha önce kanıtladığı gibi `next start` `experimental_
upgradeWebSocket`i desteklemiyor; yerel koşu yanıltıcı olurdu. Bu ikisi için
  yalnız kod okuması + zamanlama hesaplaması yapıldı.

## Bulgu 1 — `profile.spec.ts:157` KK-083 (tema) → **DOĞRULANDI: kararsızlık, regresyon DEĞİL**

Kök neden: Argon2id CPU çekişmesi (lead'in ön okuması DOĞRU). Kanıt:

- Yerel üretim derlemesinde TEK BAŞINA (`--grep KK-083`, 1 worker): **1.0 sn'de
  GEÇTİ** — tema mantığının kendisinde hiçbir sorun yok.
- Aynı testi de İÇEREN tüm-paket koşusu 10 worker ile (`--grep-invert
"timeout-abandon|reconnect|room-realtime"`) **İKİ AYRI ÖLÇÜMDE DE** KK-083
  dahil 12-13 test kırmızı oldu; KK-083'ün hata imzası **BİREBİR** lead'in ön
  okumasıyla eşleşti: `page.waitForURL: Timeout 15000ms exceeded` — hata tema
  adımında DEĞİL, `registerFreshUser`in giriş/yönlendirme adımında (satır
  ~30, `girisParola` sonrası `/kayit → /`). Sayfa anlık görüntüsü formda
  `tr.errors.NETWORK` ("Bağlantı sorunu. İnternetini kontrol et.") gösteriyor
  — yani `/api/auth/register` isteğinin kendisi, eşzamanlı çok sayıda
  argon2id hash işlemi altında sunucu tarafında zamanında yanıt veremiyor/
  bağlantı düşüyor.
- `apps/web/lib/auth/password.ts`: argon2id parametreleri standart/hafif
  (m=19456 yani 19 MiB, t=2, p=1 — kütüphane varsayılanı, ~30-100ms/hash).
  Yani sorun YANLIŞ YAPILANDIRMA değil, SAF EŞZAMANLILIK: tek Node süreci
  (yerelde `next start`, üründe de aynı şekilde tek-instance/az-instance
  serverless) aynı anda çok sayıda kayıt+giriş+çıkış akışını (`SEC-005`
  sonrası çıkış da artık `revokeWsTicketsForUser` için ekstra bir DB
  turu YAPIYOR — bkz. Bulgu 1-yan not) işlerken CPU/etkinlik döngüsü
  sıkışıyor.
- **Yan not (aggravasyon, regresyon DEĞİL):** `SEC-005`in `events.signOut`
  kancası çıkışa bir `connectDb()` + `revokeWsTeketsForUser` DB turu daha
  ekliyor. Bu tek başına KK-083'ü kırmıyor (KK-083 hiç çıkış yapmıyor) ama
  aynı yük koşusunda `auth.spec.ts` KK-011 (çıkış sonrası yönlendirme) de
  kırmızı çıktı — aynı kök nedenin (eşzamanlı yük altında toplam istek
  gecikmesi) başka bir belirtisi. Ayrı bir kart gerektirmez, yalnız not
  düşülüyor.

**Sınıflandırma: `flaky`.** Kod/regresyon düzeltmesi YOK (apps/web dışım, ve
zaten "hata" argon2id'nin KENDİSİ değil, paralel-koşu kapasitesi). Test dosyası
zaten `retries` artırmadan/`waitForTimeout` eklemeden yazılmış durumda; CI'ın
kendi `retries: 2`'si (yalnız `CI=1` iken) bu sınıf kararsızlığı zaten
karşılıyor — KK-083'ün önceki koşuda retry #2'de 3.3 sn'de geçmesi bunun kanıtı.
**Müdahale gerekmiyor**, yalnız kök neden doğrulandı ve yazıya geçirildi.

## Bulgu 2 — `timeout-abandon.spec.ts:237` KK-070 → **DOĞRULANDI: test kırılganlığı (ürün hatası DEĞİL), DÜZELTİLDİ**

Kod okuması + zamanlama hesabı:

- `packages/shared/src/room-client.ts`: `opponentLeftVisible` `elapsed =
DISCONNECT_GRACE_SECONDS*1000 - (graceEndsAt - serverNow)` hesaplar, banner
  yalnız `elapsed >= OPPONENT_LEFT_DISPLAY_DELAY_MS` (2000ms, ADR-0007) iken
  görünür.
- `OpponentLeftBanner.tsx` bu kararı yalnız KENDİ `setInterval`inin HER 1000ms
  tikinde YENİDEN değerlendiriyor; interval `graceEndsAt` ilk dolduğunda
  (WS/change-stream'den geldiği anda) başlıyor — 2000ms işaretiyle FAZ-HİZALI
  DEĞİL. Yani banner pratikte eşiği EN AZ 0, EN ÇOK ~1000ms GEÇTİKTEN sonra
  görünür olabilir (tik anına bağlı) — buna `WS-001`in ölçtüğü değişim-akışı
  gecikmesi (~80-90ms, kopuş → DB yazımı → change stream → WS broadcast) ve
  Playwright'ın `page.close()` CDP/ağ maliyeti eklenir.
- Test **tam olarak `timeout: 2_000`** kullanıyordu — yani eşiğin KENDİSİ
  kadar bir bekleme payı veriyordu, üstüne binen gecikmeler için SIFIR pay.
  Bu, ürünün ADR-0007'ye UYGUN davranışına karşı KAZANILAMAZ bir yarış
  kuruyordu — testin İLK GERÇEK koşusunda (karantinadan yeni çıktı)
  kırmızı çıkması bu yüzden sürpriz değil.
- **Bu bir ürün regresyonu DEĞİL**: `OpponentLeftBanner`ın 2 sn eşiği
  `OpponentLeftBanner.test.tsx`de birim testle kilitli ve doğru; sorun
  yalnızca E2E'nin bu doğru davranışa pay bırakmadan yazılmış olmasıydı.

**Düzeltme (`apps/e2e/tests/timeout-abandon.spec.ts`, benim çakışma kümem):**
KK-070 ve KK-071'deki AYNI `timeout: 2_000` ölçümü `OPPONENT_LEFT_DISPLAY_DELAY_MS

- 2_000` (`@xox/shared`'dan import edilen GERÇEK sabitten türetilmiş, 4000ms) ile
değiştirildi — 1 tik payı + gerçekçi ağ/DB tamponu. İDDİA GEVŞETİLMEDİ: hâlâ
AYNI metnin (`TXT.opponentDisconnectedPrefix`) görünmesi bekleniyor, yalnız
ürünün kendi belgelenmiş/test edilmiş gecikmesine gerçekçi bir bekleme payı
tanındı. `waitForTimeout`eklenmedi,`retries`artırılmadı — yalnız`expect`in
kendi (zaten var olan) `toBeVisible` yeniden-deneyen bekleyişinin üst sınırı
  düzeltildi.

**Sınıflandırma: test kırılganlığı → düzeltildi, `pnpm gates` yeşil.** KK-070'in
gerçek preview'da tekrar koşulup doğrulanması gerekiyor (WS yerelde koşmuyor).

## Bulgu 3 — `timeout-abandon.spec.ts:187` KK-072 → **regresyon BULUNAMADI; kod düzeyinde ÇÜRÜTÜLDÜ, kanıtlanamayan kalıntı: kararsızlık şüphesi**

- `git show a66d9f3 -- apps/e2e/tests/timeout-abandon.spec.ts`: KK-072'nin
  test GÖVDESİ bu commit'te (karantina kaldırma) DEĞİŞMEDİ — yalnız
  KK-070/071'in `test.fixme`si kaldırıldı, farklı bir `describe` bloğu.
- KK-072'nin yürütme yolu (`packages/db/src/rooms/{deadlines,settle,finish}.ts`,
  `apps/web/components/room/{RoomScreen.tsx,status-text.ts}`) dört merge'ün
  HİÇBİRİNİN dokunduğu dosyalar arasında DEĞİL:
  - `W2-03` yalnız mobil + `api/auth/mobile/**`.
  - `SEC-005` yalnız `auth.ts`in `events.signOut`u + yeni `signout-cleanup.ts`
    — WS/oda akışına hiç girmiyor.
  - `UI-004` YALNIZ `OpponentLeftBanner.tsx` + kendi test dosyası; kendi
    raporu `RoomScreen.tsx'e DOKUNULMADI` diyor, doğrulandı (`grep`).
  - `DRY-002` yalnız REST route'ları (`rooms`, `rooms/[code]`,
    `auth/register`, `ws/ticket`) — WS route'un (`api/rooms/[code]/ws/route.ts`)
    KENDİSİNE dokunmadı.
- KK-072 yalnız `durum-metni`/`sira-gostergesi` testid'lerini kontrol ediyor
  (40 sn payla, 30 sn'lik grace penceresine göre 10 sn fazladan tampon) —
  `OpponentLeftBanner`in DOM'u ile paylaşılan bir seçici YOK, strict-mode
  çakışması da YOK (`durum-metni` sayfada tekil, doğrulandı).
- **Yan bulgu (gerçek ama AYRI bir ürün kusuru, KK-072'nin testini
  KIRMIYOR):** `settle.ts` forfeit yazımında `disconnected: null`ı HEM gerçek
  geri dönüşte HEM zaman aşımıyla sonuçlanan terkte AYNI şekilde yazıyor.
  `OpponentLeftBanner` bu iki nedeni AYIRT ETMİYOR — `graceEndsAt`
  dolu-iken-`null`a her düşüşte "Rakip geri döndü." gösteriyor
  (`OpponentLeftBanner.test.tsx`teki "rakip grace içinde dönünce" testi bunu
  KASITLI davranış olarak kilitliyor). Yani KK-072 senaryosunda (terk
  galibiyeti) kazanan oyuncu, `durum-metni`de doğru "Rakibin oyunu terk
  etti — kazandın!" yazarken, AYNI ANDA banner'da 5 sn boyunca YANLIŞ
  "Rakip geri döndü." mesajı da görebilir — çelişkili UI. Bu KK-072'nin
  `getByTestId` tabanlı iddiasını ETKİLEMİYOR (ayrı DOM elemanı,
  ayrı testid) ama gerçek bir UX kusuru; yeni bir kart önerilir
  (`apps/web/components/room/OpponentLeftBanner.tsx` — forfeit/gerçek-dönüş
  ayrımı, `RoomScreen` zaten `state.status.kind`i taşıyor, bu bilgi
  bileşene GEÇİRİLEBİLİR).

**Sonuç: kod düzeyinde HİÇBİR regresyon kanıtı YOK.** Test gövdesi
değişmedi, yürütme yolu değişmedi. En olası açıklama **kararsızlık**
(muhtemelen aynı dalgada KK-070/071'in karantinadan çıkmasıyla artan
eşzamanlı gerçek-WS/gerçek-kopuş yükü, ya da Bulgu 1'deki genel eşzamanlılık
baskısının bir başka görünümü) — ama bunu WS gerektirdiği için yerelde
ÖLÇEMEDİM (kart notu: `next start` upgrade'i desteklemiyor). **Bunu ben
gevşetmedim/dokunmadım** — hiçbir kod/test değişikliği yapılmadı.

**Sınıflandırma: kanıtlanamamış — muhtemel `flaky`, doğrulama preview'da
GEREKLİ.** Öneri: preview'da KK-072'yi tek başına (`--grep KK-072`) İKİ kez
art arda koş; ikisi de yeşilse kararsızlık kapanır, biri kırmızıysa (ve
Bulgu 3'ün ürün kusuru onu açıklamıyorsa, ki açıklamıyor) `blocker`'a
yükseltilip `apps/web`/`packages/db`'ye yeni bir kart açılmalı.

## Yeni bulgu (rapor amaçlı, apps/web dışım — düzeltilmedi)

- **Dosya:** `apps/web/components/room/OpponentLeftBanner.tsx`
- **Şiddet:** `minor` (yanıltıcı ama engelleyici değil — `durum-metni` doğru,
  yalnız banner çelişkili bir ek mesaj gösteriyor).
- **Beklenen:** Terk galibiyetinde (`status.reason==='abandon'`) kazanan
  oyuncu YALNIZ "Rakibin oyunu terk etti — kazandın!" görmeli.
- **Gerçekleşen:** Aynı anda 5 sn boyunca "Rakip geri döndü." bandı da
  görünüyor (`graceEndsAt` dolu→null geçişi forfeit'te de gerçek dönüşle
  AYNI şekilde yorumlanıyor).
- **Şüpheli dosya:** `apps/web/components/room/OpponentLeftBanner.tsx`
  (forfeit anını `RoomScreen`den gelen `state.status.kind==='playing'`
  bilgisiyle ayırt etmesi gerekir).

## `pnpm gates`

```
EXIT: 0
Tasks:    7 successful, 7 total   (ilk koşu, e2e dosyası değiştiği için typecheck/lint gerçek çalıştı)
Tasks:    6 successful, 6 total   (teyit koşusu, tam cache — hiçbir görev kırmızı değil)
typecheck ✓ · lint ✓ · format:check ✓ · test:coverage ✓ (apps/web 901/901,
  diğer paketler yeşil) · knip ✓ (yalnız önceden var olan yapılandırma
  ipuçları, bu görevle ilgisiz)
```

## Değiştirilenler

- `apps/e2e/tests/timeout-abandon.spec.ts` — KK-070/071'deki `timeout: 2_000`
  ölçümleri `OPPONENT_LEFT_DISPLAY_DELAY_MS + 2_000` (4000ms, `@xox/shared`dan
  içe aktarılan gerçek sabitten türetilmiş) ile değiştirildi + kök neden
  yorumu eklendi. Başka HİÇBİR satır/iddia değişmedi.

## Değiştirilemeyenler ve tam neden

- **KK-072 (regresyon şüphesi):** kanıt YOK, kod değişmedi — apps/e2e
  sınırım içinde "düzeltilecek" somut bir şey bulunamadı. Gerçek preview'da
  tekrar ölçülmeli (WS yerelde koşmuyor).
- **KK-083 (Argon2id çekişmesi):** kök neden kapasite/eşzamanlılık, kod
  hatası değil; `apps/web`'e (argon2 parametreleri, rate-limit, signOut
  akışı) dokunma yetkim yok ve zaten "düzeltilecek bir hata" değil —
  CI'nin kendi retry mekanizması bunu zaten karşılıyor.
- **OpponentLeftBanner UX kusuru:** `apps/web` dışım, yeni kart önerildi
  (yukarıda).

## Commit

- `feat/E2E-DIAG` dalında: aşağıdaki commit (bu rapor dahil).
