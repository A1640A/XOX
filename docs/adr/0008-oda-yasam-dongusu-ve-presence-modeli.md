# ADR-0008 — Oda yaşam döngüsü, koltuk sahipliği ve `presence` modeli

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** spec §3.1, §3.2, §3.3, §3.8, §3.10 · KK-031/032/064, KK-070…072, KK-055…058

## Bağlam

Odanın üç durumu var (`waiting → playing → finished`) ama asıl zorluk durumlar değil,
**bağlantı ile koltuk arasındaki ilişki**:

- Koltuk sahipliği `userId`'ye aittir, bağlantıya değil (KK-064: yeniden bağlanan oyuncu
  oda dolu olsa bile içeri girer).
- Aynı kullanıcının ikinci bağlantısı **takeover**'dır (§3.2): eskisi `4409` ile kapatılır ve
  rakip **hiçbir kopma görmez**.
- Rakip gerçekten koptuğunda 30 saniyelik grace başlar (§3.1) — ama takeover ile gerçek kopma
  ayırt edilmelidir, yoksa her sekme değişiminde sahte bir "rakip koptu" yayınlanır.
- Ve bunların hepsi **instance'lar arası** çalışmak zorunda: iki oyuncu iki ayrı süreçte
  olabilir, süreç-içi bir kayıt defteri diğerini göremez.

Ayrıca spec §3.8 rövanş teklifini "kalıcı değil" ilan etmişti — gerekçesi
"`state` mesajında rövanş alanı yok" idi, ki bu mevcut şemanın bir kısıtıydı, ürün kararı değil.

## Karar

### A. `presence` oda dokümanındadır

```ts
presence: { X: { connId, since } | null, O: { connId, since } | null }
disconnected: { seat, at, graceEndsAt } | null
seats: { X: { userId, name } | null, O: { userId, name } | null }
```

`presence[seat].connId` koltuğun **tek geçerli** bağlantısıdır. Her WS bağlantısı açılışta
rastgele bir `connId` üretir.

### B. Takeover, change stream ile yayılır

`joinRoom` `presence[seat] = { connId: yeni, since }` yazar (`version + 1`). Change stream olayı
**her** instance'a gider. Her bağlantı gelen dokümanda kendi `connId`'sini arar; bulamazsa
`error SESSION_TAKEOVER` gönderip `close(4409)` yapar. Takeover sırasında `disconnected`
**yazılmaz** → rakip hiçbir şey görmez (§3.2).

### C. Kopma yazması koşulludur

```
detachConnection(code, seat, connId):
  findOneAndUpdate(
    { code, [`presence.${seat}.connId`]: connId },     // <<< yalnız HÂLÂ BİZSEK
    { $set: { presence.seat: null, disconnected: {...} }, $inc: { version: 1 } }
  )
```

Devredilmiş eski bağlantının kapanışı **hiçbir şey yazmaz**. Bu koşul olmadan takeover anında
sahte bir "rakip koptu" yayınlanır — klasik bir yarış hatası, koşullu yazmayla kökten kapatıldı.

### D. Doluluk kontrolü sahipliğe bakar, bağlantıya değil

```
seats.X?.userId === userId || seats.O?.userId === userId   → YENİDEN BAĞLANMA (oda dolu olsa da kabul)
boş koltuk var                                              → yeni oyuncu
ikisi de değil                                              → ROOM_FULL / close(4403)
```

