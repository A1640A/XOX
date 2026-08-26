# ADR-0015 — `packages/shared` protokolü tek pencerede genişler; `state` `lastMove` de taşır

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** SB-04, SB-05, SB-06, SB-09, SB-10 · KK-B37…B40, KK-B55, KK-B70
- **Öncelik:** P0 — donmuş sözleşmenin açılması

## Bağlam

`packages/shared` CTR-001'de bilinçli olarak **donduruldu**: "Bu değişiklikler tek dalgada
toplandı; sonraki dalgalar protokol değiştirmez" (`api-contract.md`). Disiplinin bedeli
görüldü: `ROOM-API-001` `roomStateResponseSchema`'yı değiştirmek yerine daha kötü bir
alternatifi seçmek zorunda kaldı; `CTR-003` hâlâ açık bir borç olarak duruyor;
`POST /api/ws/ticket` gövde şemasını route içine yerel olarak yazmak zorunda kaldı.

Tahta boyutu özelliği protokolde **altı ayrı yeri** genişletiyor. Bunlar iki farklı dalgaya
bölünürse `packages/shared` iki kez açılır ve her açılış tüm tüketicilerin typecheck'ini
yeniden riske atar.

## Karar

### 1. Tek kart, tek pencere: `CTR-BOARD-001`

`packages/shared` bu özellik için **tam olarak bir kez** açılır ve o kartta **tamamen**
genişletilir. Kartın çakışma kümesi `packages/shared/src/**` + iki `messages/tr.ts` ağacıdır.
Kart merge edildikten sonra paket **yeniden donar**; sonraki dalgalar protokole dokunmaz.

> İstisna: `packages/shared/src/game-status.ts`'in `winLineSchema`/`toTransportStatus`
> kısmı **bir dalga önce**, `CORE-CFG-001` içinde değişir (ADR-0011). Sebebi typecheck
> atomikliğidir: `WinLine` tipiyle şeması aynı commit'te hareket etmek zorunda. Bu, tek
> pencere kuralının bilinçli ve tek istisnasıdır; kart tanımına yazılır.

### 2. Genişleyen yüzeyin tamamı

