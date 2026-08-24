# ADR-0009 — Kimlik: Credentials + argon2id + JWT, P0'da MongoDB adapter YOK

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** `decisions.md` "Auth.js sağlayıcısı: Credentials" · KK-001…011, KK-004, KK-005, KK-006

## Bağlam

Sağlayıcı kararı verilmişti (Credentials, e-posta + parola, `argon2id`, `users.passwordHash`).
Açık kalan üç uygulama sorusu vardı:

1. `@auth/mongodb-adapter` kullanılacak mı?
2. Hangi argon2 kütüphanesi Vercel'de çalışır?
3. Middleware korumasında Auth.js nasıl kullanılır (kenar çalışma zamanı kısıtı)?

Zemin bilgileri:

- Auth.js dokümanı: "By default, the Credentials provider **does not persist data in the
  database**." `signIn` kullanıcı **oluşturmaz**.
- `packages/db`'deki `UserDoc._id` **string** (`_id: { type: String, required: true }`,
  `_id: false` schema seçeneğiyle). Seed `'e2e-user-1'` gibi sabit kimlikler yazıyor.
- `@auth/mongodb-adapter` `users` koleksiyonunu **`ObjectId` `_id`** ile yönetir.
- `getMongoClient()` (mongoose istemcisini paylaşan) adapter için zaten yazılmıştı.

## Karar

### A. P0'da adapter **kullanılmaz**

`NextAuth({ providers: [Credentials({ authorize })], session: { strategy: 'jwt' }, pages: { signIn: '/giris' } })`
— `adapter` alanı **yok**.

`getMongoClient()` `@xox/db`'de **kalır** (entry export olduğu için knip flag'lemez) ve OAuth
eklendiğinde kullanılır.

### B. Kayıt ayrı REST uç noktasıdır

`POST /api/auth/register` → zod doğrulama → `argon2id` hash → `User.create({ _id: randomUUID(), … })`
→ duplicate key 11000 ⇒ `409 EMAIL_TAKEN`. İstemci 201'den sonra `signIn('credentials', …)` çağırır.

`users.email` üzerinde **unique** indeks; KK-002 bu indeksin duplicate key hatasına dayanır,
"önce oku sonra yaz" kontrolüne değil (yarış).

### C. `@node-rs/argon2`, `argon2` değil

