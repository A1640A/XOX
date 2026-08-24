# ADR-0003 — Eşzamanlılık: koşullu yazma, `version` disiplini ve otoritenin yeri

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** spec §3.5, KK-042, KK-044, KK-045, KK-047, KK-052, KK-053, KK-058

## Bağlam

Sunucu otoriter, istemci iyimser. Ama "sunucu" tek bir süreç değil: N tane Fluid instance'ı
aynı odaya aynı anda yazabilir. Üç yarış gerçek:

1. Sıra X'te; X ve O aynı anda `move` gönderir.
2. X çift tıklar / iki cihazdan aynı anda gönderir.
3. İki yazma aynı `version` değeriyle veritabanına ulaşır.

Ayrıca cevaplanması gereken bir yerleşim sorusu vardı: bu mantık `apps/web` içindeki WS
handler'ında mı, yoksa `packages/db` içinde mi yaşar?

Ve bir veri modeli sorusu: canlı tahta `rooms`'ta mı `games`'te mi durur?

## Karar

### A. Otoriter geçişler `packages/db/src/rooms/` içindedir

`createRoom`, `joinRoom`, `detachConnection`, `applyMove`, `resign`, `offerRematch`,
`acceptRematch`, `settleDeadlines`, `pushEmoji`, `finishGame`. Her biri:
saf girdi → `game-core` çağrısı → **koşullu** yazma → ayrıştırılabilir sonuç birliği
(`{ok:true,…} | {ok:false, code}`), istisna fırlatmadan.

`apps/web/lib/realtime/handlers/*` yalnız zarf açar, fonksiyonu çağırır, sonucu mesaja çevirir.

### B. Canlı tahta `rooms` dokümanındadır; `games` arşivdir

- `rooms.board`, `rooms.moves`, `rooms.version`, `rooms.turnDeadline` → oyun sürerken tek otorite.
- `games` dokümanı oyun **başlarken** `finishedAt: null` ile açılır, **oyun sürerken yazılmaz**,
  oyun biterken bir kez CAS ile doldurulur.

### C. `version` disiplini — dört kural

1. Durum değiştiren **her** yazma `$inc: { version: 1 }` içerir.
   Tek istisna: `pushEmoji` (emoji version artırmaz — bkz. Sonuçlar).
2. Yazma **her zaman** `{ code, version: beklenen }` koşuluyla yapılır. Koşulsuz `updateOne`
   `rooms/` dışında da içinde de yasaktır.
3. `version` **asla** sıfırlanmaz — rövanşta bile (KK-058).
4. `version` **asla** atlamaz; tek CAS tam olarak 1 artırır. İstemci boşluk görürse resync ister.

### D. Hamle akışı

```
taze oku → koltuk sahipliği (seats[seat].userId === userId)
         → state === 'playing'
         → nextPlayer(board) === seat            ← KK-044, game-core bunu YAPMAZ
         → isValidMove(board, index)             ← game-core
         → applyMove + evaluateStatus            ← game-core, saf
         → findOneAndUpdate({ code, version, state:'playing' }, { $set…, $push moves, $inc version })
         → null döndüyse yarışı kaybettik → 'not-your-turn'
```

### E. İstemci uzlaşması

`move:applied` yalnız `version === yerel + 1` ise uygulanır; büyükse `join` ile tam `state`
istenir; küçük veya eşitse yoksayılır. `state` geldiğinde tahta **tümüyle** değiştirilir,
diff/merge yapılmaz. `move` mesajı `version` **taşımaz**.

### F. Sonuç yazımının idempotansı

`Game.findOneAndUpdate({ _id: gameId, finishedAt: null }, {...})` — bu CAS yarışın tek
kazananıdır ve **yalnız kazanan** `stats`/ELO uygular (KK-053). Ardından `settledAt` damgalanır.

## Gerekçe

**A — neden `packages/db`:**

- `db → game-core` ve `db → shared` sınır politikaları zaten izinli; yeni izin gerekmiyor.
- Kural + sıra sahipliği + koşullu yazma **tek fonksiyonda** olmazsa "kim kontrol etti?" sorusu
  her PR'da yeniden sorulur. `game-core` sıra sahipliğini bilerek doğrulamıyor (kendi
  `index.ts` başlığında yazılı) — o kontrolün adresi tek ve belli olmalı.
- Test edilebilirlik belirleyici: `packages/db` içinde düz `vitest run` ile gerçek `xox_test`
  Atlas'ına karşı koşar. `apps/web` içinde olsaydı KK-042/044/045'in her biri sahte bir Next.js
  istek bağlamı isterdi ve yarış testi (aynı `version` ile iki yazma) neredeyse yazılamazdı.
- Sonuç olarak `apps/web` "zarf aç → çağır → yaz" kalınlığında kalır.

**B — neden tahta odada:**

