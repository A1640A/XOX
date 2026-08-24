# ADR-0002 — Change stream fan-out: instance başına TEK abonelik

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** `decisions.md` "Instance-arası WS yayını MongoDB Change Streams ile" · KK-040, spec §3.10
- **Risk sınıfı:** projenin en riskli parçası

## Bağlam

Vercel Fluid Compute'ta "A single WebSocket connection is pinned to one Vercel Function instance"
ama "New WebSocket connections are **not guaranteed** to reach the same instance"
(vercel.com/docs/functions/websockets). Yani odadaki iki oyuncu farklı süreçlerde olabilir ve
süreç-içi bir yayın mekanizması onları bulamaz. Karar zaten verilmişti: yayın MongoDB change
stream üzerinden. Açık olan **nasıl**'dı.

Naif tasarım — "her WS bağlantısı kendi odasına filtreli bir change stream açar" — resmi
dokümanla doğrudan çelişiyor:

> "Each change stream holds a connection open with a `getMore` operation while waiting for the
> next event. … If the amount of active change streams opened against a database exceeds the
> connection pool size, you may experience notification latency. To avoid latency, ensure that
> the pool size is greater than the number of open change streams."
> — mongodb.com/docs/manual/changeStreams

`packages/db/src/client.ts` `maxPoolSize: 10` kullanıyor. Bağlantı başına stream demek:
**5 eşzamanlı oyuncu havuzun yarısını kalıcı olarak kilitler, 10 oyuncu tüm sorguları durdurur.**
Atlas ücretsiz katmanı ayrıca 100 işlem/sn ile sınırlı ve her `getMore` bir işlemdir.

## Karar

**Fluid instance başına en fazla BİR change stream.** Modül kapsamında bir `RoomHub` singleton'ı:

```
subscribers : Map<roomCode, Set<RoomConnection>>
codeById    : Map<room _id, roomCode>        // delete olayları fullDocument taşımaz
stream      : ChangeStream | null            // 0 veya 1 — asla daha fazlası
resumeToken : unknown
```

- **Açılış:** ilk `subscribe()` çağrısında (tembel). Abonesi olmayan instance havuzdan bağlantı
  tutmaz.
- **Pipeline:** `[{ $match: { operationType: { $in: ['insert','update','replace','delete'] } } }]`.
  **Oda koduna göre sunucu tarafı filtre yok.** Filtre süreç içinde: `subscribers.get(doc.code)`.
- **Seçenekler:** `fullDocument: 'updateLookup'`, yeniden açılışta `startAfter: resumeToken`.
- **Kapanış:** son abone gidince `stream.close()`.
- **Hata/kopma:** `resumeToken` saklanır, 500 ms → 10 sn üstel geri çekilmeyle yeniden açılır ve
  **tüm yerel abonelere zorla tam `state` yayınlanır** (spec §3.10: "sessizce sağır kalması yasak").
  Kaçırılan olaylar yeniden oynatılmaz — `state` zaten sonucu içerir.
- **`invalidate`:** `resumeAfter` çalışmaz, `startAfter` ile yeni stream açılır.

**Değişmez R1 (fan-out saflığı):** Bir bağlantı, başka bir bağlantının ürettiği hiçbir mesajı
change stream dışında almaz. **Aynı instance'taki iki oyuncu için bile süreç-içi kısayol yoktur.**
Yazan bağlantı kendi hamlesini de change stream yankısıyla öğrenir.

## Gerekçe

**Neden tek stream:**

- Havuz aritmetiği (yukarıda) başka seçenek bırakmıyor. Bu bir tercih değil, kısıt.
- Fazladan gelen olayların maliyeti bir `Map.get()`. XOX ölçeğinde (onlarca eşzamanlı oda)
  kümedeki tüm oda yazmalarını her instance'ta görmek ölçülemeyecek kadar ucuz.

**Neden oda koduna göre sunucu tarafı filtre yok:**

1. Abone oda kümesi **dinamiktir**. Her `join`/`leave`'de stream'i kapatıp yeni bir `$match` ile
   açmak gerekirdi; iki açılış arasında olay kaybı ve resume token yönetimi riski doğar.
2. MongoDB dokümanı `fullDocument: 'updateLookup'` + `fullDocument.*` üzerinde `$match`
   birleşimini açıkça uyarıyor: hızlı silmelerde "Resume Token Not Found". Bizim `$match`'imiz
   yalnız `operationType` üzerinde olduğu için bu hata sınıfının dışındayız.

