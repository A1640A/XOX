# ADR-0007 — WS bağlantı ömrü: 300 saniye gerçeği ve planlı rotasyon

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** KK-060…065, KK-070/071 · spec §3.4

## Bağlam

Vercel'in kendi dokümanı, tasarımı doğrudan etkileyen bir cümle içeriyor:

> "WebSocket connections close when a Vercel Function reaches its **maximum duration**."
> — vercel.com/docs/functions/websockets

Ve maksimum süre:

| Plan             | Varsayılan | Maksimum             |
| ---------------- | ---------- | -------------------- |
| Hobby            | 300 s      | **300 s**            |
| Pro / Enterprise | 300 s      | 800 s (beta: 1800 s) |

Yani **bir XOX oyunu, bağlantısı hiç kopmasa bile, en geç 5 dakikada bir kesilir.** Ortalama bir
XOX oyunu 1–2 dakika sürer, ama "rakip bekleniyor" ekranı, rövanş turu ve düşünen bir oyuncu
bu sınırı rutin olarak aşar.

İkinci cümle de önemli: "New WebSocket connections are not guaranteed to reach the same instance."
Yani her rotasyon, oyuncuyu başka bir instance'a taşıyabilir.

Bu, spec'in yeniden bağlanma bölümünü (§3.4, KK-060…065) bir **istisna işleme** konusundan
**ana akış** konusuna dönüştürüyor.

## Karar

**1. Yeniden bağlanma ve tam resync birinci sınıf akıştır, kenar durum değil.**
Her yeni bağlantı tam `state` alır (§3.4/3). Kaçırılan `move:applied` mesajları asla yeniden
oynatılmaz. Bu zaten spec'in kararıydı; burada onun **her 5 dakikada bir** çalışacağı
kaydediliyor ve buna göre optimize ediliyor.

**2. Planlı rotasyon:** sunucu, fonksiyon süresi dolmadan **önce** bağlantıyı kendi kapatır.

```ts
// apps/web/lib/realtime/rotate.ts
const deadline = getDeadline() // @vercel/functions — Date | undefined
if (deadline) {
  const inMs = deadline.getTime() - Date.now() - WS_ROTATE_MARGIN_MS // 10 sn pay
  setTimeout(() => ws.close(WS_CLOSE.ROTATE /* 4499 */, 'rotate'), Math.max(inMs, 0))
}
```

**3. İstemci `4499`'u ayırt eder:** yeniden bağlanma sayacını **sıfırlar** ve **gecikmesiz**
bağlanır. Diğer kapanışlar üstel geri çekilmeye tabidir (KK-061); `4401`/`4409` hiç
yeniden bağlanmaz (ADR-0006, §3.2).

**4. Rotasyon `disconnected` damgası ATMAZ.** `detachConnection` yalnız `presence` sahipliği
hâlâ bizdeyse yazar; rotasyonda yeni bağlantı **saniyeler içinde** gelir ve `presence`'ı
devralır. Sıralamayı garanti etmek için: rotasyon kapanışında `detachConnection` çağrılır ama
istemci hemen yeniden bağlanacağı için `disconnected` en fazla bir saniye yaşar. Rakip
`opponent:left` + hemen ardından `opponent:returned` görebilir — bu yüzden istemci
`opponent:left`'i **anında göstermez**, `graceEndsAt`'e 2 saniye kalan bir eşik uygular
(KK-070 "2 sn içinde" bütçesinin içinde kalır).

**5. `maxDuration` `vercel.json`'da açıkça yazılır** ama kodda **hiçbir yere gömülmez** —
`rotate.ts` yalnız `getDeadline()` kullanır. Plan Hobby'den Pro'ya geçtiğinde kod değişmez.

## Gerekçe

- **Rotasyon planlı olmazsa** istemci bağlantının 1006 ile ölmesini bekler, heartbeat kaybını
  fark etmesi 2 × 25 = 50 saniye sürebilir ve o sürede oyun donmuş görünür. Planlı kapanışta
  kesinti tek bir ağ turu kadardır.
- **`4499` ayrımı olmasa** istemci bunu bir hata sanıp üstel geri çekilmeye girerdi: 5 dakikada
  bir 500 ms, sonra 1 sn, sonra 2 sn… ve backoff sayacı hiç sıfırlanmadığı için birkaç saat
  sonra her rotasyon 10 saniyelik donmaya dönerdi.
- **`getDeadline()` kullanmak**, planı, `maxDuration` ayarını ve gelecekteki Vercel
  değişikliklerini koddan bağımsız kılar. Sabit `300_000` yazmak, plan yükseltmesinde
  bağlantıyı gereksiz yere erken kesmeye devam ederdi.
- **10 saniyelik pay** yeterli: kapanış çerçevesi + istemcinin yeniden bağlanma turu tipik
  olarak < 1 sn; pay, `getDeadline()`'ın döndürdüğü değerin fonksiyon başlangıcına göre
  hesaplandığı ve saat kaymalarının olabileceği durumlar içindir.
