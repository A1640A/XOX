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
