# Mimari kararlar

> Format: tarih · karar · bağlam · gerekçe · reddedilen alternatifler

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
