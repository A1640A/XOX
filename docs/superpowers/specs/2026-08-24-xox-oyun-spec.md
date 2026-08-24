# XOX — Ürün Spec'i (v1)

- **Tarih:** 2026-08-24
- **Görev:** SPEC-001
- **Durum:** Tamamlandı — açık sorular §7'de
- **Girdi:** `docs/superpowers/specs/2026-08-24-xox-harness-design.md` §5, §6 (yer gerçeği)
- **Çıktı tüketicisi:** `xox-architect` → `xox-planner`
- **Kapsam:** Harness §5'teki P0/P1/P2 listesinin **içi**. Liste genişletilmedi.
- **Kapsam dışı:** Kural motoru (`packages/game-core` bitti — bu doküman onu yeniden tanımlamaz,
  yalnızca çağırır), harness/CI mimarisi.

---

## 0. Zemin — bu spec'in dayandığı sabitler

Aşağıdakiler karar verilmiştir ve bu doküman içinde tartışılmaz:

| Konu            | Sabit                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Dil             | Yalnızca Türkçe. Metinler `apps/web/messages/tr.ts` + mobil karşılığında merkezî   |
| Hesap           | **Zorunlu** — oyun yüzeyinin tamamı kimlik ister, misafir modu yok                 |
| Auth            | Auth.js v5 beta + `@auth/mongodb-adapter`, **JWT session**                         |
| Mobil auth      | `expo-auth-session` → `/api/auth/mobile/*` → kısa ömürlü JWT → `expo-secure-store` |
| Gerçek zamanlı  | Vercel Fluid Compute WebSocket + MongoDB change stream fan-out                     |
| Otorite         | **Sunucu otoriter.** İstemci iyimser günceller, sunucu reddederse geri alınır      |
| Veri            | MongoDB Atlas — `xox_dev` / `xox_test` / `xox_prod`                                |
| Kural motoru    | `@xox/game-core` — bitti, sertleştirildi, yeniden yazılmaz                         |
| Protokol        | `@xox/shared` zod şemaları — tek kaynak                                            |
| Mobil doğrulama | `react-native-web` hedefi + `apps/e2e` duman testi                                 |

### Mevcut yapı taşları (yeniden tanımlanmaz, kullanılır)

- `@xox/game-core`: `EMPTY_BOARD`, `BOARD_SIZE`, `applyMove`, `isValidMove`, `availableMoves`,
  `boardFromCells`, `boardToString`, `nextPlayer`, `evaluateStatus`, `WIN_LINES`, `bestMove`,
  `chooseMove`, `InvalidMoveError`; `Difficulty = 'easy' | 'medium' | 'unbeatable'`.
- `@xox/game-core` **sıra sahipliğini bilerek doğrulamaz** (bkz. `index.ts` başlığı). Sunucu her
  hamlede `nextPlayer(board) === istekSahibininTasi` kontrolünü kendisi yapmak **zorundadır**.
- `@xox/shared`: `clientMessageSchema`, `serverMessageSchema`, `roomCodeSchema`,
  `ROOM_CODE_ALPHABET` (I/O/0/1 hariç), `ROOM_CODE_LENGTH=6`, `ROOM_TTL_SECONDS=7200`,
  `MOVE_TIMEOUT_SECONDS=60`, `WS_HEARTBEAT_MS=25000`, `WS_RECONNECT_BASE_MS=500`,
  `WS_RECONNECT_MAX_MS=10000`, `MAX_EMOJI_LENGTH=8`.
- `@xox/db`: `User` (`stats`, `elo=1200`), `Room` (`code` unique, `seats`, `version`, TTL),
  `Game` (`board`, `moves[]`, `winner`, `isDraw`), `generateRoomCode()`, `TEST_USERS`
  (`e2e-user-1`, `e2e-user-2`).

### Bu spec'in ürettiği ve mevcut şemalarda **olmayan** alanlar

§8 "Sözleşme boşlukları" bunları tek tabloda listeler. `xox-architect` bu tabloyu okumadan
şema kararı vermemeli — birkaçı P0'ı doğrudan bloklar (özellikle `won.line` zorunluluğu).

---

## 1. Kullanıcı hikayeleri

Kimlikler `US-<katman>-<no>`. Her hikayenin kabul kriterleri §2'de aynı numarayla eşlenir.

### P0 — Yürüyen iskelet ve çekirdek

| ID       | Hikaye                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-P0-01 | **Yeni ziyaretçi** olarak e-posta ve parolayla hesap açmak istiyorum, çünkü oyun geçmişimin ve istatistiklerimin bana ait kalmasını istiyorum.                    |
| US-P0-02 | **Kayıtlı oyuncu** olarak e-posta ve parolayla giriş yapmak istiyorum, çünkü her açılışta yeniden kurulum yapmadan oynamak istiyorum.                             |
| US-P0-03 | **Giriş yapmış oyuncu** olarak oturumumun tarayıcıyı kapatıp açtığımda sürmesini istiyorum, çünkü her seferinde parola yazmak oyuna başlamayı geciktiriyor.       |
| US-P0-04 | **Mobil oyuncu** olarak telefonda tarayıcı üzerinden giriş yapıp uygulamaya dönmek istiyorum, çünkü web'dekiyle aynı hesabı kullanmak istiyorum.                  |
| US-P0-05 | **Oyuncu** olarak bilgisayara karşı kolay/orta/yenilmez seviyelerinde oynamak istiyorum, çünkü rakip beklemeden ve kendi seviyemde pratik yapmak istiyorum.       |
| US-P0-06 | **Oyuncu** olarak oda kurup 6 haneli kodu arkadaşıma göndermek istiyorum, çünkü eşleştirme sistemine gerek kalmadan istediğim kişiyle oynamak istiyorum.          |
| US-P0-07 | **Davet edilen oyuncu** olarak 6 haneli kodu girip odaya katılmak istiyorum, çünkü hesap kurmak dışında bir kurulum yapmak istemiyorum.                           |
| US-P0-08 | **Oda içindeki oyuncu** olarak rakibimin hamlesini anında görmek istiyorum, çünkü sayfayı yenilemek oyunu oynanamaz kılar.                                        |
| US-P0-09 | **Oyuncu** olarak sıra bende değilken tahtaya basamamak istiyorum, çünkü kural dışı hamle denemesi oyunu bozar.                                                   |
| US-P0-10 | **Oyuncu** olarak kazandığımda/kaybettiğimde/berabere kaldığımda sonucu ve kazanan çizgiyi net görmek istiyorum, çünkü oyunun bittiğini tahmin etmek istemiyorum. |
| US-P0-11 | **Oyunu bitirmiş oyuncu** olarak rövanş teklif etmek ve kabul etmek istiyorum, çünkü yeni kod paylaşmadan tekrar oynamak istiyorum.                               |
| US-P0-12 | **Bağlantısı kopan oyuncu** olarak geri döndüğümde oyunun kaldığı yerden ve doğru tahtayla devam etmesini istiyorum, çünkü zayıf bağlantı oyunu kaybettirmemeli.  |
| US-P0-13 | **Oyuncu** olarak pes edebilmek istiyorum, çünkü kaybedeceğim bir oyunu sonuna kadar oynamak zorunda kalmak istemiyorum.                                          |

### P1 — Tam döngü

| ID       | Hikaye                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-P1-01 | **Oyuncu** olarak profilimde galibiyet/mağlubiyet/beraberlik sayılarımı görmek istiyorum, çünkü ilerlememi ölçmek istiyorum.                                    |
| US-P1-02 | **Oyuncu** olarak görünen adımı değiştirmek istiyorum, çünkü rakibime nasıl göründüğümü kontrol etmek istiyorum.                                                |
| US-P1-03 | **Mobil oyuncu** olarak web'deki tüm akışları telefonda da yapabilmek istiyorum, çünkü çoğunlukla telefondan oynuyorum.                                         |
| US-P1-04 | **Oyuncu** olarak `xox.omerdursun.com` adresinden oyuna girmek istiyorum, çünkü preview linki paylaşmak istemiyorum.                                            |
| US-P1-05 | **Ürün sahibi** olarak canlıdaki hataların ve performans metriklerinin bana ulaşmasını istiyorum, çünkü kullanıcı şikâyet etmeden önce sorunu görmek istiyorum. |
| US-P1-06 | **Oyuncu** olarak rakibim oyunu terk ettiğinde belirsiz süre beklememek istiyorum, çünkü sonucun kesinleşmesini istiyorum.                                      |
| US-P1-07 | **Oyuncu** olarak sıra bendeyken kalan sürenin geri sayımını görmek istiyorum, çünkü zaman aşımıyla kaybetmek sürpriz olmamalı.                                 |
| US-P1-08 | **Oyuncu** olarak koyu temayı kullanmak istiyorum, çünkü gece oynuyorum.                                                                                        |

### P2 — Sosyal

