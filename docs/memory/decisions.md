# Mimari kararlar

> Format: tarih · karar · bağlam · gerekçe · reddedilen alternatifler

## 2026-08-24 · ✅ KARAR KAPISI GEÇİLDİ — change stream fan-out onaylandı (RT-PROBE-001)

Gerçek Vercel preview + gerçek Atlas, 5 koşu, 200 örnek, hiçbiri atılmadı:
**p50 96.2 ms · p95 98.6 ms · maks 633.6 ms** (tek soğuk başlangıç). Bütçe 1500 ms → p95
bütçenin **%6.6**'sı. Isınmış havuzda (N=175) p95 98.6 ms.

**Karar:** ADR-0002 doğrulandı. Gerçek zamanlı katman MongoDB change stream fan-out üzerine
kurulacak. **Upstash Redis pub/sub yedeği İPTAL.**

**Kapsam sınırı (dürüstlük notu):** Sonda "yazma → kendi stream-inde olay" ölçer, yani yazan
oyuncunun gördüğü süre. Karşı instance bacağı ölçülmedi; iki uçlu kanıt Dalga 0 E2E-001-in işi.
15× marj bu belirsizliği karşılıyor.

**Ölçüm kötümser üst sınırdı:** Fonksiyonlar `iad1`-de koşuyordu (proje varsayılanı), Atlas ise
Avrupa-da. Bölge `fra1`-e alındı; gerçek sayı bundan daha iyi olmalı.

## 2026-08-24 · Auth.js sağlayıcısı: Credentials (e-posta + parola)

**Karar:** P0'da tek sağlayıcı — Auth.js Credentials. Parola `argon2id` ile hash'lenir,
`users.passwordHash` alanında saklanır. `/kayit` ve `/giris` ekranları var.
**Gerekçe:** Harici konsol kurulumu gerektirmez; gece koşusunda agentlar bir OAuth uygulaması
açılmasını bekleyip tıkanmaz. Web ve mobilde aynı akış, E2E girişi seed'lenmiş test
kullanıcılarıyla önemsiz.
**Reddedilenler:** Google OAuth (Google Cloud'da uygulama + redirect URI kurulumu insan eli
ister, gece bloklanır) · ikisi birden (P0 kapsamını büyütür, hesap birleştirme işi çıkarır).
**İleriye dönük:** Auth.js'te sağlayıcı eklemek `providers: []` dizisine satır eklemektir;
Google/Apple sonradan mevcut hesapları bozmadan eklenebilir.

## 2026-08-24 · Gözlemlenebilirlik: Vercel'in kendi araçları, Sentry yok

**Karar:** Vercel Analytics + Speed Insights + Runtime Logs. Sentry entegrasyonu yapılmayacak.
**Gerekçe:** Sıfır kurulum, ek vendor ve ek anahtar yok; DSN bekleyen bloklu görev kalmaz.
**Reddedilen:** Sentry (daha zengin hata takibi ama DSN gerektiriyor ve P1'i bloklardı).
**Yeniden değerlendirme:** Gerçek kullanıcı trafiği başladıktan sonra.

## 2026-08-24 · Vercel Fluid Compute WebSocket'i GERÇEK deploy'da doğrulandı ✅

`experimental_upgradeWebSocket` gerçek bir Vercel preview deploy'unda çalışıyor.
Kanıt: `wss://<preview>/api/ws/echo` bağlantısı açıldı, `merhaba` gönderildi, `echo:merhaba` döndü.
Aynı deploy'da `/api/health` `{"ok":true,"db":"xox_test"}` verdi — Atlas erişilebilir ve preview
ortamı doğru veritabanına bakıyor. `apps/e2e` paketinin 4 testinin tamamı preview'a karşı geçti.

**Sonuç:** Gerçek zamanlı katman WebSocket üzerine kurulacak. `decisions.md`'deki Upstash Redis
pub/sub yedeğine **gerek yok**. Change stream fan-out'u (iki oyuncunun farklı Fluid instance'ına
düşmesi durumu) hâlâ Dalga 0'da ayrıca kanıtlanmalı — echo tek bağlantıyı test eder, iki
instance arası yayını değil.

**Kritik ön koşul:** `ws` paketi `apps/web`'de doğrudan bağımlılık olmalı. `@vercel/functions`
onu opsiyonel peer yapar; kurulmazsa çalışma anında `The "ws" package is required` fırlatır ve
bu kolayca "Vercel WS desteklemiyor" diye yanlış okunur.

## 2026-08-24 · Instance-arası WS yayını MongoDB Change Streams ile

**Bağlam:** İki oyuncu farklı Fluid Compute instance'ına düşebilir; bir instance'taki
WebSocket handler diğerine doğrudan mesaj gönderemez.
**Karar:** Her WS bağlantısı, odanın `rooms` dokümanı üzerinde koda filtreli bir change stream'e
abone olur. Sunucu otoriterdir; hamle önce dokümana yazılır, yayın stream'den gelir.
**Reddedilenler:** Upstash Redis pub/sub (ek vendor + maliyet) · sticky routing (Vercel garanti etmiyor).
**Yedek:** Change stream gecikmesi kabul edilemezse Redis pub/sub'a geçilir. Kararı Dalga 0 verir.

## 2026-08-24 · Workspace paketleri derlenmez, kaynak dışa verilir

**Karar:** `packages/*` `exports: { ".": "./src/index.ts" }` kullanır; Next `transpilePackages`,
Metro workspace çözümlemesi ile tüketir.
**Gerekçe:** Gece koşusunda paralel agentların build zincirini beklemesini ortadan kaldırır.
**Reddedilen:** tsup/tsc ile önden derleme — her değişiklikte `^build` bariyeri.

## 2026-08-24 · Lead ana oturumda, subagent değil

**Karar:** Orkestrasyon ana oturumda kalır; 18 agent yalnızca dispatch edilir.
**Gerekçe:** İç içe subagent dispatch'i kırılgan; lead worktree/dalga/board state'ini kaybetmemeli.