- Bir hamle = **tek** doküman yazması = atomik + **tek** change stream olayı. İki koleksiyona
  yazsaydık: atomiklik yok, iki stream (ADR-0002'nin havuz aritmetiğini bozar), olay sıralaması
  yarışı.
- Terk edilmiş yarım oyunlar `rooms` TTL'iyle bedavaya temizlenir; `games` yalnız gerçek
  sonuçları taşır ve sıralama/geçmiş sorguları çöp okumaz.
- `games`'in oyun **başında** açılması KK-076'nın harfini korur ("oyun `finishedAt: null` kalır")
  ve KK-077 gereği bu doküman hiçbir sorguda görünmez.

**C/D — neden `version` ve neden istemci `version` göndermiyor:**

- Optimistic concurrency control literatürdeki standart çözüm; `findOneAndUpdate`'in 0 doküman
  güncellemesi kaybedeni **kesin** olarak bildirir.
- İstemcinin `move`'a `version` koyması ek koruma sağlamaz: sıra sahipliği + hücre doluluğu
  zaten tam korumadır (spec §3.5 kararı). Koyarsa, ağdaki gecikme yüzünden eski `version`'la
  gelen **geçerli** hamleler gereksiz yere reddedilir.
- `version`'ın sıfırlanmaması (KK-058) istemci uzlaşmasının tek dayanağıdır: monotoniklik bozulursa
  "boşluk = resync" kuralı yanlış tetiklenir ve rövanştan sonra sonsuz resync döngüsü oluşur.

## Reddedilen alternatifler

| Alternatif                                                                  | Neden reddedildi                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mongo transaction (`session.withTransaction`)**                           | Tek doküman güncellemesi zaten atomik; transaction ek round-trip, ek karmaşıklık ve Atlas ücretsiz katmanda ek işlem maliyeti getirir. Çok-doküman ihtiyacı yalnız `finishGame`'de var ve orada CAS + idempotans yeterli |
| **Dağıtık kilit (Redis / `locks` koleksiyonu)**                             | Kilit tutan instance ölürse oda kilitli kalır; TTL'li kilit yeni bir yarış sınıfı doğurur. CAS kilitsizdir                                                                                                               |
| **`updateOne` + sonradan doğrulama**                                        | Yarışı kaybedeni tespit edemez; iki hamle üst üste uygulanabilir                                                                                                                                                         |
| **Sıra kontrolünü `game-core`'a taşımak**                                   | Motorun `index.ts` başlığında gerekçesiyle reddedilmiş: motor kullanıcı kimliğini göremez, yarım kontrol tam sanılır                                                                                                     |
| **Otoriter mantığı `apps/web/lib/game/`'e koymak**                          | Yarış testleri Next.js bağlamı ister; `packages/db` testleri gerçek Atlas'a karşı doğrudan koşar. Ayrıca `apps/mobile` hiçbir zaman `@xox/db` import edemez, yani "web'de olsun ki mobil de kullansın" argümanı geçersiz |
| **Canlı tahtayı `games`'te tutmak, `rooms`'u yalnız koltuk tablosu yapmak** | Hamle iki dokümana yazar (oda `version`'ı + oyun tahtası) → atomiklik kaybı; `games` üzerinde ikinci change stream → havuz                                                                                               |
| **İstemcinin `move`'a `version` koyması**                                   | Ağ gecikmesinde geçerli hamleleri reddeder; koruma katkısı sıfır                                                                                                                                                         |
| **`stats` için ayrı bir `processedGames` koleksiyonu (idempotans)**         | `finishedAt` CAS'ı zaten tek kazanan seçiyor; ek koleksiyon ek yazma ve ek tutarsızlık kaynağı                                                                                                                           |

## Sonuçlar

- ✅ Spec §3.5'in üç senaryosu doğrudan bu tasarımdan çıkar ve üçü de birim testtir
  (KK-042/044/045). Üçüncüsü — aynı `version`'la iki yazma — testte `applyMove` çağrıları
  arasına elle bir `version` artışı enjekte edilerek **zorlanır**; yoksa bu dal hiç
  çalıştırılmadan "kapsandı" sanılır (`gotchas.md`'deki oda-kodu-çakışması dersinin aynısı).
- ✅ `apps/web` ince kalır; her handler dosyası < 60 satır hedefi gerçekçi.
- ⚠️ **Emoji `version` artırmaz.** Sebep: emoji seli `version`'ı şişirir ve her istemcide
  gereksiz "boşluk → resync" tetikler. Bedeli: change stream tüketicisi emoji kontrolünü
  `version` kapısından **önce** yapmak zorundadır (`lastEmoji.at` karşılaştırmasıyla).
  Bu, `connection.ts`'te yorumla işaretlenmiş tek sıra-bağımlı adımdır.
- ⚠️ `finishGame`'in 2–4. adımları arasında instance ölürse `finishedAt != null && settledAt == null`
  olan bir oyun kalır (stats/ELO uygulanmamış). Onarım işi v1'de yazılmaz; alan bu yüzden vardır.
  Kabul edilen, ölçülebilir açık.
- 📌 Kod incelemesi maddesi: `apps/web` içinde `Room.updateOne`/`Room.findOneAndUpdate` **hiç
  görünmemeli**. Lint'le dayatılamıyor (dinamik çağrı), bu yüzden DoD maddesi olarak yazıldı.