| ID       | Hikaye                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| US-P2-01 | **Oyuncu** olarak ELO puanımı ve sıralamadaki yerimi görmek istiyorum, çünkü ilerlememin rakiplerime göre nerede olduğunu bilmek istiyorum.    |
| US-P2-02 | **Oyuncu** olarak en yüksek puanlı oyuncuların listesini görmek istiyorum, çünkü hedefimi görmek motive ediyor.                                |
| US-P2-03 | **Oyuncu** olarak son maçlarımı rakip, sonuç ve puan değişimiyle listelemek istiyorum, çünkü nerede kaybettiğimi hatırlamak istiyorum.         |
| US-P2-04 | **Oda kuran oyuncu** olarak tek tıkla kopyalanan bir davet linki üretmek istiyorum, çünkü 6 haneli kodu telefonda okutmak yorucu.              |
| US-P2-05 | **Oda içindeki oyuncu** olarak sabit bir emoji paletiyle rakibime tepki göndermek istiyorum, çünkü sessiz oynamak sıkıcı.                      |
| US-P2-06 | **Oyuncu** olarak birlikte oynadığım rakibi arkadaş listeme eklemek istiyorum, çünkü aynı kişiyle tekrar oynamak istediğimde bulmak istiyorum. |
| US-P2-07 | **Oyuncu** olarak puan avcılığı yapan hesaplara karşı sıralamanın korunmasını istiyorum, çünkü hileli puan listeyi anlamsızlaştırır.           |

---

## 2. Kabul kriterleri

