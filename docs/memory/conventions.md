# Kod konvansiyonları

## Genel

- Türkçe yorum ve metin; İngilizce tanımlayıcı (değişken/fonksiyon/tip adı).
- Arayüz metinleri `apps/web/messages/tr.ts` ve mobilde karşılığı — bileşene gömme.
- Dışa açık her fonksiyonun dönüş tipi yazılır (`explicit-module-boundary-types`).
- `type` importları `import { type X }` biçiminde satır içi.

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
