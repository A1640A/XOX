# ADR-0012 — Kazanma hatları: konfigürasyondan üretilen memoize tablo + `wouldWin` hızlı yolu

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** spec §2.3 · KK-B07…B10, KK-B22…B26
- **Öncelik:** kural motorunun kalbi

## Bağlam

Bugün `packages/game-core/src/status.ts` sekiz hattı **elle yazılmış donmuş bir sabitte**
tutuyor (`WIN_LINES`) ve `evaluateStatus` onun üzerinde doğrusal tarama yapıyor. 3×3'te
8 hat × 3 hücre = 24 okuma; bedeli yok.

11×11 + K=5'te hat sayısı **252**'dir (252 × 5 = 1260 okuma). `evaluateStatus`'u arama
ağacının her düğümünde çağırmak, alfa-beta'nın kazandırdığı her şeyi geri verir.

Ayrıca kazanma kuralının iki alt kararı var: (a) **freestyle** — K veya **daha fazlası**
kazanır (overline geçerli), (b) bir hamle iki hattı birden tamamlarsa hangisi raporlanır.

## Karar

**1. `winLines(config): readonly WinLine[]` — üretilir, memoize edilir, donar.**

Üretim sırası **bilinçlidir** ve bugünkü sabitin sırasını birebir yeniden üretir (KK-B08):

```
1) YATAY   : r = 0..N-1     , c = 0..N-K      → [r*N+c .. r*N+c+K-1]
2) DİKEY   : c = 0..N-1     , r = 0..N-K      → [r*N+c .. (r+K-1)*N+c]
3) KÖŞEGEN ↘: r = 0..N-K    , c = 0..N-K
4) KÖŞEGEN ↙: r = 0..N-K    , c = K-1..N-1
```

(3,3) için sonuç: `[0,1,2] [3,4,5] [6,7,8] [0,3,6] [1,4,7] [2,5,8] [0,4,8] [2,4,6]` —
bugünkü `WIN_LINES` ile **aynı sekiz hat, aynı sırada**. KK-B08'in beklentisi bu sabitin
**elle kopyalanmış hâlidir**, `WIN_LINES`'a referans değildir (gotcha örüntü 2).

Hat sayıları (KK-B07, testte çıplak yazılır):
`(3,3)→8 · (6,4)→54 · (6,5)→32 · (11,4)→304 · (11,5)→252 · (11,6)→204`.

**2. Memoizasyon anahtarı değerdir, referans değil.**

`` `${size}x${winLength}` `` anahtarlı modül kapsamlı `Map`. `parseBoardConfig` her çağrıda
yeni bir nesne ürettiği için referans anahtarı çalışmazdı. **Önbellek `BOARD_MODES`'taki altı
kombinasyonla sınırlıdır**; listede olmayan bir konfigürasyon hesaplanır ama **saklanmaz** —
uzun ömürlü bir Vercel instance'ında hatalı bir çağrı sonsuz büyüyen bir önbellek üretmesin.
Dal testtir: `winLines({size:4,winLength:3})` sonrası önbellek boyutu artmaz.

**3. Freestyle: K **veya fazlası** kazanır; raporlanan hat pencere tarama sırasındaki ilktir.**

K=5 iken 6'lı dizi galibiyettir ve `line` o dizinin **ilk beş indeksidir** — çünkü yatay
tarama `c` artan sırada ilerler, `[s..s+4]` penceresi `[s+1..s+5]`'ten önce bulunur (KK-B24).
Bu davranış **testle kilitlenir**: kural sessizce "tam K" hâline getirilemez.

**4. Determinizm: iki hat aynı anda tamamlanırsa `winLines` sırasındaki ilk hat döner** (KK-B23).
Aynı tahta iki kez değerlendirildiğinde aynı `line` gelir; yatay hat dikeyden, dikey köşegenden
önce gelir. Bu, sıranın kendisinden çıkar — ek bir öncelik kuralı **yoktur**.

**5. `evaluateStatus(board, config)` otoritedir; `wouldWin(board, index, player, config)` hızlı yoldur.**

```ts
/** Son taşın ETRAFINDA dört yön (yatay, dikey, iki köşegen) tarayıp K'ye ulaşan
 *  kesintisiz diziyi arar. O(K) değil O(4·(2K−1)); hat tablosundan bağımsızdır. */
export function wouldWin(board: Board, index: number, player: Player, config: BoardConfig): boolean
```

İki uygulama **birbirinden türetilmez** (KK-B26): `evaluateStatus` hat tablosunu tarar,
`wouldWin` komşuluk tarar. Denklikleri, tohumlu bir üreteçle üretilmiş **sabit 500 pozisyonluk
korpusta** iddia edilir — rastgele değil, yeniden üretilebilir. Bu, iki bağımsız uygulamanın
birbirini denetlemesidir; tek uygulamanın kendini doğrulaması değildir.