Bu üç dalın **sırası** normatiftir. Ters sırayla yazılırsa kopan oyuncu kendi odasına giremez
(spec §3.3'ün "klasik hata" uyarısı). `finished` durumundaki odada da koltuklar atanmış kalır;
üçüncü kişi yine `ROOM_FULL` alır.

### E. Rövanş teklifi oda dokümanında **ve** `state` mesajında taşınır

```ts
rematch: { by: Player, expiresAt: Date } | null
```

Semantik spec §3.8'deki gibi kalır: rakip ayrılınca iptal (`rematch:cancelled`),
60 saniyede düşer (tembel değerlendirme, ADR-0004), karşılıklı teklif = mutabakat
(ikinci `rematch:offer` doğrudan kabul sayılır).

### F. Rövanş kabulünde koltuklar **ve** `presence` birlikte takas edilir

```
seats    = { X: eskiO, O: eskiX }
presence = { X: eskiPresenceO, O: eskiPresenceX }
board = boş, moves = [], state = 'playing', gameId = yeni, rematch = null, version + 1
```

`version` **sıfırlanmaz** (KK-058). Her bağlantı yeni `state` mesajındaki `you` alanından
kendi yeni koltuğunu öğrenir.

### G. `waiting` durumunda kurucu ayrılırsa `disconnected` yazılmaz

Oyun başlamadı, grace anlamsız. Oda `waiting` kalır, kod geçerlidir, kurucu dönünce
`seats.X.userId === userId` eşleşmesiyle aynı koltuğa oturur (§3.10).

## Gerekçe

- **`presence` neden dokümanda:** süreç-içi bir kayıt defteri iki oyuncu iki instance'taysa
  hiçbir şey bilmez. Takeover'ın ve grace'in **tek** çalışma biçimi, durumu paylaşılan
  dokümana yazıp change stream ile yaymaktır (ADR-0002 · R1).
- **`connId` neden var:** "aynı `userId` bağlı mı?" sorusu takeover için yetmez — devralınan
  bağlantının **hangi** bağlantı olduğunu bilmek gerekir. `connId` olmadan koşullu
  `detachConnection` yazılamaz ve sahte kopma yayını engellenemez.
- **`seats` neden subdoc (`userId` + `name`):** `state` mesajı rakip adını taşıyor (KK-032,
  2 saniye bütçesi). Ad odada denormalize edilmezse her `state` yayınında ek bir `users`
  sorgusu gerekir — ve `state`, ADR-0007 yüzünden **her 5 dakikada bir** gönderilir.
  Odanın ömrü 2 saat olduğu için ad bayatlaması sınırlı ve kabul edilebilir.
- **Rövanş neden `state`'te:** ADR-0007'nin 300 saniyelik rotasyonu, `state`'te taşınmayan
  her efemer durumu görünmez kılar. 60 saniyelik teklif genelde rotasyondan önce sonuçlanır,
  ama "genelde" bir tasarım güvencesi değildir. Ayrıca teklif zaten oda dokümanından geçmek
  **zorunda** (R1: yayın yalnız change stream'den) — dokümandaysa `state`'te olmaması bilinçli
  bir bilgi saklama olurdu. Spec §3.8'in gerekçesi ("state'te alan yok") ADR-0001 ile zaten
  geçersizleşti.
- **Koltuk takasında `presence` de takas edilmeli:** unutulursa, rövanştan sonra her iki
  bağlantı da kendi `connId`'sini yanlış koltukta arar, ikisi de bulamaz ve **ikisi birden**
  `4409` ile kapanır. Sessiz ve kafa karıştırıcı bir hata; bu yüzden ADR'da açıkça yazılı.

## Reddedilen alternatifler

| Alternatif                                                               | Neden reddedildi                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Süreç-içi bağlantı kayıt defteri (instance başına `Map<userId, ws>`)** | İki oyuncu iki instance'taysa takeover ve grace çalışmaz. Vercel instance dağılımını garanti etmiyor           |
| **İki sekmenin aynı koltuğu paylaşması (aynalama)**                      | Spec §3.2'de reddedilmiş: iki farklı tahta görüntüsü, Playwright'ta deterministik değil                        |
| **`presence` yerine `lastSeenAt` zaman damgası**                         | "Kim aktif?" sorusuna yaklaşık cevap verir; takeover'ı ayırt edemez (aynı kullanıcı, iki bağlantı, aynı damga) |
| **Doluluğu bağlantı sayısıyla ölçmek**                                   | KK-064'ü ihlal eder: kopan oyuncu kendi odasına giremez                                                        |
| **`seats`'i `{X: userId}` bırakıp adı ayrı sorgulamak**                  | Her `state` yayınında ek sorgu; ADR-0007 yüzünden `state` sık gönderiliyor                                     |
| **Rövanşı yalnız bağlantı belleğinde tutmak**                            | R1 gereği yayın change stream'den geçmek zorunda; bellekte tutulan teklif rakibe hiç ulaşmaz                   |
| **Rövanşta koltukları sabit tutmak**                                     | AS-06'da ilk hamle avantajının dönüşümlü olması seçildi (KK-056)                                               |
| **`version`'ı rövanşta sıfırlamak**                                      | KK-058 yasaklıyor; istemcinin "boşluk = resync" kuralı bozulur ve sonsuz resync döngüsü oluşur                 |

## Sonuçlar

- ✅ Takeover, grace ve yeniden bağlanma **aynı** mekanizmadan (koşullu `presence` yazması +
  change stream) doğar; üç ayrı sistem yok.
- ✅ Spec §3.2'nin "rakip hiçbir kopma görmez" iddiası tasarımdan çıkar, özel bir kod dalı
  gerektirmez.
- ✅ §3.3'ün "klasik hata" uyarısı, üç dalın sırasını normatif yazarak kapatıldı; KK-064 testi
  bu sırayı kilitler.
- ⚠️ Oyuncu adı odada denormalize; oyuncu adını oyun sırasında değiştirirse (KK-082) rakip
  eski adı görmeye devam eder. Kabul edildi — oda ömrü 2 saat.
- ⚠️ `presence` yazması `version`'ı artırır, yani her bağlantı kurulumu/kopması bir change
  stream olayı üretir. ADR-0007'nin 5 dakikalık rotasyonuyla birlikte: oyuncu başına saatte
  ~24 ek yazma. Atlas ücretsiz katmanın 100 ops/sn bütçesinde ihmal edilebilir.
- 📌 Rövanş takasında `presence`'ın da takas edilmesi bir **test maddesidir**, yorum değil:
  "rövanş sonrası iki bağlantı da açık kalır" testi yazılmazsa bu hata üretimde bulunur.
