# ADR-0006 — WebSocket kimlik doğrulaması: çerez + Bearer + kısa ömürlü bilet

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** KK-008, KK-010, KK-064, KK-090/091 · spec §3.2, §3.3

## Bağlam

WS upgrade'i kimliklendirilmek zorunda: KK-008 — "Kimliksiz bir WebSocket upgrade isteği
bağlantıyı **4401** kapanış koduyla kapatır; hiçbir oda mesajı gönderilmez."

Üç istemci tipi var ve üçünün elindeki kimlik farklı:

| İstemci                   | Elindeki kimlik           | Upgrade'de ne gönderebilir                                                         |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Web tarayıcı              | Auth.js `httpOnly` çerezi | Çerez **otomatik** gider (aynı origin)                                             |
| React Native (native)     | Bearer access token       | `new WebSocket(url, protocols, { headers })` — RN native destekler                 |
| `react-native-web` hedefi | Bearer access token       | **Hiçbir özel başlık gönderemez** — tarayıcı `WebSocket` API'si başlık kabul etmez |

Üçüncü satır belirleyici: KK-090/091 mobil doğrulamamızı `react-native-web` hedefine bağlıyor
(`decisions.md` yer gerçeği). Yani başlık taşıyamayan bir istemci **birinci sınıf** doğrulama
yüzeyimiz.

Ek bir kısıt: `experimental_upgradeWebSocket(handler)` handler'ına **`Request` verilmiyor**
(Vercel API referansı). Kimlik, upgrade'den **önce**, route handler'ın kendi `Request`'inden
çözülmek zorunda.

## Karar

### Tek çözücü, üç kaynak, sabit sıra

`apps/web/lib/auth/identity.ts`:

```ts
export async function resolveIdentity(req: Request): Promise<Identity | null>
// 1. Authorization: Bearer   (aud 'xox-mobile', typ 'access')   → native mobil
// 2. Auth.js oturum çerezi                                       → web
// 3. ?ticket=<jwt>           (aud 'xox-ws', 30 sn, WS'e özel)    → react-native-web / başlıksız istemciler
```

### WS bileti

`POST /api/ws/ticket` — (1) veya (2) ile kimliklenir, `{ ticket, expiresIn: 30 }` döner.
Bilet: `jose` HS256, `{ sub: userId, aud: 'xox-ws', exp: +30 sn }`. Depolanmaz (durumsuz).

İstemci `wss://…/api/rooms/ABC234/ws?ticket=<bilet>` ile bağlanır.

### Upgrade sırası

```
export const GET = auth(async function GET(req, ctx) {   // req.auth → çerez oturumu
  const identity = await resolveIdentity(req)
  ...
  return experimental_upgradeWebSocket(ws => { ... }, { maxPayload: 8 * 1024 })
})
```

Kimlik yoksa: yine de upgrade edilir ve **derhal** `ws.close(4401)` çağrılır — KK-008 bir
kapanış **kodu** iddia ettiği için HTTP 401 dönmek yeterli olmaz (başarısız handshake istemciye
`1006` verir, 4401 değil).

### Diğer kapanış kodları

`4403` koltuk yok/oda dolu · `4404` oda yok · `4408` boşta kalma · `4409` takeover ·
`4400` üç protokol ihlali · `4499` planlı rotasyon (ADR-0007).

## Gerekçe

- **Neden bilet, neden token'ı doğrudan sorguya koymuyoruz:** Vercel erişim günlükleri istek
  yolunu (sorgu dizesi dahil) kaydeder. 30 günlük bir refresh ya da 15 dakikalık bir access
  token'ın günlüklerde durması gerçek bir sızıntıdır. 30 saniyelik, tek amaçlı (`aud: 'xox-ws'`),
  başka hiçbir uçta kabul edilmeyen bir bilet, günlükte durduğunda pratikte değersizdir.
