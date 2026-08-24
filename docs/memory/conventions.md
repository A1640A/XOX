# Kod konvansiyonları

## Genel

- Türkçe yorum ve metin; İngilizce tanımlayıcı (değişken/fonksiyon/tip adı).
- Arayüz metinleri `apps/web/messages/tr.ts` ve mobilde karşılığı — bileşene gömme.
- Dışa açık her fonksiyonun dönüş tipi yazılır (`explicit-module-boundary-types`).
- **Tip importları — DÜZELTME (bu gece bir gerçek hataya yol açtı):** aynı dosyada değer ve tip
  karışık geliyorsa satır içi `import { type X }` kabul edilebilir. Ama SAF bir paketten
  yalnızca tip çekiyorsan (çalışma zamanı değeri yok) `import type { X } from 'paket'` kullan —
  `verbatimModuleSyntax` altında `import { type X }` yine de `import {} from 'paket'` olarak
  emit edilir ve paket modül grafiğine GİRER (`sideEffects: false` yoksa elenmez, Metro zaten
  tree-shake yapmaz). `docs/memory/gotchas.md`'de ayrıntı.

## Mongoose model kaydı (5 model dosyasında aynı kalıp)

`packages/db/src/models/{user,room,game,friendship,mobile-refresh-token}.ts` hepsi şu satırı
kullanır:

```ts
export const User =
  (models['User'] as Model<UserDoc> | undefined) ?? model<UserDoc>('User', userSchema)
```

Cast MUTLAKA `as Model<X> | undefined` olmalı — `as Model<X>` yazılırsa `undefined` `??`'den
ÖNCE elenir, fallback ölü koda döner ve HMR/yeniden içe aktarmada `OverwriteModelError` çıkar.

## Auth.js sarmalayıcı ayrımı: ince tel dosyası + next-auth'suz iş mantığı

`next-auth` import eden hiçbir dosya (`auth.ts`, `middleware.ts`) Vitest'te ÇALIŞTIRILAMAZ
(derlenmiş çıktısı native ESM yükleyicisinde patlıyor — bkz. gotchas). Bu yüzden gerçek iş
mantığı next-auth'a hiçbir bağımlılığı olmayan ayrı dosyalarda yazılır ve ORADAN test edilir:
`lib/auth/authorize.ts` (KK-005 sabit-zamanlı giriş mantığı), `lib/auth/session-callback.ts`
(yalnız `import type` ile next-auth tiplerini kullanır, çalışma zamanı bağımlılığı yok),
`lib/auth/identity.ts`, `lib/auth/tokens.ts`. `auth.ts`/`middleware.ts` yalnız bunları çağıran
ince teller; onlar için mekanik kanıt `pnpm --filter @xox/web build`'dir, birim testi değil.
Yeni bir Auth.js callback'i ya da WS upgrade handler'ı eklerken aynı ayrımı uygula.

## Test: şema/liste doğrulayan testler İKİ KATMANLI olmalı

Bir testin "doğru" listesini test ettiği şemadan/sabitten TÜRETMEK (`schema.shape`, sabitin
kendisi, `nativeColors` gövdesiyle aynı referans) o alan/değer SİLİNDİĞİNDE veya yanlış
DEĞİŞTİRİLDİĞİNDE testi de birlikte götürür — test yeşil kalır, koruma sıfırdır. Bu gece 6+
yerde aynı sınıf bulundu (kendine-referanslı zorunlu-alan testi, `errorCodeSchema.options`
kendiyle kıyası, özdeşlik iddiası, sabitten türetilmiş gecikme beklentisi, seçilme
gerekçesinden farklı eşik, zod'un mutlu-yol `safeParse`'ı). **Kural:** türetilmiş test (kapsamı
otomatik genişletir) ile elle yazılmış, testin DIŞINDAN gelen bir beklenti tablosunu/çıplak
sayıyı BİRLİKTE kullan. Sonda: alanı/değeri sil ya da değiştir — test kırmızı olmuyorsa testin
değil senin varsayımın yanlış. Ayrıntı: `docs/memory/gotchas.md` "Test yeşil ama hiçbir şey
doğrulamıyor".

## Bağımlılık tek-kopya doğrulaması: `pnpm why`

Bir paketi hem doğrudan hem transitif kullanıyorsan (`jose`, `mongodb`) `pnpm why <paket>` ile
TEK kopya olduğunu doğrula. İki kopya varsa `instanceof` kontrolleri (`err instanceof
JWTExpired`) kopyalar arasında sessizce `false` döner — 401 yerine 500, "reddedildi" testi
yanlış nedenle yeşil kalır. Eşleşmiyorsa üst paketin çözdüğü sürüme sabitle ya da pnpm
`overrides` kullan.

## Test

- TDD zorunlu: önce kırmızı test, sonra minimum implementasyon.
- Test adları Türkçe ve davranış anlatır: `'dolu hücrede InvalidMoveError atar'`.
- Rastgelelik enjekte edilir (`rng: () => number = Math.random`) — test deterministik olsun.
- `game-core` savunmacı dal içermez; indeks güvenliği `cellAt` gibi tek noktada daraltılır.

## Dosya boyutu

- 250 satırı geçen kaynak dosya bölünmeye adaydır. Sorumluluğa göre böl, katmana göre değil.

## Hata yönetimi

- Alan hataları için isimli sınıf (`InvalidMoveError`), string throw yok.
- API route'ları hatayı yakalayıp yapılandırılmış JSON döner, stack sızdırmaz.

## Güvenlik — `/giris?donus=` sözleşmesi (AUTH-001 güvenlik denetimi)

`middleware.ts`/`auth.config.ts`'in ürettiği `donus` değeri BUGÜN yalnız sunucu tarafında
`request.nextUrl.pathname + search`'ten türetiliyor (kullanıcı girdisi DEĞİL) — açık yönlendirme
riski şu an YOK. Ama `/giris` sayfası bu parametreyi OKUYUP giriş sonrası yönlendirme yapacağı
için (henüz yazılmadı) şu kural bağlayıcıdır:

**`/giris` sayfası `donus`u kullanmadan önce DOĞRULAMALI:**

- `donus.startsWith('/')` — göreli bir yol olmalı.
- `!donus.startsWith('//')` — protokol-göreli URL'ler (`//evil.com`) tarayıcıda MUTLAK URL'e
  çözülür, bu açık yönlendirme yüzeyidir.

Doğrulama başarısızsa `/` gibi güvenli bir varsayılana düş. Bu iki kontrol olmadan, `donus`
gelecekte bir yerde kullanıcı girdisinden türetilirse (örn. bir deep-link/e-posta bağlantısı)
sessizce açık yönlendirmeye dönüşür.