- **Bu karar KK-063'ü ücretsiz olarak sağlamlaştırır:** "ağ kopukken rakip hamle yapar, dönen
  istemcinin tahtası tam `state` ile eşitlenir" senaryosu artık her 5 dakikada bir gerçekten
  çalışır. Nadiren çalışan bir kod yolu değil, sürekli sınanan bir kod yolu.

## Reddedilen alternatifler

| Alternatif                                                              | Neden reddedildi                                                                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hiçbir şey yapmamak, 1006'yı beklemek**                               | Heartbeat kaybının fark edilmesi 50 sn'ye kadar sürer; oyun donmuş görünür. Ayrıca 1006 "ağ hatası" ile karışır, backoff büyür                                      |
| **`maxDuration`'ı kodda sabitlemek (`300_000`)**                        | Plan yükseltmesinde yanlış; Vercel varsayılanı değişirse sessizce yanlış                                                                                            |
| **`maxDuration`'ı 800/1800 saniyeye çıkarıp sorunu ertelemek**          | Sorunu çözmez, seyrekleştirir — ve seyrek çalışan bir yeniden bağlanma yolu **test edilmemiş** bir yoldur. Ayrıca Hobby planında mümkün değil, Pro'da fatura kalemi |
| **Uzun ömürlü bağlantı yerine SSE + POST**                              | SSE de aynı `maxDuration` sınırına tabi; üstelik çift kanal (okuma SSE, yazma POST) iki hata yüzeyi ve iki kimlik yolu demek. WS zaten preview'da kanıtlandı        |
| **Yoklama (polling)**                                                   | KK-040'ın 1500 ms bütçesi ≤ 500 ms aralık ister; Atlas ücretsiz katmanın 100 ops/sn sınırını zorlar; pil tüketimi                                                   |
| **Rotasyonda `disconnected` damgası atmamak (koşullu yazmayı atlamak)** | Gerçek kopmayla rotasyonu ayırt edecek güvenilir bir sinyal yok; ayrımı istemci tarafındaki 2 saniyelik gösterim eşiğiyle yapmak daha basit ve daha az yazma üretir |

## Sonuçlar

- ✅ Kullanıcı, 5 dakikalık sınırı hiç fark etmez: tek ağ turu, tahta değişmez, `pending`
  hamle `state` ile uzlaşır.
- ✅ Yeniden bağlanma yolu her oyunda çalıştığı için **sürekli sınanır**; nadir bir hata
  sınıfı olmaktan çıkar.
- ✅ Kod plan-agnostiktir; Hobby → Pro geçişi sıfır değişiklik.
- ⚠️ Rakip, rotasyon sırasında kısa bir `opponent:left` → `opponent:returned` çifti görebilir.
  İstemci 2 saniyelik gösterim eşiği uygular; KK-070'in "2 sn içinde görür" bütçesiyle uyumlu
  ama **bu eşik testte kilitlenmelidir** — aksi hâlde ilk agent onu "gereksiz gecikme" sanıp siler.
- ⚠️ Her rotasyonda tam `state` gönderilir (~300 bayt) ve odanın bir kez okunması gerekir.
  İki oyuncu × 12 rotasyon/saat = saatte 24 okuma. İhmal edilebilir.
- ⚠️ Rotasyon anında oyuncunun instance'ı değişebilir; yeni instance kendi `RoomHub`'ını
  (varsa) kullanır, yoksa change stream'i açar. Eski instance son abonesini kaybedince
  stream'ini kapatır (ADR-0002). Bu iki olay arasında (< 1 sn) o odaya ait olay kaybı
  **yaşanmaz**, çünkü yeni bağlantı tam `state` alır.
- 📌 Ölçüm: Dalga 0e'nin E2E raporu bir rotasyon turunu **kasıtlı olarak** tetiklemez
  (300 sn'lik test kabul edilemez) — bunun yerine `WS_ROTATE_MARGIN_MS`'i test ortamında
  ezerek 5 saniyede rotasyon yaptıran bir birim/entegrasyon testi yazılır.

## Güncelleme — 2026-08-24 (OPS-002)

Takımın Vercel planı **Pro** olarak doğrulandı (`billing.plan: "pro"`, API'den okundu).
Fonksiyon süre tavanı bu yüzden 300s değil **800s**; `apps/web/vercel.json` içinde
`functions["app/api/rooms/[code]/ws/route.ts"].maxDuration = 800` olarak ayarlandı.

Sonuç: planlı bağlantı rotasyonu ~5 dakikada bir değil **~13 dakikada bir** olacak.
Karar değişmiyor — rotasyon hâlâ ana akış, sadece daha seyrek. `getDeadline()` değeri
koddan değil `vercel.json`'dan okumaya devam etsin ki plan değişirse tek yerden ayarlansın.
