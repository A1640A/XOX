# ADR-0004 — Süre aşımı ve terk: zamanlayıcı + tembel değerlendirme

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** spec §3.1, §3.7 · KK-070…077

## Bağlam

İki zamana bağlı sonuç var:

- **Hamle süresi** (`MOVE_TIMEOUT_SECONDS = 60`): sırası gelen oyuncu oynamazsa kaybeder (KK-074).
- **Terk grace'i** (`DISCONNECT_GRACE_SECONDS = 30`): kopan oyuncu dönmezse kaybeder (KK-072).

Sorun: kararı **kim** ve **nerede** yazar? Vercel Fluid instance'ları geçicidir; bir `setTimeout`
instance ölünce sessizce kaybolur. Bir oyun "kazanıldı ama kimse yazmadı" durumunda kalabilir.

Ters yönde bir kısıt daha var: KK-076 — **her iki oyuncu da bağlı değilken hiçbir sonuç
yazılmamalı.** Yani "arka planda çalışan bir süpürücü" istenmiyor; terk edilmiş oyun terk edilmiş
kalmalı ve TTL ile silinmeli.

## Karar

**İki yürütme yolu, ikisi de zorunlu.**

1. **Zamanlayıcı (hızlı yol):** bağlı bir instance
   `setTimeout(min(turnDeadline, graceEndsAt) - now)` kurar. Dolunca `settleDeadlines(code, now)`
   çağrılır. Zamanlayıcı, bağlantı kapanınca **iptal edilir**.

2. **Tembel değerlendirme (garanti yolu):** `settleDeadlines`, gelen **her** WS mesajının
   işlenmesinden **önce** ve her WS bağlantısı kurulurken çağrılır (KK-075). Instance ölse de
   sonuç bir sonraki temasta — rakibin hamlesi, bir yeniden bağlanma, hatta bir `ping` —
   kesinleşir.

**Karar fonksiyonu saftır** (`apps/web/lib/game/deadlines.ts`, DB'siz, DOM'suz):

```ts
dueSettlement(room, now): { reason: 'timeout' | 'abandon'; loser: Player } | null
```

- `state !== 'playing'` → `null`
- `turnDeadline` geçmiş → `timeout`, kaybeden `nextPlayer(board)`
- `disconnected.graceEndsAt` geçmiş → `abandon`, kaybeden `disconnected.seat`
- **İkisi de geçmişse: önce dolan kazanır; tam eşitlikte `timeout`** (spec §3.7 — deterministik
  olması için sıralama yazılıdır, "duruma göre" değil)

**Yazma yine CAS'tır:** `{ code, version: beklenen, state: 'playing' }`. İki instance aynı anda
süreyi fark ederse yalnız biri yazar, diğeri `null` alır ve sonucu change stream'den öğrenir.

**Zamanlanmış görev (cron) YOKTUR.** Bu, KK-076'nın uygulanma biçimidir: her yazının bir bağlı
istemcisi vardır; kimse bağlı değilse yazacak kimse yoktur.

**Aynı tembel kalıp rövanş teklifinin düşmesinde de kullanılır** (KK-057): `rematch.expiresAt`
geçmişse `rematch: null` yazılır ve gelen `rematch:accept` `REMATCH_EXPIRED` alır. Ayrı
zamanlayıcı yok.

**P0/P1 ayrımı (AS-08):** P0'da `turnDeadline` **null** yazılır; `dueSettlement` null deadline'ı
yoksayar. P0'da `disconnected` damgalanır ama grace zamanlayıcısı kurulmaz. Dalga 2'de tek bir
hesaplama satırı açılır — protokol, şema ve istemci reducer'ı **zaten hazırdır**.

## Gerekçe

- **Tek başına zamanlayıcı yetmez:** Fluid instance'ı 300 saniyede zaten ölüyor (ADR-0007).
  60 saniyelik bir hamle süresi, instance'ın ömrünün son 60 saniyesinde başlarsa zamanlayıcı
  hiç ateşlenmez.