**Kim hangisini kullanır:** sunucu otoritesi (`db/rooms/apply-move.ts`) **daima**
`evaluateStatus`; arama ağacı (`ai`) **daima** `wouldWin`. Karışmaz.

**6. Beraberlik ucuzlar.** `evaluateStatus` bugün tahtayı ikinci kez tarayıp boş hücre arıyor.
Değişmez: hat taraması + tek geçişli doluluk sayımı; 121 hücrede bu tek `for` döngüsüdür.

## Gerekçe

- **Neden üretim, neden elle yazılmış tablo değil:** 3 boyut × izinli K = 6 kombinasyon,
  toplam 854 hat. Elle yazılamaz. Ama üretimin **doğruluğu** elle yazılmış iki beklentiyle
  denetlenir: (a) sayı tablosu (KK-B07, çıplak sayılar), (b) (3,3) için sekiz hattın
  birebir kopyası (KK-B08). Üretici bozulursa ikisinden biri kırmızıya döner.
- **Neden sıra sözleşmedir:** `data-kazanan` işaretlenen hücre kümesi ve `state.status.line`
  bu sıradan çıkıyor. Sıra "uygulama detayı" sayılırsa, bir refaktör E2E'yi ve ekran okuyucu
  duyurusunu (KK-B65) sessizce değiştirir.
- **Neden freestyle:** spec §2.3. "Tam K, fazlası değil" kuralı, kazanma tespitini pencere
  taramasından **uzunluk ölçmeye** çevirir ve `line`'a hangi K indeksin yazılacağını
  belirsizleştirir. Renju/pro yasakları (3-3, 4-4, swap2) kapsam dışı (§8.4).
- **Neden iki uygulama:** `evaluateStatus`'u arama ağacında kullanmak 11×11'de düğüm başına
  1260 okuma demek. `wouldWin` ~36 okuma. Ama iki uygulama = iki doğruluk kaynağı riski;
  bu yüzden 500 pozisyonluk denklik korpusu **ilave bir gate değil, tasarımın parçasıdır**.

## Reddedilen alternatifler

| Alternatif                                                                           | Neden reddedildi                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIN_LINES`'ı tüm boyutlar için elle yazmak                                          | 854 hat; insan eliyle yazılamaz, incelenemez.                                                                                                                                                                         |
| Hat tablosunu boyuta göre değil **hücreye göre** indekslemek (`linesThrough[index]`) | Daha hızlı olurdu ama `evaluateStatus`'un deterministik sırasını (KK-B23) bozardı: bir hücreden geçen hatların sırası, global hat sırasıyla aynı değil. Otorite yolunda hız gereksinimi yok (hamle başına bir çağrı). |
| `wouldWin`'i `evaluateStatus`'tan türetmek (son hamleden sonra tam tarama)           | Hızlı yolun **tüm** amacı bu taramadan kaçınmak. Türetilirse KK-B26'nın denklik testi de anlamsızlaşır (kendini doğrular — gotcha örüntü 2).                                                                          |
| Tek uygulama tutup arama ağacında `evaluateStatus` çağırmak                          | Ölçülmemiş ama aritmetik açık: 11×11'de düğüm başına 1260 okuma, budama kazancını siler. AI-SPIKE-001 bunu sayıyla belgeleyecek.                                                                                      |
| "Tam K" (overline kaybettirir / sayılmaz)                                            | `line`'a yazılacak indeks kümesi belirsizleşir; ayrıca oyuncuya "6 yaptım ama kazanmadım" demek açıklanamaz. Freestyle, gomoku'nun en yaygın serbest kuralıdır.                                                       |
| İki hat birden tamamlandığında ikisini de işaretlemek                                | `winLineSchema` tek hat taşıyor; iki hat protokolü ve `RoomDoc.result.line`'ı değiştirirdi. Görsel olarak da kesişen iki hattın vurgusu okunmaz.                                                                      |

## Sonuçlar

- ✅ `WIN_LINES` sabiti silinir; tek kaynak `winLines(config)`.
- ✅ (3,3) davranışı bit düzeyinde korunur — kanıt KK-B08'in birebir kopya beklentisi.
- ✅ Arama ağacı hat tablosuna hiç bakmaz; 11×11'de değerlendirme maliyeti hamle
  komşuluğuyla sınırlanır.
- ⚠️ İki uygulama = sapma riski. Tek panzehir 500 pozisyonluk denklik korpusudur; o test
  **silinemez ya da örneklem sayısı düşürülemez** (kart kabul kriterine yazılır).
- ⚠️ Memoize edilen 854 hat modül kapsamında kalıcı bellek tutar (~kaba 30–60 KB). Instance
  başına bir kez; kabul edilir. Sınır altı boyutlar önbelleğe alınmaz.