- **Neden bilet durumsuz (DB'siz):** 30 saniyelik ömür, iptal ihtiyacını ortadan kaldırır.
  Bir `usedTickets` koleksiyonu her bağlantıda bir yazma demektir; Z2'nin 300 saniyelik
  rotasyonu bağlantı kurulumunu **sık** bir işlem yaptığı için bu maliyet gereksiz.
  Tek kullanımlık olmaması kabul edilen bir gevşemedir: 30 sn içinde aynı bileti iki kez
  kullanmak zaten aynı kullanıcının kendi bağlantısını devralmasıdır (§3.2 takeover, güvenli).
- **Neden üç kaynak, tek fonksiyon:** KK-010 "aynı `userId`'ye çözülür" diyor. Üç ayrı yerde
  kimlik çözülseydi biri güncellenmeyince sessizce ayrışırdı. Tek fonksiyon = tek test
  (üç girdi, tek beklenen çıktı).
- **Neden `Sec-WebSocket-Protocol` ile token taşımıyoruz:** Tarayıcı, sunucunun kabul edilen
  alt protokolü handshake yanıtında **yankılamasını** şart koşar; yankılamazsa bağlantıyı kapatır.
  `experimental_upgradeWebSocket` handshake yanıt başlıklarını kontrol etmemize izin vermiyor
  (Z3). Doğrulanamayan bir mekanizmaya temel atmıyoruz.
- **Neden upgrade edip 4401 ile kapatıyoruz:** KK-008 bir kapanış kodu iddia ediyor. Başarısız
  bir handshake istemciye `1006`/`1015` verir; test yazılamaz hâle gelir ve istemci
  "ağ hatası" ile "yetkisiz"i ayırt edemez, sonsuz yeniden bağlanma döngüsüne girer.
  `4401` gören istemci **yeniden bağlanmaz**, `/giris`'e gider.

## Reddedilen alternatifler

| Alternatif                                                         | Neden reddedildi                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Yalnız çerez**                                                   | `react-native-web` hedefi (KK-090/091) farklı origin'den bağlanır ve çerez taşımaz; native RN'de Auth.js çerezi zaten yok                                                            |
| **Yalnız `Authorization` başlığı**                                 | Tarayıcı `WebSocket` API'si özel başlık göndermez. Web istemcisi ve `react-native-web` hedefi tamamen dışarıda kalır                                                                 |
| **`Sec-WebSocket-Protocol` içinde token**                          | Sunucunun alt protokolü yankılaması gerekir; `experimental_upgradeWebSocket` handshake yanıtına erişim vermiyor (Z3). Doğrulanamayan mekanizma                                       |
| **Access token'ı doğrudan `?token=` ile göndermek**                | 15 dakikalık token Vercel erişim günlüklerinde kalır; referrer ve tarayıcı geçmişi yüzeyleri                                                                                         |
| **Tek kullanımlık bilet (DB'de `usedTickets`)**                    | Her bağlantıda bir yazma; Z2 yüzünden bağlantı kurulumu sık bir olay. Kazanç: 30 sn içinde tekrar kullanımın engellenmesi — ki bu zaten güvenli bir senaryo (kendi kendine takeover) |
| **Kimliksiz upgrade'e HTTP 401 dönmek**                            | KK-008'in istediği 4401 kapanış kodu üretilmez; istemci `1006` görür ve "ağ sorunu" sanıp sonsuz yeniden bağlanır                                                                    |
| **Kimliği ilk `join` mesajında taşımak** (upgrade'i açık bırakmak) | Kimliksiz açık bir soket, mesaj işlenmeden önce kaynak tüketir; DoS yüzeyi. Ayrıca KK-008 "hiçbir oda mesajı gönderilmez" diyor                                                      |

## Sonuçlar

- ✅ Üç istemci tipi de tek kod yolundan kimliklenir; KK-010 tek birim testi.
- ✅ Günlüklere yalnız 30 saniyelik, tek amaçlı bir jeton düşer.
- ✅ Kapanış kodları istemci davranışını **ayırır**: `4401`/`4409` → yeniden bağlanma yok;
  `4499` → gecikmesiz; diğerleri → üstel geri çekilme. Bu ayrım olmadan §3.2'nin
  "sonsuz takeover savaşı" yasağı uygulanamaz.
- ⚠️ **Doğrulanmamış varsayım V1:** `experimental_upgradeWebSocket`'in verdiği `ws` nesnesinin
  `close(code, reason)` desteklediği ve 4xxx kodunun istemciye ulaştığı **belgede yazmıyor**.
  Dalga 0d'de doğrudan sonda ile denenir. Ulaşmıyorsa geri çekilme planı: kimliksiz upgrade'e
  HTTP 401 döndürülür, KK-008'in metni "bağlantı kurulamaz" olarak güncellenir ve istemci
  tarafında 401'i ayırt eden bir ön kontrol (`POST /api/ws/ticket` 401'i) eklenir.
- ⚠️ `POST /api/ws/ticket` her bağlantı öncesi bir ek round-trip. Web bunu **kullanmaz**
  (çerezle geçer); yalnız mobil öder. Z2'nin 300 sn rotasyonuyla mobilde saatte ~12 ek istek —
  ihmal edilebilir.
- 📌 `maxPayload` 256 KiB varsayılanından **8 KiB**'a düşürülür. Protokoldeki en büyük mesaj
  birkaç yüz bayt; 256 KiB gereksiz bir bellek yüzeyi.