**Neden R1 (süreç-içi kısayol yok):**

- Dalga 0'ın E2E'si iki Playwright bağlamının **hangi instance'a düşeceğini kontrol edemez.**
  Süreç-içi kısayol olsaydı, test aynı instance'a düştüğünde yeşil yanar ve fan-out'u hiç
  kanıtlamazdı — "kural var görünür, hiçbir şey korumaz" tuzağının aynısı
  (`gotchas.md` ESLint çözümleyici dersi).
- Tek yol = tek gecikme profili. Yazanın kendi hamlesini de aynı yoldan alması, KK-040'ın 1500 ms
  bütçesini **gerçekten** ölçen bir sistem üretir.
- Kod yolu sayısı yarıya iner: "yerel mi uzak mı?" dallanması yok.

**Bu kararın ödediği bedel:** yazan oyuncu kendi hamlesinin onayını ağ turu kadar geç görür.
Bu, istemci tarafı iyimser güncellemeyle (`data-bekliyor="true"`, ADR-0003) tamamen gizlenir.

## Reddedilen alternatifler

| Alternatif                                                         | Neden reddedildi                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bağlantı başına change stream** (oda koduna filtreli)            | Z1: her stream bir havuz bağlantısı tutar. `maxPoolSize: 10` ile 5 oyuncuda bozulur, 10 oyuncuda çöker. Havuzu büyütmek Atlas bağlantı bütçesini tüketir ve sorunu ertelemekten öte işe yaramaz |
| **Süreç-içi kısayol + change stream yalnız uzak bağlantılar için** | Dalga 0'ın kanıtını değersizleştirir (aynı instance'ta test yeşil yanar, fan-out hiç denenmez). İki kod yolu, iki gecikme profili, iki hata sınıfı                                              |
| **Odalar değiştikçe stream'i yeniden açmak** (dinamik `$match`)    | Açılışlar arası olay kaybı; resume token disiplini; `join` sıklığında stream yeniden başlatma                                                                                                   |
| **Upstash Redis pub/sub**                                          | `decisions.md` bunu zaten yedeğe aldı: ek vendor, ek anahtar, ek maliyet. Change stream ölçüm eşiğini geçerse geri gelir                                                                        |
| **Sticky routing / instance affinity**                             | Vercel garanti etmiyor (belge açıkça "not guaranteed")                                                                                                                                          |
| **İstemci yoklaması (polling)**                                    | KK-040'ın 1500 ms bütçesi için ≤ 500 ms aralık gerekir; Atlas ücretsiz katmanın 100 ops/sn sınırını iki oyuncuyla bile zorlar                                                                   |
| **`games` koleksiyonunu da izlemek**                               | İkinci stream = ikinci havuz bağlantısı. Bu yüzden canlı tahta `rooms`'ta tutuluyor (ADR-0003)                                                                                                  |

## Sonuçlar

- ✅ Havuz güvenli: instance başına 1 stream + 9 serbest bağlantı.
- ✅ Aynı-instance ve farklı-instance durumları **bit düzeyinde aynı** kod yolundan geçer;
  Dalga 0 E2E'si instance dağılımından bağımsız olarak fan-out'u kanıtlar.
- ✅ Emoji yayını da aynı yoldan gider (`rooms.lastEmoji`), ikinci taşıma gerekmez.
- ⚠️ Her instance kümedeki **tüm** oda yazmalarını görür. Ölçek eşiği: `rooms` yazma hızı
  ~50/sn'yi veya eşzamanlı instance sayısı ~10'u aşarsa yeniden değerlendirilir. Bu eşikler
  XOX v1 için erişilmez; aşılırsa Redis pub/sub yedeği devrededir.
- ⚠️ Change stream düşerse yeniden abone olana kadar (≤ 10 sn) yayın durur. Zorunlu tam `state`
  yayını tutarlılığı geri getirir; kullanıcı bir gecikme görür, yanlış tahta görmez.
- 📌 **Ölçüm önce gelir:** `RT-PROBE-001` (`GET /api/health/realtime`) Dalga 0a'da, herhangi bir UI
  yazılmadan, gerçek Atlas'a karşı change stream gecikmesini ölçer. p95 > 1500 ms ise bu ADR
  revize edilir ve Redis yedeği devreye alınır. Yanlış temele beş dalga inşa etmemek için.
