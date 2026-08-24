# Mimari kararlar

> Format: tarih · karar · bağlam · gerekçe · reddedilen alternatifler

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