| Şema / dosya                            | Bugün                       | Yeni                                                                            | Kriter                    |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- | ------------------------- |
| `primitives.cellIndexSchema`            | `int().min(0).max(8)`       | `int().min(0).max(120)`                                                         | KK-B38                    |
| `primitives.boardSchema`                | `array(cell).length(9)`     | `array(cell).min(9).max(121)`                                                   | KK-B37                    |
| `primitives.boardConfigSchema`          | —                           | `{ size: 3\|6\|11, winLength: 3..6 }` **YENİ**                                  | KK-B17                    |
| `game-status.winLineSchema`             | `tuple([c,c,c])`            | `array(c).min(3).max(6)`                                                        | KK-B39 (ADR-0011'de iner) |
| `errors.errorCodeSchema`                | 20 kod                      | +`INVALID_BOARD_CONFIG` = 21                                                    | SB-06                     |
| `rest-contract.roomCreateBodySchema`    | —                           | `{ size?: number; winLength?: number }` **YENİ**, gövde tamamen yok da olabilir | KK-B14/B15                |
| `rest-contract.roomStateResponseSchema` | size/winLength yok          | `+ size, winLength` (**zorunlu**)                                               | SB-09, US-B03             |
| `ws-protocol.stateMessageSchema`        | size/winLength/lastMove yok | `+ size, winLength` (**zorunlu**) `+ lastMove`                                  | SB-10, KK-B55             |
| `message-keys.MESSAGE_KEYS`             | —                           | `boardConfig` grubu (16 anahtar) + `game`'e 4 + `computer`'a 3 + `errors`'a 1   | spec §5                   |
| `testids.ts`                            | donmuş                      | 5 `TESTID` + 3 `DATA_ATTR`                                                      | ADR-0016                  |

### 3. `state` mesajına `lastMove` EKLENİR — spec'te olmayan, tasarımın kapattığı boşluk

```ts
lastMove: z.object({ index: cellIndexSchema, by: playerSchema }).nullable()
```

KK-B55 "rakibin en son oynadığı hücre `data-son-hamle="true"` taşır ve **yeni bir hamle
gelene kadar kalır**" diyor. İstemci bu bilgiyi bugün yalnız `move:applied` olayından
öğrenebilir. Ama Z2 gereği **bağlantı en geç 300 saniyede bir kesilir** ve yeniden bağlanan
istemcinin gördüğü tek gerçek `state`'tir. `lastMove` `state`'te olmazsa son hamle işareti
her rotasyonda **kaybolur** — 121 hücrelik bir tahtada bu, US-P0-08'in ("rakibin hamlesini
anında gör") tek görsel dayanağını yok eder ve E2E'de rotasyon zamanlamasına bağlı bir
flake üretir.

Gerekçe ADR-0001'in `rematch`'i `state`'e koyma gerekçesiyle **birebir aynıdır**: rotasyondan
sonra görünmesi gereken her şey `state`'te olmak zorundadır.

`RoomDoc.moves`'un son elemanından üretilir; `moves` dizisinin tamamı **gönderilmez**
(yük bütçesi + hiçbir tüketici istemiyor).

### 4. Tam uzunluk sunucuda, şemada değil (KK-B37)

`boardSchema` bir **şekil koruyucusudur**, kural motoru değildir: ayrıştırma anında oda
konfigürasyonu erişilebilir değildir. 9..121 aralığı şemanın işi; `board.length === size²`
odanın kendi konfigürasyonuna karşı sunucuda kontrol edilir (ADR-0011 `boardFromCells`,
ADR-0014 yazma kapısı).

Aynı biçimde `cellIndexSchema` 0..120'dir; oda boyutuna göre daraltma sunucudadır ve aşan
indeks **mevcut** `move:rejected` `reason:'out-of-range'` ile reddedilir. **Protokole yeni
bir reddetme sebebi eklenmez** (KK-B38) — `moveRejectionReasonSchema` dört değerde kalır.

### 5. Yeni hata kodu üç dosyada TEK commit'te

`INVALID_BOARD_CONFIG` → `shared/errors.ts` + `apps/web/messages/tr.ts` +
`apps/mobile/messages/tr.ts`. `message-keys.test.ts` iki ağacın enum'la birebir eşliğini
doğruluyor; biri eksik kalırsa test kırmızıya döner. Bu yüzden üç dosya aynı kartta.

**Reddedilen:** `INVALID_MESSAGE`'ı yeniden kullanmak — sebep ayırt edilemez olur ve
kullanıcıya doğru Türkçe metin gösterilemez (`hata-mesaji` `data-kod`'a bakıyor).

### 6. Eski istemci: gürültülü reddedilir — ama bu ÜÇÜNCÜ savunma hattıdır

Güncellenmemiş bir istemci 11×11 odaya bağlanırsa `boardSchema` ihlali `INVALID_MESSAGE`
sayılır ve 3 ihlalden sonra bağlantı `4400` ile kapanır (KK-B40). Bu **kabul edilen**
davranıştır: gürültülü başarısızlık, sessiz bozuk tahtaya tercih edilir.

Ama bu senaryonun **gerçekleşme yolu** ADR-0018'de teknik kontrole bağlanmıştır; 4400
son çaredir, birincil önlem değildir.

### 7. Tüketici sondası — donmuş pencerenin tek gerçek riskini kapatır

`CTR-BOARD-001` merge edildiğinde tüketicileri (`DB-BOARD-001`, `UI-BOARD-001`,
`API-BOARD-001`) **henüz yazılmamış** olacak. CTR-001'in bilinen kusuru tam buydu.

Karşı önlem: kart, `packages/shared` içinde **tüketici sondası** testleri yazar. Bunlar
tasarım dokümanının §4 alan tablosundan **elle kopyalanmış** beklentilerdir, şemadan
türetilmez (gotcha örüntü 2):

- "Oda ekranının okuduğu her alan `state`'te vardır": `size`, `winLength`, `lastMove`,
  `board`, `status`, `players`, `you`, `version`, `turnDeadline`, `graceEndsAt`, `rematch`,
  `serverTime` — elle yazılmış anahtar listesiyle karşılaştırma.
- "Katılma ekranının okuduğu her alan `roomStateResponse`'ta vardır": `code`, `state`,
  `seats`, `canJoin`, `size`, `winLength`.
- Her zorunlu alan tek tek eksiltilince şema **reddeder** (mevcut iki katmanlı kalıp).

## Gerekçe

- **Neden tek pencere:** protokolü iki dalgada açmak, tüketicilerin ikisinde de yeniden
  typecheck edilmesi demek. CTR-001 disiplini pahalıydı ama işe yaradı — bozulan tek şey,
  penceresi kapandıktan sonra bir ihtiyaç doğmasıydı (CTR-003). Bu kartta önlem, ihtiyaçları
  **tüketici sondasıyla önden listelemek**.
- **Neden `lastMove` spec'te yokken ekleniyor:** spec KK-B55'i yazdı ama taşıma yolunu
  yazmadı. Rotasyon gerçeği (Z2) bu boşluğu kalıcı bir hataya çevirir. Şimdi eklemek bir
  satır; pencere kapandıktan sonra eklemek yeni bir unfreeze kartı.
- **Neden `size`/`winLength` `state`'te zorunlu:** istemci kenarı `board.length`'ten
  türetebilir ama **K'yi türetemez**. `data-kazanma`, `boardLabel` ("… kazanmak için 5 taş
  yan yana") ve kazanan çizgi duyurusu K'ye ihtiyaç duyar.
- **Yük bütçesi:** 121 hücrelik dolu tahta `["X","O",…]` biçiminde ≈ 700 bayt; tüm `state`
  mesajı ölçülen gerçek `JSON.stringify` çıktısıyla < 4 KiB kalır (KK-B70), `maxPayload`
  8 KiB'ın yarısı. `moves` dizisini göndermemenin ikinci gerekçesi budur.

## Reddedilen alternatifler

| Alternatif                                                                                                     | Neden reddedildi                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Şemaları `BOARD_MODES`'tan türetmek (`min = cellCount(en küçük mod)`)                                          | Kendine referanslı beklenti; ayrıca `shared` `game-core`'un **değerlerine** bağlanırsa protokol sınırı bir kural değişikliğiyle sessizce kayar. Sayılar elle yazılır, tutarlılık **ayrı bir testle** iddia edilir. |
| `boardSchema`'ya tam uzunluk kontrolü koymak (`refine(l => [9,36,121].includes(l))`)                           | Üç geçerli uzunluğu yakalar ama asıl soruyu (`=== size²` mi?) cevaplamaz ve sabitin bir kopyasını daha üretir. Sunucu zaten odanın konfigürasyonuna karşı kontrol ediyor.                                          |
| Yeni `move:rejected` sebebi (`'wrong-size'`)                                                                   | KK-B38 açıkça yasaklıyor: aralık dışı indeks zaten `out-of-range`'dir. Yeni sebep, `MoveRejectionReason`'ı ve istemci reducer'ının dört dalını genişletirdi.                                                       |
| `INVALID_MESSAGE`'ı `INVALID_BOARD_CONFIG` yerine kullanmak                                                    | Kullanıcıya doğru metin gösterilemez; `hata-mesaji` `data-kod` ile ayırt edilemez; E2E 400'ün sebebini gözlemleyemez.                                                                                              |
| `lastMove` yerine `moves` dizisinin tamamını `state`'e koymak                                                  | 121 hamlelik oyunda ~4 KB ek yük, KK-B70 bütçesini ikiye katlar; hiçbir ekran hamle geçmişini göstermiyor.                                                                                                         |
| `lastMove`'u yalnız `move:applied`'dan türetmek                                                                | Z2 rotasyonundan sonra kaybolur; E2E'de zamanlamaya bağlı flake.                                                                                                                                                   |
| `packages/shared`'ı bu özellik için hiç açmamak, alanları route içinde yerel şemalarla taşımak (ticket kalıbı) | Beş ayrı yerde yerel şema kopyası → `state` mesajı zaten `shared`'dan geçiyor, kopya imkânsız.                                                                                                                     |

## Sonuçlar

- ✅ Protokol bir kez açılıp bir kez donar; sonraki dört kart yalnız tüketir.
- ✅ `lastMove` sayesinde son hamle işareti rotasyona ve yeniden bağlanmaya dayanıklıdır.
- ⚠️ **Bölümlemenin en riskli kenarı burasıdır:** protokol B2'de donar, tüketicileri B3–B4'te
  yazılır. Eksik bir alan, kapanmış bir pencereyi yeniden açtırır ve zinciri baştan tetikler.
  Tüketici sondası bu riskin tek panzehridir ve kartın **kabul kriteridir**, iyi niyet değil.
- ⚠️ `errorCodeSchema` 21 koda çıkıyor; `errors.test.ts`'teki "20 kod olmalı" çıplak sayısı
  **21'e güncellenmeli** (o test kasten çıplak sayı yazıyor — güncellemek doğru davranıştır,
  testi türetilmiş hâle getirmek değil).