- **Tek başına tembel kontrol yetmez:** kimse mesaj göndermezse sonuç hiç yazılmaz. Ama sıra
  bendeyken ben oynamıyorsam ve rakip de beklemekten başka bir şey yapmıyorsa — rakibin `ping`'i
  25 saniyede bir gelir. Yani tembel kontrol tek başına ≤ 25 sn gecikmeyle çalışır. Zamanlayıcı
  bu gecikmeyi sıfırlar; tembel kontrol garantiyi verir. İkisi birbirinin yedeği.
- **Saf karar fonksiyonu**, KK-075'i DB'siz bir birim testine indirger: `dueSettlement`'a
  geçmiş bir `turnDeadline` ve geçmiş bir `graceEndsAt` verilip beklenen sonucun `timeout`
  olduğu doğrulanır. Eşitlik kuralı testte kilitlenir.
- **Cron olmaması bir eksiklik değil, gereksinim.** KK-076 açıkça "hiçbir sonuç yazılmaz" diyor;
  bir süpürücü tam tersini yapardı ve terk edilmiş oyunlar istatistiklere sızardı.

## Reddedilen alternatifler

| Alternatif                                                       | Neden reddedildi                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Yalnız `setTimeout`**                                          | Fluid instance ölünce sonuç sessizce kaybolur. 300 sn'lik ömür bunu kural dışı değil rutin yapar (ADR-0007)                        |
| **Yalnız tembel kontrol**                                        | ≤ 25 sn (bir heartbeat aralığı) gecikme; KK-074'ün "süre sıfırlandığında" iddiası için sınırda                                     |
| **Vercel Cron / scheduled function**                             | En iyi çözünürlük 1 dakika, saniye hassasiyeti yok; ayrıca KK-076'yı **ihlal eder** (kimse bağlı değilken sonuç yazar). Ek altyapı |
| **`rooms` üzerinde ayrı bir "deadline watcher" change stream'i** | ADR-0002'nin havuz kısıtı; ayrıca change stream zamanı değil değişimi bildirir — deadline geçtiğinde hiçbir olay üretilmez         |
| **İstemcinin "süre doldu" iddiasına güvenmek**                   | İstemciye otorite vermek; saati ileri alan bir istemci rakibini anında yenerdi                                                     |
| **Mongo TTL indeksiyle oyunu bitirmek**                          | TTL siler, güncellemez; sonuç ve istatistik yazılamaz                                                                              |
| **Süre aşımı ve terkten "en son gerçekleşen" kazansın**          | Belirsiz: iki damganın aynı milisaniyeye düşmesi mümkün. Deterministik sıra (önce dolan; eşitlikte timeout) test edilebilir        |

## Sonuçlar

- ✅ KK-075 (Fluid instance ölse bile sonuç kaybolmaz) tasarımdan doğrudan çıkar.
- ✅ KK-076 (iki taraf da yoksa hiçbir şey yazılmaz) **yapmayarak** sağlanır — cron olmadığı için.
- ✅ Rövanş süresi aynı kalıbı kullandığı için ikinci bir zamanlayıcı altyapısı gerekmez.
- ⚠️ `settleDeadlines` her mesajda çağrıldığı için sıcak yoldadır. `dueSettlement` saf ve
  O(1); DB yazması **yalnız** gerçekten bir sonuç varsa yapılır. Okuma zaten handler'ın
  ihtiyacı olan okumadır (paylaşılır, iki kez okunmaz).
- ⚠️ Tembel kontrolün handler'dan **önce** çalışması sıraya bağımlıdır ve unutulabilir.
  Bu yüzden çağrı handler'ların içine değil, `handlers/index.ts` dispatcher'ının içine
  konur — tek yer, atlanamaz.
- 📌 P0'da süre yok (AS-08). Board'da KK-073/074 Dalga 2'ye ait; Dalga 0/1 raporlarında
  "kapsam dışı (P1)" olarak görünmeli, "başarısız" olarak değil.