Her kriter **gözlemlenebilir**. Ölçülemez ifade yok. `[E2E]` işaretliler doğrudan Playwright
senaryosuna dönüşür; `[BİRİM]` Vitest'e; `[MANUEL]` yalnızca insan doğrulaması gerektirenler
(bu spec'te üç tane var ve hepsi Expo Go ile ilgili).

### 2.0 Test kancası sözleşmesi (bunlar olmadan §2 yazılamaz)

Tüm kriterler bu `data-testid` değerlerine dayanır. Web ve mobil **aynı** kimlikleri kullanır
(RN'de `testID` prop'u). Kimlikler İngilizce değil Türkçedir çünkü UI kimliğidir, kod
tanımlayıcısı değil — ancak bir sabit modülünde toplanır, string olarak serpiştirilmez.

| Kimlik                                                    | Nerede            | Ne                                                                            |
| --------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `tahta`                                                   | oyun ekranları    | 3×3 kapsayıcı                                                                 |
| `hucre-0` … `hucre-8`                                     | tahta             | Hücre. `data-tas="X"\|"O"\|""`, `data-kazanan="true"`, `data-bekliyor="true"` |
| `durum-metni`                                             | oyun ekranları    | "Sıra sende" / "Kazandın!" / "Berabere" …                                     |
| `sira-gostergesi`                                         | oyun ekranları    | `data-sira="X"\|"O"\|"yok"`                                                   |
| `oda-kodu`                                                | oda ekranı        | 6 haneli kod (metin)                                                          |
| `baglanti-durumu`                                         | oda ekranı        | `data-durum="bagli"\|"baglaniyor"\|"kopuk"`                                   |
| `sure-sayaci`                                             | oda ekranı (P1)   | Kalan saniye (tam sayı metin)                                                 |
| `rakip-adi`                                               | oda ekranı        | Rakibin görünen adı ya da "Rakip bekleniyor"                                  |
| `btn-pes-et`, `btn-rovans-teklif`, `btn-rovans-kabul`     | oda ekranı        | Aksiyon düğmeleri                                                             |
| `btn-bilgisayara-karsi`, `btn-oda-kur`, `btn-odaya-katil` | ana sayfa         | Ana CTA'lar                                                                   |
| `zorluk-easy`, `zorluk-medium`, `zorluk-unbeatable`       | bilgisayar ekranı | Zorluk seçimi                                                                 |
| `giris-eposta`, `giris-parola`, `btn-giris`, `btn-kayit`  | auth ekranları    | Form alanları                                                                 |
| `hata-mesaji`                                             | her yer           | Görünür hata. `data-kod="<HATA_KODU>"`                                        |
| `istatistik-galibiyet`/`-maglubiyet`/`-beraberlik`        | profil            | Sayılar                                                                       |
| `elo-puani`, `siralama-satir-<n>`, `gecmis-satir-<n>`     | P2 ekranları      | Sosyal katman                                                                 |
| `emoji-<n>` (0–7), `emoji-balonu`                         | oda ekranı (P2)   | Emoji paleti ve gelen balon                                                   |

### 2.1 Kimlik ve hesap (US-P0-01…04)

- **KK-001** `[E2E]` `/kayit` sayfasında geçerli e-posta + en az 8 karakter parola + görünen ad
  girilip gönderildiğinde kullanıcı oluşturulur ve oturum açılmış olarak `/` adresine yönlendirilir;
  sayfada kullanıcının görünen adı görünür.
- **KK-002** `[E2E]` Zaten kayıtlı bir e-postayla kayıt denendiğinde form kalır, HTTP 409 döner ve
  `hata-mesaji` `data-kod="EMAIL_TAKEN"` ile "Bu e-posta zaten kayıtlı." metnini gösterir.
- **KK-003** `[BİRİM]` 8 karakterden kısa parola, e-posta formatına uymayan adres ve 2 karakterden
  kısa görünen ad sunucu tarafında reddedilir (HTTP 400) — istemci doğrulaması tek savunma değildir.
- **KK-004** `[BİRİM]` Parola veritabanına **düz metin olarak yazılmaz**; `users` dokümanında
  `password` alanı yoktur, yalnızca `passwordHash` vardır ve değeri girilen parolaya eşit değildir.
- **KK-005** `[E2E]` Yanlış parolayla giriş denemesinde HTTP 401 döner ve mesaj
  "E-posta veya parola hatalı." olur — e-postanın kayıtlı olup olmadığı **ayırt edilmez**
  (aynı metin, aynı kod, ±100 ms fark).
- **KK-006** `[E2E]` Giriş yapıldıktan sonra tarayıcı context'i kapatılıp aynı storage state ile
  yeniden açıldığında kullanıcı hâlâ oturum açmıştır (`/profil` 200 döner, `/giris`'e yönlenmez).
- **KK-007** `[E2E]` Oturum açmamış bir istemci `/oyna/bilgisayar`, `/oda/YENI`, `/oda/ABC234`,
  `/profil` adreslerinden herhangi birine gittiğinde `/giris?donus=<istenen-yol>` adresine 307 ile
  yönlendirilir; giriş sonrası **istenen yola** döner.
- **KK-008** `[BİRİM]` Kimliksiz bir WebSocket upgrade isteği bağlantıyı 4401 kapanış koduyla kapatır;
  hiçbir oda mesajı gönderilmez.
- **KK-009** `[BİRİM]` `/api/auth/mobile/callback` geçerli akış sonunda `xox://auth?token=…&refresh=…`
  deep link'ine yönlendirir; access token'ın `exp` alanı ≤ 15 dakika, refresh token'ınki ≤ 30 gündür.
- **KK-010** `[BİRİM]` `Authorization: Bearer <mobil-access-token>` başlığıyla gelen REST isteği ve
  WS upgrade'i, web cookie oturumuyla **aynı** `userId`'ye çözülür.
- **KK-011** `[E2E]` Çıkış yapıldığında `/profil` isteği `/giris`'e yönlenir.

### 2.2 Bilgisayara karşı oyun (US-P0-05)

- **KK-020** `[E2E]` `/oyna/bilgisayar` üç zorluk düğmesi gösterir; varsayılan seçili olan
  `zorluk-medium`'dur.
- **KK-021** `[E2E]` `zorluk-unbeatable` seçiliyken oynanan 5 tam oyunun hiçbirinde
  `durum-metni` "Kazandın!" olmaz (yalnızca "Berabere" veya "Kaybettin").
- **KK-022** `[BİRİM]` `chooseMove` çağrısı `apps/web` içinde yeniden implemente edilmez;
  bilgisayar hamlesi yalnızca `@xox/game-core` üzerinden alınır (ESLint boundaries + kod incelemesi).
- **KK-023** `[E2E]` Bilgisayar hamlesi, insan hamlesinden sonra en geç 1000 ms içinde tahtada görünür.
- **KK-024** `[E2E]` Dolu bir hücreye tıklamak tahtayı değiştirmez ve hata göstermez (sessiz yok sayılır).
- **KK-025** `[E2E]` Oyun bittikten sonra boş hücreye tıklamak tahtayı değiştirmez;
  `sira-gostergesi` `data-sira="yok"` olur.
- **KK-026** `[E2E]` "Yeniden oyna" düğmesi tahtayı `EMPTY_BOARD` durumuna döndürür ve seçili zorluğu korur.
- **KK-027** `[BİRİM]` Bilgisayara karşı oynanan oyun `games` koleksiyonuna **yazılmaz**,
  `users.stats` ve `users.elo` **değişmez** (oyun öncesi/sonrası doküman birebir aynı).

### 2.3 Oda kurma ve katılma (US-P0-06, US-P0-07)

- **KK-030** `[E2E]` "Oda kur" düğmesi kullanıcıyı `/oda/<KOD>` adresine götürür; `<KOD>`
  `roomCodeSchema`'ya uyar (6 karakter, `[A-HJ-NP-Z2-9]`).
- **KK-031** `[E2E]` Oda kuran kullanıcı `X` koltuğuna oturur; `sira-gostergesi` `data-sira="X"`,
  `rakip-adi` "Rakip bekleniyor" gösterir.
- **KK-032** `[E2E]` İkinci kullanıcı kodu girip katıldığında `O` koltuğuna oturur; **her iki**
  istemcide de `rakip-adi` karşı tarafın görünen adına 2 sn içinde döner.
- **KK-033** `[E2E]` Var olmayan bir kod girildiğinde `hata-mesaji` `data-kod="ROOM_NOT_FOUND"` ile
  "Böyle bir oda yok. Kodu kontrol et." gösterir ve sayfa değişmez.
- **KK-034** `[BİRİM]` Kod girişi küçük harf ve boşluk toleranslıdır: `" abc234 "` → `ABC234`.
  `roomCodeSchema` dışı karakter içeren giriş `INVALID_CODE` ile reddedilir.
- **KK-035** `[BİRİM]` `POST /api/rooms` `code` unique index çakışmasında (11000) en fazla 5 kez
  yeniden dener; 5 denemenin tamamı çakışırsa 503 + `CODE_GENERATION_FAILED` döner.
  Test, ilk üretilen kodu önceden ekleyerek çakışmayı **zorlar** ve farklı bir kodun döndüğünü doğrular.
- **KK-036** `[BİRİM]` Oda kodu `randomInt` (kriptografik) ile üretilir; `Math.random` kullanımı
  `packages/db` içinde yasaktır (mevcut `generateRoomCode` korunur).

### 2.4 Gerçek zamanlı senkron (US-P0-08, US-P0-09)

- **KK-040** `[E2E]` `twoPlayers` fixture'ı: A hamle yapar, B'nin tahtasında aynı hücre en geç
  **1500 ms** içinde aynı taşla görünür. (Bu, change stream fan-out'unun ölçülen bütçesidir;
  aşılırsa `decisions.md`'deki Redis yedeği devreye alınır.)
- **KK-041** `[E2E]` Sıra karşı taraftayken tahtaya tıklamak hiçbir hücreyi değiştirmez ve sunucuya
  `move` mesajı gönderilmez (istemci içeride durdurur).
- **KK-042** `[BİRİM]` Sunucu, sırası olmayan oyuncudan gelen `move` mesajına
  `move:rejected { reason: 'not-your-turn' }` döner ve `rooms.version` **artmaz**.
- **KK-043** `[BİRİM]` Dolu hücreye `move` → `move:rejected { reason: 'occupied' }`;
  oyun bitmişken `move` → `move:rejected { reason: 'game-over' }`;
  0–8 dışı indeks → şema reddi + `error { code: 'INVALID_MESSAGE' }`.
  (Sebep sözlüğü `InvalidMoveReason` ile birebir aynıdır, `'not-your-turn'` eklenir.)
- **KK-044** `[BİRİM]` Sunucu her hamlede `nextPlayer(board) === istekSahibininTasi` kontrolünü
  yapar. Sonda testi: X koltuğundaki kullanıcı üst üste iki `move` gönderir; ikincisi reddedilir.
- **KK-045** `[BİRİM]` Hamle yazımı koşullu güncellemedir:
  `findOneAndUpdate({ code, version: beklenenVersion }, …)`. Eşzamanlı iki yazmadan **yalnızca biri**
  başarılı olur, `version` tam olarak 1 artar.
- **KK-046** `[E2E]` İstemci hamleyi iyimser çizer (`data-bekliyor="true"`); `move:applied`
  geldiğinde işaret kalkar, `move:rejected` geldiğinde hücre boşalır ve `hata-mesaji` görünür.
- **KK-047** `[BİRİM]` İstemci `move:applied` mesajını yalnızca `version === yerelVersion + 1` ise
  uygular; aksi halde `join` göndererek tam `state` ister (boşluk = resync tetikleyicisi).
- **KK-048** `[BİRİM]` Şemaya uymayan JSON veya bozuk metin gönderildiğinde sunucu
  `error { code: 'INVALID_MESSAGE' }` döner ve bağlantıyı **kapatmaz** (üçüncü ihlalde kapatır).

### 2.5 Sonuç ve rövanş (US-P0-10, US-P0-11, US-P0-13)

- **KK-050** `[E2E]` Kazanan çizgiyi tamamlayan hamleden sonra: kazananın ekranında
  `durum-metni` "Kazandın!", kaybedenin ekranında "Kaybettin." olur; **her ikisinde de**
  kazanan çizginin 3 hücresi `data-kazanan="true"` taşır.
- **KK-051** `[E2E]` 9 hücre dolar ve kazanan yoksa iki ekranda da `durum-metni` "Berabere." olur.
- **KK-052** `[BİRİM]` Oyun bittiğinde `games` dokümanı `finishedAt` dolu, `winner`/`isDraw`
  ve `endReason` ('line') yazılmış olarak kaydedilir; `moves[]` oynanan hamle sayısı kadar öğe içerir.
- **KK-053** `[BİRİM]` Oyun bittiğinde kazananın `stats.wins`, kaybedenin `stats.losses`,
  beraberlikte iki tarafın `stats.draws` alanı tam olarak 1 artar — **oyun başına bir kez**
  (aynı `gameId` ikinci kez işlenirse sayaç değişmez; idempotans testi zorunlu).
- **KK-054** `[E2E]` `btn-pes-et` tıklanıp onaylandığında oyun anında biter; pes eden "Kaybettin.",
  rakip "Rakibin pes etti — kazandın!" görür; `games.endReason === 'resign'`.
- **KK-055** `[E2E]` Oyun bittikten sonra `btn-rovans-teklif` görünür. A teklif ederse B'de
  `btn-rovans-kabul` ve "Rakip rövanş istiyor." metni 2 sn içinde görünür.
- **KK-056** `[E2E]` B kabul ettiğinde aynı oda kodunda yeni oyun başlar: tahta boşalır,
  **koltuklar yer değiştirir** (önce X olan artık O'dur) ve ilk sıra yeni X'tedir.
- **KK-057** `[BİRİM]` Rövanş teklifi `REMATCH_OFFER_TTL_SECONDS` (60 sn) sonra düşer;
  düştükten sonra gelen `rematch:accept` `error { code: 'REMATCH_EXPIRED' }` alır.
- **KK-058** `[BİRİM]` Rövanş sonrası `rooms.version` sıfırlanmaz, artmaya devam eder
  (monotoniklik hiçbir koşulda bozulmaz).

### 2.6 Kopma, yeniden bağlanma, resync (US-P0-12)

- **KK-060** `[BİRİM]` İstemci `WS_HEARTBEAT_MS` (25 sn) aralıkla `ping` gönderir; 2 heartbeat
  içinde `pong` gelmezse bağlantıyı kopmuş sayar ve yeniden bağlanmaya başlar.
- **KK-061** `[BİRİM]` Yeniden bağlanma gecikmesi `WS_RECONNECT_BASE_MS`'ten başlar, her denemede
  iki katına çıkar, `WS_RECONNECT_MAX_MS`'i aşmaz; ±%20 jitter uygulanır.
- **KK-062** `[E2E]` Ağ kesilince `baglanti-durumu` `data-durum="kopuk"` olur ve tahta girdi kabul
  etmez; bağlantı dönünce `data-durum="bagli"` olur.
- **KK-063** `[E2E]` Ağ kopukken rakip hamle yapar; bağlantı dönen istemcinin tahtası
  **tam `state` mesajıyla** rakibin tahtasına eşitlenir (dokuz hücrenin tamamı ve `sira-gostergesi`).
- **KK-064** `[BİRİM]` Yeniden bağlanan istemci `join` gönderir; sunucu koltuğu `userId` ile
  eşleştirir ve tam `state` döner — oda dolu olsa bile `ROOM_FULL` **dönmez**.
- **KK-065** `[E2E]` Yeniden bağlanma sırasında yerelde bekleyen (`data-bekliyor`) hamle varsa,
  gelen `state` bunu kabul veya iptal eder; ekranda 2 sn'den uzun süre "bekliyor" işaretli hücre kalmaz.

### 2.7 Terk etme ve zaman aşımı (US-P1-06, US-P1-07)

- **KK-070** `[E2E]` Rakip sekmesini kapattığında kalan oyuncu 2 sn içinde
  "Rakibin bağlantısı koptu — 30 sn içinde dönmezse oyunu kazanırsın." metnini ve geri sayan
  bir sayacı görür.
- **KK-071** `[E2E]` Kopan oyuncu `DISCONNECT_GRACE_SECONDS` (30 sn) içinde dönerse oyun kaldığı
  yerden sürer; kalan oyuncuda "Rakip geri döndü." metni görünür ve sayaç kaybolur.
- **KK-072** `[E2E]` 30 sn dolduğunda oyun biter: kalan oyuncu kazanır, `games.endReason === 'abandon'`,
  `stats` buna göre güncellenir.
- **KK-073** `[E2E]` Sıra bendeyken `sure-sayaci` `MOVE_TIMEOUT_SECONDS`'ten (60) geriye sayar;
  hamle yapıldığında karşı taraf için 60'tan yeniden başlar.
- **KK-074** `[E2E]` Süre sıfırlandığında sırası gelen oyuncu kaybeder; iki ekranda da
  "Süre doldu." + sonuç görünür; `games.endReason === 'timeout'`.
- **KK-075** `[BİRİM]` Zaman aşımı **tembel de** değerlendirilir: `rooms.turnDeadline` geçmişken
  gelen herhangi bir mesaj, o mesaj işlenmeden önce oyunu zaman aşımıyla bitirir
  (Fluid instance'ı ölse bile sonuç kaybolmaz).
- **KK-076** `[BİRİM]` Her iki oyuncu da bağlı değilken zaman aşımı ya da terk kararı **yazılmaz**;
  oyun `finishedAt: null` kalır, oda `ROOM_TTL_SECONDS` (2 saat) sonra TTL ile silinir ve bu oyun
  hiçbir istatistiğe/ELO'ya/geçmişe girmez.
- **KK-077** `[BİRİM]` Bitmemiş (`finishedAt: null`) oyunlar `stats`, ELO ve maç geçmişi
  sorgularının hiçbirinde görünmez.

### 2.8 Profil ve görünüm (US-P1-01, US-P1-02, US-P1-08)

- **KK-080** `[E2E]` `/profil` görünen adı, e-postayı ve `istatistik-galibiyet` /
  `-maglubiyet` / `-beraberlik` sayılarını gösterir; sayılar `users.stats` ile birebir eşittir.
- **KK-081** `[E2E]` Yeni kullanıcının üç sayacı da `0`, ELO'su `1200`'dür.
- **KK-082** `[E2E]` Görünen ad 2–40 karakter aralığında değiştirilebilir; kaydedildikten sonra
  sayfa yenilendiğinde yeni ad görünür. Aralık dışı değer HTTP 400 ile reddedilir.
- **KK-083** `[E2E]` Tema değiştirici koyu temaya alındığında `<html>` üzerinde `data-tema="koyu"`
  bulunur ve seçim sayfa yenilemesinden sonra korunur.
- **KK-084** `[BİRİM]` Web ve mobil aynı renk değerlerini `@xox/ui-tokens`'tan alır; her iki
  uygulamada da literal hex renk kodu bulunmaz (`ui-tokens` dışında hex yasak).

### 2.9 Mobil (US-P1-03)

- **KK-090** `[E2E]` `apps/mobile` web hedefi (`expo export -p web`) hata vermeden derlenir ve
  `apps/e2e` duman testi `dist/` çıktısına karşı ana ekranı yükler.
- **KK-091** `[E2E]` Mobil web hedefinde: giriş → oda kur → kod görünür → ikinci istemci (web)
  aynı odaya katılır → hamle iki tarafta senkron olur.
- **KK-092** `[BİRİM]` Mobil tüm ekranlar §4.2'deki rotalarda tanımlıdır ve `expo-router`
  `_layout` ağacından erişilebilir (route snapshot testi).
- **KK-093** `[MANUEL]` Expo Go'da uygulama açılır, giriş yapılır ve bir oyun tamamlanır.
  (Ajan sürdüremez — Ömer doğrular. Sabah raporunda "insan doğrulaması bekliyor" olarak listelenir.)

### 2.10 Yayın ve gözlemlenebilirlik (US-P1-04, US-P1-05)

- **KK-100** `[E2E]` `https://xox.omerdursun.com/api/health` 200 ve `{"ok":true,"db":"xox_prod"}` döner.
- **KK-101** `[E2E]` Preview ortamı `xox_test`, production `xox_prod` veritabanına bağlanır
  (`/api/health` `db` alanıyla doğrulanır) — ortam karışması testle yakalanır.
- **KK-102** `[BİRİM]` Kasıtlı fırlatılan bir hata Sentry'ye ulaşır (test event id ile doğrulanır).
- **KK-103** `[BİRİM]` Sentry'ye giden olaylarda e-posta, parola, JWT ve `MONGODB_URI` bulunmaz
  (`beforeSend` maskeleme testi).
- **KK-104** `[BİRİM]` Vercel Analytics ve Speed Insights production build'de yüklüdür.

### 2.11 ELO, sıralama, geçmiş (US-P2-01…03, US-P2-07)

- **KK-110** `[BİRİM]` ELO standart formülle hesaplanır: `beklenen = 1 / (1 + 10^((Rb-Ra)/400))`,
  `yeni = round(R + K × (sonuç - beklenen))`, `K = 24`, sonuç 1/0.5/0. Puan **100'ün altına inmez**.
- **KK-111** `[BİRİM]` Beraberlikte eşit puanlı iki oyuncunun ELO'su değişmez (delta 0).
- **KK-112** `[BİRİM]` ELO değişimi toplam hamle sayısı 3'ten az olan oyunlarda **uygulanmaz**
  (`rated: false`) — anında pes ederek puan aktarımı engellenir.
- **KK-113** `[BİRİM]` Aynı iki kullanıcı arasında son 24 saatte 3 puanlı oyun oynanmışsa
  sonraki oyunlar `rated: false` kaydedilir ve ELO değişmez. `stats` sayaçları etkilenmez
  (galibiyet sayılır, puan sayılmaz).
- **KK-114** `[BİRİM]` Bilgisayara karşı oyunlar hiçbir koşulda `rated` değildir.
- **KK-115** `[E2E]` `/siralama` en yüksek ELO'lu 50 oyuncuyu sıralı gösterir; listeye girmek için
  **en az 5 puanlı oyun** şartı vardır; giriş yapan kullanıcı ilk 50'de değilse kendi satırı
  listenin altında ayrıca gösterilir.
- **KK-116** `[E2E]` `/gecmis` son 20 bitmiş oyunu tarih (yeniden eskiye), rakip adı, sonuç ve
  ELO değişimi (`+12` / `-11` / `0`) ile listeler; puansız oyunlarda ELO sütunu "—" gösterir.
- **KK-117** `[BİRİM]` `/api/leaderboard` ve `/api/matches` sorguları indeks kullanır
  (`elo` ve `finishedAt` üzerinde `explain` çıktısında COLLSCAN yoktur).

### 2.12 Davet, emoji, arkadaş (US-P2-04…06)

- **KK-120** `[E2E]` Oda ekranındaki "Linki kopyala" düğmesi panoya
  `<origin>/davet/<KOD>` yazar; `data-kopyalandi="true"` işareti 2 sn görünür.
- **KK-121** `[E2E]` Oturum açmamış bir istemci `/davet/ABC234` adresine gittiğinde giriş yapmaya
  yönlendirilir ve giriş sonrası doğrudan `/oda/ABC234` adresine ulaşır.
- **KK-122** `[E2E]` Emoji paleti tam **8** sabit emoji gösterir; birine basıldığında karşı tarafta
  `emoji-balonu` 2 sn içinde belirir ve 3 sn sonra kaybolur.
- **KK-123** `[BİRİM]` Beyaz liste dışı bir emoji/metin gönderen `chat:emoji` mesajı
  `error { code: 'INVALID_MESSAGE' }` alır ve karşı tarafa iletilmez (XSS/istismar yüzeyi kapalı).
- **KK-124** `[BİRİM]` 10 saniyede 5'ten fazla emoji gönderen bağlantı `error { code: 'RATE_LIMITED' }`
  alır; fazla mesajlar iletilmez.
- **KK-125** `[E2E]` Oyun bitiş ekranındaki "Arkadaş ekle" düğmesi rakibe istek gönderir; rakip
  `/arkadaslar` sayfasında isteği görür ve kabul ettiğinde iki tarafın listesinde de birbirleri çıkar.
- **KK-126** `[BİRİM]` Arkadaş isteği **yalnızca** birlikte bitmiş bir oyunu olan kullanıcılara
  gönderilebilir; başka bir `userId` için istek HTTP 403 döner (kullanıcı numaralandırma yüzeyi yok).
- **KK-127** `[E2E]` Arkadaş listesinden çıkarma iki taraf için de ilişkiyi siler.

---

## 3. Edge case'ler ve beklenen davranışlar

Her satır bir kabul kriterine bağlıdır; bağlı olmayanı yazmadım.

### 3.1 Rakip oyun ortasında sekmeyi kapatırsa

**Beklenen:** WS kapanışı algılanır → kalan oyuncuya `opponent:left` gider → odada
`disconnectedAt` damgalanır → kalan oyuncuda **30 saniyelik** geri sayım başlar.

- 30 sn içinde dönerse: `opponent:joined` yayınlanır, sayaç iptal, oyun sürer. (KK-071)
- 30 sn dolarsa: oyun `abandon` sebebiyle biter, kalan oyuncu kazanır, `stats` ve (şartlar
  sağlanıyorsa) ELO güncellenir. (KK-072)
- Kalan oyuncu da 30 sn dolmadan kapanırsa: **hiçbir sonuç yazılmaz.** Oyun `finishedAt: null`
  kalır, oda TTL ile silinir, hiçbir istatistik değişmez. (KK-076)
- Karar gerekçesi: 30 sn, mobil ağ geçişini (wifi→LTE) kurtaracak kadar uzun, terk eden rakibi
  bekletmeyecek kadar kısa. Sabit `DISCONNECT_GRACE_SECONDS` olarak `@xox/shared`'a eklenir.

### 3.2 Aynı kullanıcı iki sekmede aynı odaya katılırsa

**Beklenen:** **Son bağlantı kazanır (takeover).** Koltuk sahipliği bağlantıya değil `userId`'ye
aittir. İkinci sekme `join` gönderdiğinde:

- Sunucu aynı `userId`'nin açık bir bağlantısı olduğunu görür, **eskisini** `error
{ code: 'SESSION_TAKEOVER' }` gönderip 4409 ile kapatır.
- Eski sekme "Bu hesapla başka bir sekmeden bağlanıldı. Oyun burada devam etmiyor." gösterir,
  tahta salt-okunur olur, otomatik yeniden bağlanma **denenmez** (aksi halde iki sekme sonsuz
  takeover savaşına girer — bu kural açıkça yazılmıştır).
- Yeni sekme tam `state` alır ve oyun kesintisiz sürer. Rakip **hiçbir kopma görmez**
  (grace başlatılmaz — yerini alan bağlantı anında geldi).
- Aynı kural farklı odalar için de geçerlidir: bir kullanıcının aynı anda tek aktif oyun
  bağlantısı olur; eski odadaki koltuğu kopmuş sayılır ve 3.1'deki grace başlar.
- Reddedilen alternatif: iki sekmenin aynı koltuğu paylaşması. Sunucu tarafında güvenli
  (sıra + doluluk kontrolü yeterli) ama kullanıcı için iki farklı tahta görüntüsü doğurur ve
  Playwright'ta deterministik değil.

### 3.3 Üçüncü bir kullanıcı dolu odanın koduna girerse

**Beklenen:** `error { code: 'ROOM_FULL' }` → "Bu oda dolu." Katılım gerçekleşmez, izleyici modu
**yoktur** (protokolde izleyici mesajı yok, kapsam dışı).

**Kritik ayrım:** Doluluk kontrolü koltuk **sahipliğine** bakar, bağlantı sayısına değil.
`seats.X === userId || seats.O === userId` ise bu bir **yeniden bağlanmadır** ve oda dolu olsa da
kabul edilir (KK-064). Bu kontrol ters sırayla yazılırsa kopan oyuncu kendi odasına giremez —
klasik hata, testle kilitlenmiştir.

Oda `finished` durumundayken de koltuklar atanmış kalır; üçüncü kullanıcı yine `ROOM_FULL` alır.

### 3.4 Ağ koptu, sıra karşı taraftaydı, bağlantı geri geldi

**Beklenen:** İstemci hiçbir şeyi tahmin etmez, **tam durumu sunucudan alır.**

1. İstemci üstel geri çekilmeyle yeniden bağlanır (KK-061).
2. Aynı `roomCode` ile `join` gönderir.
3. Sunucu tam `state` döner: `board`, `status`, `players`, `version` (+ P1'de `turnDeadline`).
4. İstemci yerel tahtasını **tümüyle** gelen `board` ile değiştirir — diff/merge yapmaz.
5. Bekleyen iyimser hamle varsa: gelen tahtada varsa onaylanır, yoksa sessizce silinir (KK-065).
6. `version` yerelden küçükse (imkânsız ama savunma) gelen kazanır; sunucu otoriterdir.
7. Kopukken kaçırılan `move:applied` mesajları **tekrar oynatılmaz** — `state` zaten sonucu içerir.

Ara durum: kopukken oyun bitmişse gelen `state.status` `won`/`draw` olur ve istemci doğrudan
sonuç ekranını gösterir; ayrıca `game:over` beklemez.

### 3.5 İki oyuncu neredeyse aynı anda hamle gönderirse

Üç ayrı senaryo, üç ayrı sonuç:

| Durum                                                              | Sonuç                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Sıra X'te; X ve O aynı anda gönderir                               | X'inki uygulanır. O `move:rejected { reason: 'not-your-turn' }` alır, iyimser taşı geri alınır. (KK-042) |
| X aynı anda iki farklı hücreye gönderir (çift tıklama / iki cihaz) | İlki uygulanır, ikincisi `not-your-turn` ile reddedilir — çünkü sıra artık O'dadır. (KK-044)             |
| İki yazma aynı `version` ile veritabanına ulaşır                   | Koşullu `findOneAndUpdate` yalnızca birini geçirir; diğeri 0 doküman günceller ve reddedilir. (KK-045)   |

`version` monotonik artar ve **asla atlamaz**; istemci boşluk görürse resync ister (KK-047).
İstemci `move` mesajına version koymaz — sıra sahipliği + hücre doluluğu tam koruma sağlar,
protokolde değişiklik gerekmez.

### 3.6 Oda kodu çakışırsa

**Beklenen:** `rooms.code` üzerindeki unique index çakışmayı yakalar (duplicate key 11000).
Sunucu yeni kod üretip **en fazla 5 kez** dener. 5 denemede de çakışırsa 503 +
`CODE_GENERATION_FAILED` → "Şu anda oda kurulamıyor, birazdan tekrar dene." (KK-035)

Bağlam: alfabe 32 karakter, 6 hane → ~1,07 milyar kombinasyon; TTL 2 saat olduğu için aynı anda
canlı oda sayısı çok küçük kalır. Çakışma pratikte imkânsıza yakındır ama **testle zorlanır**
(kod önceden ekleyip yeniden deneme yolunu tetikleyerek) — yoksa bu dal hiç çalıştırılmadan
"kapsandı" sanılır.

TTL ile silinmiş bir odanın kodu yeniden üretilebilir; bu kabul edilebilir çünkü eski oyuncular
o kodu kullanmaya çalıştığında yeni ve farklı bir odaya düşerler — ancak koltuk sahipliği
kontrolü onları `ROOM_FULL`/yeni oyuncu olarak doğru ele alır.

### 3.7 Hamle süresi dolarsa kim kazanır?

**Beklenen:** **Sırası gelen oyuncu kaybeder**, rakip kazanır (`endReason: 'timeout'`).

- Süre `MOVE_TIMEOUT_SECONDS` = 60 sn; her hamleyle karşı taraf için sıfırlanır.
- Sayaç kaynağı sunucudaki `rooms.turnDeadline`'dır; istemci saatine güvenilmez, geri sayım
  sunucudan gelen mutlak zamana göre çizilir.
- İki yürütme yolu vardır ve **ikisi de gerekir**:
  1. Bağlı bir instance'ta zamanlayıcı dolar → oyun bitirilir, `game:over` yayınlanır.
  2. **Tembel kontrol:** herhangi bir mesaj işlenmeden önce `turnDeadline` geçmiş mi bakılır.
     Fluid instance'ı öldüyse sonuç bir sonraki temasta kesinleşir. (KK-075)
- Zaman aşımı ve terk aynı anda gerçekleşirse (rakip hem kopuk hem süresi doldu): **önce dolan**
  kazanır; eşitlikte `timeout` uygulanır (deterministik olması için sıralama yazılıdır).
- Her iki taraf da bağlı değilse hiçbir sonuç yazılmaz (KK-076).

### 3.8 Rövanş teklifi verildi, karşı taraf ayrıldı

**Beklenen:** Teklif **bağlantıya bağlıdır, kalıcı değildir.** Karşı taraf ayrılınca teklif iptal
edilir; teklif eden "Rakip ayrıldı." mesajını ve "Yeni oda kur" / "Ana sayfa" seçeneklerini görür.

- Ayrılan oyuncu 30 sn içinde dönerse teklif **yeniden gönderilmez**; teklif eden dilerse tekrar
  teklif eder. Gerekçe: `state` mesajında rövanş alanı yok; teklifi kalıcılaştırmak protokol
  değişikliği gerektirir ve P0 için gereksiz karmaşıklıktır.
- Teklif 60 sn içinde kabul edilmezse düşer (KK-057).
- İki taraf da aynı anda teklif ederse: ikinci `rematch:offer` doğrudan kabul sayılır ve yeni
  oyun başlar (karşılıklı teklif = mutabakat).
- Rövanş beklerken oyun sonucu **zaten yazılmıştır**; rövanşın reddi veya düşmesi geçmiş oyunu
  etkilemez.

### 3.9 Kullanıcı kendi odasına ikinci hesapla katılıp ELO çiftlemeye çalışırsa

Sistem farklı `userId`'leri ayırt edemez; savunma **tespit** değil **ödül kısıtı**dır:

1. **Çift-koltuk imkânsız:** Aynı `userId` iki koltuğa oturamaz; ikinci bağlantı takeover'dır (3.2).
   Yani tek hesapla kendine karşı oynanamaz.
2. **Kısa oyun puansız:** Toplam hamle < 3 olan oyunlar `rated: false` (KK-112). Anında pes ederek
   puan aktarımı çalışmaz.
3. **Çift kısıtı:** Aynı iki `userId` arasında son 24 saatte 3 puanlı oyundan fazlası `rated: false`
   (KK-113). Bir gecede yüzlerce oyunla puan pompalamak imkânsız hâle gelir.
4. **Sıralama eşiği:** Listeye girmek için ≥ 5 puanlı oyun (KK-115).
5. `stats` (G/M/B) sayaçları etkilenmez — istatistik doğru kalır, yalnızca puan verilmez.

Reddedilen alternatifler: IP eşleşmesine bakmak (aynı evdeki iki gerçek oyuncuyu cezalandırır ve
Vercel ardında güvenilmez), cihaz parmak izi (kapsam ve gizlilik dışı), hamle deseni analizi (P2
için aşırı).

### 3.10 Diğer sınır durumları

| Durum                                                 | Beklenen davranış                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Oda kurdu ama kimse katılmadı                         | Oda `waiting` kalır; 2 saat işlem görmezse TTL siler. Ekranda "Rakip bekleniyor" ve kod görünür    |
| Rakip beklerken kurucunun kendisi ayrılır             | Oda `waiting` kalır ve kod hâlâ geçerlidir; kurucu dönerse aynı koltuğa oturur                     |
| Kullanıcı kendi kurduğu odanın koduna kendisi katılır | `join` bir yeniden bağlanma olarak ele alınır; ikinci koltuk **açılmaz**                           |
| Süresi dolmuş (TTL) odanın kodu girilir               | `ROOM_NOT_FOUND` — "Böyle bir oda yok. Kodu kontrol et."                                           |
| Oyun bitmiş odanın koduna üçüncü kişi girer           | `ROOM_FULL`                                                                                        |
| Tarayıcı sekmesi arka plana alınır (mobil)            | Heartbeat durursa kopma sayılır; öne gelince otomatik yeniden bağlanma + resync (3.4 ile aynı yol) |
| Aynı anda hem pes hem hamle gönderilir                | Sunucuya ilk ulaşan işlenir; oyun bittiği için diğeri `game-over` ile reddedilir                   |
| Bozuk/şemasız WS mesajı                               | `INVALID_MESSAGE`; art arda 3 ihlalde bağlantı 4400 ile kapanır (KK-048)                           |
| Emoji seli                                            | 10 sn'de 5 mesaj sınırı, aşımda `RATE_LIMITED` (KK-124)                                            |
| Mongo change stream aboneliği düşerse                 | Bağlantı yeniden abone olur ve tam `state` yayınlar; sessizce sağır kalması yasak                  |
| İstemci saati yanlış                                  | Tüm süreler sunucudan gelen mutlak zaman damgasıyla çizilir; istemci saati kullanılmaz             |
| Kullanıcı oyun ortasında parolasını değiştirir        | Kapsam dışı (parola değiştirme v1'de yok — §6)                                                     |

---

## 4. Ekran envanteri

### 4.1 Web — `apps/web` (Next.js 16 App Router)

Rota adları Türkçedir (kullanıcıya görünür yüzey), dosya/bileşen adları İngilizce kalır.

| Rota               | Katman | Erişim  | İçerik                                                                                                                                                                                                                                                           |
| ------------------ | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | P0     | Herkese | Logo + tagline. **Girişsiz:** "Giriş yap" / "Kayıt ol". **Girişli:** 3 CTA (`btn-bilgisayara-karsi`, `btn-oda-kur`, `btn-odaya-katil`) + kod giriş alanı + profil rozeti                                                                                         |
| `/giris`           | P0     | Herkese | E-posta, parola, `btn-giris`, `hata-mesaji`, "Hesabın yok mu? Kayıt ol" bağlantısı. `?donus=` parametresini korur                                                                                                                                                |
| `/kayit`           | P0     | Herkese | Görünen ad, e-posta, parola (min 8), `btn-kayit`, `hata-mesaji`, "Zaten hesabın var mı? Giriş yap"                                                                                                                                                               |
| `/oyna/bilgisayar` | P0     | Girişli | Zorluk seçici (3 düğme), `tahta`, `durum-metni`, "Yeniden oyna", "Ana sayfa". **Tamamen istemci tarafı** — WS yok, kayıt yok                                                                                                                                     |
| `/oda/[kod]`       | P0     | Girişli | `oda-kodu`, "Kodu kopyala", `rakip-adi`, `tahta`, `sira-gostergesi`, `durum-metni`, `baglanti-durumu`, `btn-pes-et`; oyun sonrası `btn-rovans-teklif`/`btn-rovans-kabul`; P1: `sure-sayaci`, terk geri sayımı; P2: emoji paleti, "Linki kopyala", "Arkadaş ekle" |
| `/oda/katil`       | P0     | Girişli | 6 haneli kod girişi (otomatik büyük harf, boşluk kırpma), `btn-odaya-katil`, `hata-mesaji`. Ana sayfadaki alanın derin bağlanabilir eşi                                                                                                                          |
| `/profil`          | P1     | Girişli | Görünen ad (düzenlenebilir), e-posta (salt okunur), üç istatistik sayacı, tema değiştirici, "Çıkış yap"; P2: `elo-puani`, sıralama yeri                                                                                                                          |
| `/siralama`        | P2     | Girişli | İlk 50: sıra no, ad, ELO, G/M/B. Kullanıcı ilk 50'de değilse kendi satırı altta ayrıca                                                                                                                                                                           |
| `/gecmis`          | P2     | Girişli | Son 20 bitmiş oyun: tarih, rakip, sonuç, bitiş sebebi, ELO değişimi                                                                                                                                                                                              |
| `/arkadaslar`      | P2     | Girişli | Bekleyen istekler (kabul/reddet) + arkadaş listesi (ad, ELO, çıkar)                                                                                                                                                                                              |
| `/davet/[kod]`     | P2     | Herkese | Ara sayfa: girişliyse `/oda/[kod]`'a yönlendirir, değilse `/giris?donus=/oda/[kod]`                                                                                                                                                                              |

Global öğeler: üst çubukta logo + profil rozeti (girişliyse), `hata-mesaji` için ortak bildirim
alanı, tema `data-tema` özniteliğiyle `<html>` üzerinde.

Sunucu yüzeyi (adlandırma `xox-architect`'in kararı; **gereken yetenekler** listelenmiştir):
oda kurma, oda özeti sorgulama, kayıt, mobil auth köprüsü (`authorize`/`callback`/`refresh`),
profil okuma/güncelleme, sıralama, maç geçmişi, arkadaşlık işlemleri, oyun WebSocket'i,
mevcut `/api/health`.

### 4.2 Mobil — `apps/mobile` (Expo 57 + expo-router)

| Rota                      | Katman | İçerik                                                                                                          |
| ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `app/index.tsx`           | P0     | Web `/` karşılığı — 3 CTA + kod alanı, girişsizken giriş çağrısı                                                |
| `app/giris.tsx`           | P0     | `expo-auth-session` ile tarayıcı akışını başlatır; dönen deep link'i işler, token'ı `expo-secure-store`'a yazar |
| `app/kayit.tsx`           | P0     | Kayıt formu (aynı REST uç noktası) veya tarayıcı akışına yönlendirme                                            |
| `app/oyna/bilgisayar.tsx` | P1     | Zorluk + tahta, tamamen yerel                                                                                   |
| `app/oda/katil.tsx`       | P1     | Kod girişi                                                                                                      |
| `app/oda/[kod].tsx`       | P1     | Web oda ekranının birebir işlevsel karşılığı (aynı `testID`'ler)                                                |
| `app/profil.tsx`          | P1     | İstatistikler, ad düzenleme, tema, çıkış                                                                        |
| `app/siralama.tsx`        | P2     | Sıralama                                                                                                        |
| `app/gecmis.tsx`          | P2     | Maç geçmişi                                                                                                     |
| `app/arkadaslar.tsx`      | P2     | Arkadaş listesi                                                                                                 |

Mobil kısıtları: `@xox/db` **import edilemez** (bağımlılık grafiği); tüm veri REST/WS üzerinden
gelir. Deep link şeması `xox://`, auth dönüşü `xox://auth`. Metin kaynağı mobilin kendi
`messages/tr.ts` dosyasıdır ve web'dekiyle **aynı anahtar ağacını** kullanır (kopya değil, eşbiçim —
uyumu bir test doğrular).

---

## 5. Türkçe metin taslağı

`apps/web/messages/tr.ts` içinde bu ağaç kullanılır (mevcut `app`, `common`, `home` anahtarları
korunur ve genişletilir). Metinler burada kesinleşmiştir; uygulama sırasında **uydurulmaz**.

```ts
export const tr = {
  app: { name: 'XOX', tagline: 'Arkadaşınla ya da bilgisayara karşı oyna' },

  common: {
    loading: 'Yükleniyor…',
    error: 'Bir şeyler ters gitti',
    retry: 'Tekrar dene',
    cancel: 'Vazgeç',
    save: 'Kaydet',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    back: 'Geri',
    home: 'Ana sayfa',
    confirm: 'Onayla',
  },

  auth: {
    signIn: 'Giriş yap',
    signUp: 'Kayıt ol',
    signOut: 'Çıkış yap',
    email: 'E-posta',
    password: 'Parola',
    displayName: 'Görünen ad',
    noAccount: 'Hesabın yok mu?',
    hasAccount: 'Zaten hesabın var mı?',
    signingIn: 'Giriş yapılıyor…',
    mobileOpening: 'Tarayıcıda giriş açılıyor…',
    mobileReturn: 'Girişin tamamlandı, uygulamaya dönülüyor…',
  },

  home: {
    playVsComputer: 'Bilgisayara karşı',
    createRoom: 'Oda kur',
    joinRoom: 'Odaya katıl',
    codePlaceholder: 'Oda kodu (6 hane)',
    welcome: 'Hoş geldin, {ad}',
  },

  computer: {
    title: 'Bilgisayara karşı',
    difficulty: 'Zorluk',
    easy: 'Kolay',
    medium: 'Orta',
    unbeatable: 'Yenilmez',
    thinking: 'Bilgisayar düşünüyor…',
    playAgain: 'Yeniden oyna',
    notCounted: 'Bilgisayara karşı oyunlar istatistiklere ve puana sayılmaz.',
  },

  room: {
    title: 'Oda',
    code: 'Oda kodu',
    copyCode: 'Kodu kopyala',
    copyLink: 'Linki kopyala',
    waitingOpponent: 'Rakip bekleniyor',
    shareHint: 'Kodu arkadaşına gönder, aynı odaya katılsın.',
    opponentJoined: '{ad} odaya katıldı.',
    you: 'Sen',
    opponent: 'Rakip',
    yourSymbol: 'Senin taşın: {tas}',
    resign: 'Pes et',
    resignConfirm: 'Pes etmek istediğine emin misin? Oyunu kaybedeceksin.',
    leave: 'Odadan çık',
  },

  game: {
    yourTurn: 'Sıra sende',
    opponentTurn: 'Sıra rakipte',
    youWon: 'Kazandın!',
    youLost: 'Kaybettin.',
    draw: 'Berabere.',
    wonByResign: 'Rakibin pes etti — kazandın!',
    lostByResign: 'Pes ettin, oyunu kaybettin.',
    wonByTimeout: 'Rakibin süresi doldu — kazandın!',
    lostByTimeout: 'Süren doldu, oyunu kaybettin.',
    wonByAbandon: 'Rakibin oyunu terk etti — kazandın!',
    timeLeft: 'Kalan süre: {saniye} sn',
    hurry: 'Acele et!',
  },

  connection: {
    connected: 'Bağlı',
    connecting: 'Bağlanıyor…',
    disconnected: 'Bağlantı koptu',
    reconnecting: 'Yeniden bağlanılıyor…',
    reconnected: 'Bağlantı geri geldi.',
    resyncing: 'Oyun durumu alınıyor…',
    opponentDisconnected:
      'Rakibin bağlantısı koptu — {saniye} sn içinde dönmezse oyunu kazanırsın.',
    opponentReturned: 'Rakip geri döndü.',
    opponentLeft: 'Rakip ayrıldı.',
    takenOver: 'Bu hesapla başka bir sekmeden bağlanıldı. Oyun burada devam etmiyor.',
  },

  rematch: {
    offer: 'Rövanş iste',
    accept: 'Rövanşı kabul et',
    waiting: 'Rövanş yanıtı bekleniyor…',
    offered: 'Rakip rövanş istiyor.',
    expired: 'Rövanş teklifi zaman aşımına uğradı.',
    cancelled: 'Rakip ayrıldığı için rövanş iptal oldu.',
    started: 'Rövanş başladı — taşlar yer değiştirdi.',
    newRoom: 'Yeni oda kur',
  },

  profile: {
    title: 'Profil',
    stats: 'İstatistikler',
    wins: 'Galibiyet',
    losses: 'Mağlubiyet',
    draws: 'Beraberlik',
    elo: 'Puan',
    rank: 'Sıralama',
    editName: 'Adı düzenle',
    nameSaved: 'Adın güncellendi.',
    theme: 'Tema',
    themeLight: 'Açık',
    themeDark: 'Koyu',
  },

  leaderboard: {
    title: 'Sıralama',
    rank: 'Sıra',
    player: 'Oyuncu',
    elo: 'Puan',
    record: 'G/M/B',
    yourRank: 'Senin sıran',
    empty: 'Henüz sıralamaya giren oyuncu yok.',
    requirement: 'Sıralamaya girmek için en az 5 puanlı oyun oynamalısın.',
  },

  history: {
    title: 'Maç geçmişi',
    date: 'Tarih',
    opponent: 'Rakip',
    result: 'Sonuç',
    eloChange: 'Puan',
    win: 'Galibiyet',
    loss: 'Mağlubiyet',
    drawResult: 'Beraberlik',
    unrated: 'Puansız',
    empty: 'Henüz tamamlanmış oyunun yok.',
  },

  friends: {
    title: 'Arkadaşlar',
    add: 'Arkadaş ekle',
    requestSent: 'Arkadaşlık isteği gönderildi.',
    pending: 'Bekleyen istekler',
    accept: 'Kabul et',
    reject: 'Reddet',
    remove: 'Çıkar',
    empty: 'Henüz arkadaşın yok. Bir oyun bitir ve rakibini ekle.',
  },

  chat: {
    sendEmoji: 'Emoji gönder',
    tooFast: 'Biraz yavaş — çok hızlı emoji gönderiyorsun.',
  },

  errors: {
    UNAUTHENTICATED: 'Bu sayfa için giriş yapmalısın.',
    INVALID_CREDENTIALS: 'E-posta veya parola hatalı.',
    EMAIL_TAKEN: 'Bu e-posta zaten kayıtlı.',
    WEAK_PASSWORD: 'Parola en az 8 karakter olmalı.',
    INVALID_EMAIL: 'Geçerli bir e-posta adresi gir.',
    INVALID_NAME: 'Görünen ad 2 ile 40 karakter arasında olmalı.',
    ROOM_NOT_FOUND: 'Böyle bir oda yok. Kodu kontrol et.',
    ROOM_FULL: 'Bu oda dolu.',
    INVALID_CODE: 'Oda kodu 6 haneli olmalı ve yalnızca harf-rakam içermeli.',
    CODE_GENERATION_FAILED: 'Şu anda oda kurulamıyor, birazdan tekrar dene.',
    NOT_YOUR_TURN: 'Sıra sende değil.',
    CELL_OCCUPIED: 'Bu hücre dolu.',
    GAME_OVER: 'Oyun bitti.',
    INVALID_MESSAGE: 'Geçersiz istek.',
    SESSION_TAKEOVER: 'Bu hesapla başka bir yerden bağlanıldı.',
    REMATCH_EXPIRED: 'Rövanş teklifi zaman aşımına uğradı.',
    RATE_LIMITED: 'Çok hızlısın, biraz bekle.',
    NOT_FRIENDS_ELIGIBLE: 'Yalnızca birlikte oyun bitirdiğin oyuncuları ekleyebilirsin.',
    SERVER_ERROR: 'Sunucuda bir sorun oluştu. Tekrar dene.',
    NETWORK: 'Bağlantı sorunu. İnternetini kontrol et.',
  },
} as const
```

**Metin kuralları:**

- Kullanıcıya **sen** diye hitap edilir (oyun bağlamı, samimi ton). Tüm metinler bu tekil ikinci
  tekil şahıs kalıbında yazılır; "siz" karışımı yasaktır.
- Hata mesajları **ne olduğunu ve ne yapılacağını** söyler; kod/stack sızdırmaz.
- Emoji paleti (P2, sabit ve beyaz listeli): `👋 😀 😂 😮 😢 👏 🔥 🤝`.
- Yer tutucular `{ad}`, `{saniye}`, `{tas}` biçimindedir.

---

## 6. Kapsam dışı (bilinçli olarak yapılmayacaklar)

Harness §15'e ek olarak, bu spec'in **açıkça dışladıkları**:

| Dışlanan                                       | Gerekçe                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Misafir (hesapsız) oyun                        | "Hesap zorunlu" yer gerçeği                                               |
| OAuth sağlayıcılar (Google/GitHub)             | Ömer'in hesap açması gerekiyor; §7-AS-01 açık soru olarak duruyor         |
| Parola sıfırlama / e-posta doğrulama           | E-posta gönderim sağlayıcısı (vendor + secret) gerektirir; v1'de yok      |
| İzleyici (spectator) modu                      | Protokolde izleyici mesajı yok, koltuk modeli iki kişilik                 |
| Otomatik eşleştirme (matchmaking) kuyruğu      | v1 yalnızca kodla davet                                                   |
| Turnuva, NxN tahta, sesli/görüntülü sohbet     | Harness §15                                                               |
| Serbest metin sohbeti                          | Moderasyon yükü; yalnızca 8'li beyaz listeli emoji                        |
| Push bildirimi / e-posta bildirimi             | Harness §15                                                               |
| Çevrimiçi/çevrimdışı arkadaş durumu (presence) | Ek WS trafiği ve durum makinesi; P2 arkadaş listesi statiktir             |
| Kullanıcı arama / e-postayla arkadaş ekleme    | Kullanıcı numaralandırma yüzeyi; ekleme yalnızca oynanmış rakip üzerinden |
| Hesap silme / KVKK veri dışa aktarımı          | v1'de yok; yasal metinler kapsam dışı                                     |
| Çok dilli arayüz                               | Tek dil Türkçe (yer gerçeği); yapı ileride EN eklemeye hazır tutulur      |
| Oyun içi ses efektleri, animasyonlu geçişler   | Yalnızca kazanan çizgi vurgusu var; ötesi kapsam dışı                     |
| Zaman kontrolü seçenekleri (blitz vb.)         | Tek sabit süre: 60 sn/hamle                                               |
| Yeniden oynatma (replay) izleyicisi            | Geçmiş yalnızca sonuç listesidir, tahta tekrarı yok                       |
| Sezon/ödül/rozet sistemi                       | ELO ve sıralama yeterli                                                   |
| Redis pub/sub                                  | Change stream KK-040 bütçesini karşıladığı sürece yedek olarak kalır      |

---

## 7. Açık sorular

`durum: blocked` olanların cevabı yok — **tahmin edilmedi**, Ömer'in kararı gerekiyor.
`durum: varsayımla ilerliyor` olanlarda iki yorum da yazıldı ve hangisini varsaydığım belirtildi;
zincir bloklanmadan ilerleyebilir ama karar değişirse etkilenecek yer yazılıdır.

### AS-01 · Auth sağlayıcı: Credentials mi, OAuth mu? — `varsayımla ilerliyor`

- **Yorum A (varsaydığım):** E-posta + parola (Auth.js **Credentials** provider). Kanıtlar:
  yer gerçeğinde "kayıt/giriş" geçiyor (OAuth'ta ayrı "kayıt" adımı yoktur), `.env.example`'da
  hiçbir OAuth istemci değişkeni yok, `packages/db` seed'i sabit test kullanıcıları üretiyor ve
  Playwright'ın Google ekranını sürmesi pratik değil.
- **Yorum B:** Google/GitHub OAuth. Daha az kod ama Ömer'in OAuth uygulaması açması, secret
  üretmesi ve E2E için ayrı bir test-login kaçış yolu tanımlanması gerekir.
- **Etki:** `UserDoc`'a `passwordHash` alanı, `/kayit` ekranı ve kayıt uç noktası A'ya bağlı.
- **Not (`xox-architect` için):** Auth.js v5'te Credentials provider adapter ile kullanıcı
  **oluşturmaz** ve yalnızca JWT session ile çalışır — kayıt akışı ayrı bir uç nokta olmak
  zorundadır, `signIn` çağrısı kullanıcı yaratmaz.

### AS-02 · Sentry hesabı ve DSN — `blocked`

P1'in `KK-102`/`KK-103` kriterleri Sentry projesi ve DSN olmadan karşılanamaz.
Ömer'den gereken: Sentry organizasyonu/projesi + DSN'in Vercel env'e girilmesi (veya "Sentry'yi
atla, yalnızca Vercel Analytics" kararı).

### AS-03 · Production domain — `blocked` (OPS-001 ile aynı)

`KK-100` `xox.omerdursun.com` bağlanmadan geçemez. Board'daki OPS-001 blocker'ı aynen geçerlidir.
Bu tek kriter dışında P1'in tamamı preview üzerinde doğrulanabilir.

### AS-04 · Hesap zorunluluğu bilgisayara karşı oyunu da kapsıyor mu? — `varsayımla ilerliyor`

- **Yorum A (varsaydığım):** Evet, kapsıyor. "Hesap: **Zorunlu**" yer gerçeği koşulsuz yazılmış;
  `/oyna/bilgisayar` da korumalı (KK-007).
- **Yorum B:** Bilgisayara karşı oyun vitrin işlevi görebilir ve girişsiz açılabilir; zaten
  istatistik/ELO yazmıyor (KK-027), yani veri riski yok.
- **Etki:** Yalnızca middleware korumalı rota listesi ve KK-007. Karar B'ye dönerse tek satır.

### AS-05 · Rakip terk süresi 30 sn doğru mu? — `varsayımla ilerliyor`

Ürün kararı olarak 30 sn seçtim (mobil ağ geçişini kurtarır, terk edileni bekletmez).
Alternatif 60 sn (hamle süresiyle aynı, tek sabit). Karar değişirse yalnızca
`DISCONNECT_GRACE_SECONDS` sabiti ve KK-070/071/072 metni etkilenir.

### AS-06 · Rövanşta koltuk değişimi — `varsayımla ilerliyor`

Taşların yer değiştirmesini varsaydım (ilk hamle avantajı dönüşümlü olsun — KK-056).
Alternatif: koltuklar sabit kalır. Karar değişirse KK-056 tek başına güncellenir.

### AS-07 · ELO çift-hesap savunmasının sıkılığı — `varsayımla ilerliyor`

"24 saatte aynı çift için en fazla 3 puanlı oyun" eşiğini ben belirledim (KK-113). Gerçek
arkadaş grubunun aynı gün 4. oyununu puansız yapması bir ürün tercihidir; eşik yükseltilebilir.
Sabit olarak dışa verilir, değiştirmesi tek satırdır.

### AS-08 · Zaman aşımı P1'de, ama P0 oyunları süresiz mi? — `varsayımla ilerliyor`

Yer gerçeği zaman aşımını P1'e koyuyor. Varsaydığım: P0'da hamle süresi **yoktur** (sayaç
görünmez, süre dolmaz); terk koruması da P1'dedir. P0'da bir oyuncu ayrılırsa oyun `waiting`
benzeri bir belirsizlikte kalır ve yalnızca oda TTL'i (2 saat) temizler. Bu, P0'ın kabul edilen
eksiğidir ve P1'de KK-070…075 ile kapanır. Alternatif yorum: `MOVE_TIMEOUT_SECONDS` sabiti zaten
`shared`'da olduğu için süre P0'da da uygulanmalı — bu, P0'ı büyütür, o yüzden seçmedim.

### AS-09 · Mobil kayıt formu mu, tarayıcı köprüsü mü? — `varsayımla ilerliyor`

Varsaydığım: mobilde **giriş** tarayıcı köprüsüyle (yer gerçeği §6.3), **kayıt** ise aynı köprü
üzerinden web `/kayit` sayfası açılarak yapılır — mobilde ayrı kayıt formu ve ayrı doğrulama
kodu yazılmaz. Alternatif: mobilde yerel kayıt formu + doğrudan REST çağrısı (daha akıcı, ama
parola girişi iki yerde ve iki ayrı doğrulama yüzeyi doğurur).

---

## 8. Sözleşme boşlukları — `xox-architect`'in şema kararı vermeden önce okuması zorunlu

Mevcut `@xox/shared` ve `@xox/db` şemaları bu spec'in gerektirdiği bazı alanları **taşımıyor**.
Bunlar keşfe bırakılırsa uygulama sırasında yarı yolda protokol değişikliği gerekir.

| #   | Boşluk                                                                                                                    | Etki                    | Öneri (karar architect'in)                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `gameStatusSchema.won` **`line` alanını zorunlu** kılıyor. Pes/zaman aşımı/terk galibiyetlerinde kazanan çizgi **yoktur** | **P0 bloklayıcı**       | `line: WinLine \| null` + `reason: 'line' \| 'resign' \| 'timeout' \| 'abandon'`. `game-core`'un `GameStatus` tipi değişmez; bu **taşıma** tipidir |
| B2  | `state` mesajında `turnDeadline` yok                                                                                      | P1 (süre sayacı)        | `turnDeadline: number \| null` (epoch ms) eklenmeli — istemci saatine güvenilmiyor (KK-073)                                                        |
| B3  | `GameDoc` oyuncu kimliği taşımıyor (yalnızca `roomCode`)                                                                  | P1 stats, P2 geçmiş     | `players: { X: userId, O: userId }` alanı zorunlu                                                                                                  |
| B4  | `GameDoc`'ta `endReason` ve `rated` yok                                                                                   | P1/P2                   | `endReason` (B1 ile aynı küme) + `rated: boolean` + `eloDelta: { X: number, O: number }`                                                           |
| B5  | `RoomDoc`'ta `turnDeadline`, `disconnectedAt`, rövanş durumu yok                                                          | P1                      | `turnDeadline: Date \| null`, `disconnected: { seat, at } \| null`. Rövanş **kalıcı değil** (3.8)                                                  |
| B6  | `UserDoc`'ta `passwordHash` yok                                                                                           | P0 (AS-01 A yorumunda)  | `passwordHash: string` (adapter alanlarıyla çakışmayan ad)                                                                                         |
| B7  | `friendships` ve `matchHistory` modelleri hiç yok                                                                         | P2                      | `friendships` yeni koleksiyon; maç geçmişi `games` üzerinden türetilebilir (B3+B4 varsa) — ayrı koleksiyon gerekmeyebilir                          |
| B8  | `move:rejected.reason` serbest `string`                                                                                   | Test kırılganlığı       | `InvalidMoveReason \| 'not-your-turn'` birliği olarak daraltılmalı; testler string eşleşmesine dayanmasın                                          |
| B9  | Yeni sabitler: `DISCONNECT_GRACE_SECONDS`, `REMATCH_OFFER_TTL_SECONDS`, emoji hız sınırı, ELO sabitleri                   | P1/P2                   | `@xox/shared/constants.ts`'e eklenmeli; UI ve sunucu aynı kaynaktan okumalı                                                                        |
| B10 | `Room` TTL indeksi `updatedAt` üzerinde. `updatedAt` her hamlede tazelenir → **uzun oyun TTL'i sürekli iter**             | Doğru davranış, ama not | İstenen bu (aktif oda silinmemeli). Terk edilen oda son hamleden 2 saat sonra silinir — bilinçli                                                   |

Ek gözlem (boşluk değil, tuzak): `serverMessageSchema.state.players` `userId` taşıyor ama
**görünen ad taşımıyor**. `rakip-adi` (KK-032) için ya `state`'e ad eklenmeli ya da istemci ayrı
bir REST çağrısı yapmalı. İlki tek round-trip'tir ve KK-032'nin 2 sn bütçesine daha rahat sığar.

---

## 9. Katman → kabul kriteri haritası (ilerleme ölçümü için)

`xox-reporter` yüzdeyi bu tablodan hesaplar.

| Katman     | Kriter aralıkları                                       | Adet   |
| ---------- | ------------------------------------------------------- | ------ |
| P0         | KK-001…011, 020…027, 030…036, 040…048, 050…058, 060…065 | 50     |
| P1         | KK-070…077, 080…084, 090…093, 100…104                   | 22     |
| P2         | KK-110…117, 120…127                                     | 16     |
| **Toplam** |                                                         | **88** |

`KK-093` insan doğrulaması gerektirir; otomatik yüzdeden düşülür ve raporda ayrı satır olur.