`@node-rs/argon2@2.1.0` napi-rs tabanlıdır ve `linux-x64-gnu` dahil 13 platform için
**önceden derlenmiş ikili** yayınlar (npm registry'den canlı doğrulandı). Vercel'de node-gyp
derleme adımı yoktur.

`passwordHash` alanı `{ select: false }` — kazara serileştirme imkânsız; `authorize()`
bilerek `.select('+passwordHash')` yazar ve bu satır kod incelemesinde göze çarpar.

### D. Sabit zamanlı giriş

`authorize()` kullanıcıyı bulamazsa da **sabit bir sahte hash'e karşı `verify` koşturur**,
sonra `null` döner. KK-005 iki durumun ±100 ms içinde olmasını istiyor.

### E. Middleware split config

```
auth.config.ts   kenar-güvenli: pages + callbacks.authorized. mongoose/argon2 İMPORT ETMEZ
auth.ts          tam: Credentials({ authorize }) + db erişimi + argon2
middleware.ts    yalnız auth.config.ts'i kullanır
```

Korunan rotalar: `/oyna/:path*`, `/oda/:path*`, `/profil`, `/siralama`, `/gecmis`, `/arkadaslar`
→ `307 /giris?donus=<pathname+search>` (KK-007). `/davet/:kod` korunmaz; kendi içinde yönlendirir
(KK-121).

## Gerekçe

**A — neden adapter yok:**

- **Kimlik tipi çakışması:** adapter `users._id`'yi `ObjectId` olarak yönetir; bizim modelimiz
  string kullanıyor ve seed sabit string kimlikler yazıyor. İkisi aynı koleksiyonda yaşayamaz.
  Ya `UserDoc` yeniden yazılır (seed, `Room.seats`, `Game.players` — hepsi string `userId`
  taşıyor) ya da adapter kullanılmaz.
- **Adapter zaten hiçbir iş yapmıyor:** Credentials kullanıcı oluşturmuyor (Auth.js dokümanı),
  JWT session stratejisinde `sessions` koleksiyonu kullanılmıyor, `accounts` yalnız OAuth için.
  Yani adapter kurmak bir çakışma riski ekliyor ve karşılığında **sıfır** işlev veriyor.
- **İleri yol açık:** OAuth eklendiğinde adapter eklenir; o an `UserDoc._id`'nin string kalması
  için `MongoDBAdapter`'a özel bir `_id` üreticisi verilir ya da hesap birleştirme mantığı
  yazılır. O karar OAuth kararıyla birlikte alınır — şimdi alınmaz.

**B — neden ayrı kayıt uç noktası:** Auth.js dokümanı açık: Credentials `signIn` kullanıcı
yaratmaz. Kayıt için başka bir yol yok. Bunun bir yan faydası var: KK-003'ün sunucu tarafı
doğrulaması (parola < 8, e-posta formatı, ad 2–40) düz bir zod şeması ve düz bir birim testidir;
Auth.js callback zincirine sıkıştırılmaz.

**C — neden `@node-rs/argon2`:** `argon2` (node-pre-gyp) paketinin Vercel bundle'ında native
ikiliyi doğru taşıması `serverExternalPackages` ayarı ve şansa bağlıdır; başarısız olduğunda
hata çalışma anında ve anlaşılmaz gelir. napi-rs prebuilt'leri optional dependency olarak
platform bazında kurulur — pnpm izole linker'ında dahi sorunsuz.

**D — neden sahte verify:** hash doğrulaması ~50 ms, "kullanıcı yok" dalı ~1 ms sürer.
Bu fark ölçülebilir ve e-posta numaralandırmasına açık bir kanal üretir. KK-005 bunu
±100 ms ile teste bağlamış; sahte verify tek satırlık ve kesin çözüm.

**E — neden split config:** Next.js middleware kenar çalışma zamanındadır. `auth.ts`
`mongoose` ve `@node-rs/argon2` (native ikili) import ediyor; `middleware.ts` onu import
ederse **build kenar çalışma zamanında patlar**. Auth.js'in belgelenmiş kalıbı bu ayrımdır.

## Reddedilen alternatifler

| Alternatif                                                             | Neden reddedildi                                                                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@auth/mongodb-adapter` kullanmak**                                  | `ObjectId` vs string `_id` çakışması; Credentials + JWT'de zaten hiçbir iş yapmıyor; `UserDoc`, seed, `Room.seats`, `Game.players` yeniden yazılırdı              |
| **`UserDoc._id`'yi `ObjectId`'ye çevirmek**                            | `Room.seats`, `Game.players`, `Game.participants`, `friendships` ve seed'in tamamı string `userId` taşıyor; JSON serileştirmede her yerde `.toString()` gerekirdi |
| **`argon2` (node-pre-gyp)**                                            | Vercel bundle'ında native ikili taşıma `serverExternalPackages`'a ve şansa bağlı; hata çalışma anında ve anlaşılmaz                                               |
| **bcrypt**                                                             | argon2id, parola hash'leme için güncel önerilen algoritma; `decisions.md` argon2id'yi zaten sabitledi                                                             |
| **`scrypt` (Node yerleşik)**                                           | Yerleşik olması cazip ama parametre seçimi ve tuz yönetimi elle yazılır; hazır ve doğru bir argon2id sarmalayıcısı varken gereksiz risk                           |
| **Middleware'de gerçek `auth()` yerine yalnız çerez varlığına bakmak** | Kenar kısıtını çözer ama sahte bir çerez middleware'i geçer; sayfa seviyesinde ikinci bir kontrol gerekir ve KK-007'nin 307 iddiası zayıflar                      |
| **Middleware kullanmayıp her sayfada `getCurrentUser()`**              | Yedi rota × iki uygulama; unutulan tek rota koruma boşluğudur. Middleware tek yer                                                                                 |
| **Kullanıcı var mı diye önce okumak (unique indeks yerine)**           | Yarış: iki eşzamanlı kayıt ikisi de "yok" görür. Unique indeks tek doğru cevap                                                                                    |

## Sonuçlar

- ✅ P0 kimlik yüzeyi üç dosya + iki uç nokta; harici konsol kurulumu yok, gece koşusu bloklanmaz.
- ✅ KK-002 (409 `EMAIL_TAKEN`) unique indeksten gelir, yarışa dayanıklı.
- ✅ KK-004 (`password` alanı yok, `passwordHash` düz metne eşit değil) `select: false` ile
  ikinci bir savunma kazanır.
- ✅ KK-005 sabit zamanlı; e-posta numaralandırması kapalı.
- ⚠️ `AUTH_SECRET` hem web oturumunu hem mobil token'ları imzalıyor (ADR-0005). Döndürülürse
  tüm oturumlar düşer. `.env.example`'a operasyonel not yazılır.
- ⚠️ **Doğrulanmamış varsayım V2:** Auth.js v5 beta'da Credentials + `strategy: 'jwt'`
  çerezinin tarayıcı kapanıp açıldıktan sonra sürmesi (KK-006) belgeden doğrulanamadı —
  Auth.js dokümanları Credentials/JWT ilişkisini açıkça yazmıyor. `strategy: 'jwt'` **açıkça**
  yapılandırılır (varsayılana güvenilmez) ve KK-006 Dalga 0e'de gerçek preview'da koşar.
- ⚠️ OAuth eklendiğinde bu ADR yeniden açılır: adapter + hesap birleştirme + `_id` stratejisi
  tek bir kararda ele alınır. `decisions.md`'nin "providers dizisine satır eklemek" ifadesi
  Credentials-only durumda doğrudur, adapter gerektiren sağlayıcılarda bu ADR'ın revizyonunu
  gerektirir.
