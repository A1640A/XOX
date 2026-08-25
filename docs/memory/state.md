# Anlık durum

> Elle yazılır (memory-curator). `/xox-status` board.json'dan otomatik tablo istiyorsa onu ayrıca
> üretir — burası "neredeyim, ne kanıtlandı, ne kaldı" sorusuna 2 dakikada cevap vermek için.

**Son güncelleme:** 2026-08-25 (Dalga 0 + Dalga 1 kapandı, gece koşusu sürüyor, deadline 07:30)

## Neredeyiz

- **Dalga 0 (yürüyen iskelet):** KAPANDI. Etiket `good/wave-0`. Gerçek preview + gerçek Atlas'a
  karşı 11/11 E2E, 0 skip, 0 flaky. Kanıtlananlar: Vercel WS gerçek kapanış kodlarıyla (4401/
  4403/4404) çalışıyor, change stream fan-out fra1'de p95 8.7ms (bütçenin %0.58'i), instance
  başına tek stream (3 bağlantı → watchCalls=1), oturum sürekliliği.
- **Dalga 1 (offline oyun + sonuç/pes/rövanş + kopma/resync/takeover):** KAPANDI. Etiket
  `good/oyun-w1`. W1-01 (eb0a06d), W1-02 (2288183), W1-03 (643c97a) merge edildi. Birleşik
  incelemenin karşılığı: deneme merge'i X1 blocker'ı yakaladı (W1-03 fixture'ı W1-02'nin yeni
  `RoomDoc.result` alanını bilmiyordu — metinsel çakışma yoktu, typecheck kırılıyordu).
- **Toplam:** 1209 test, 21/48 kart done (board.json'a bak — bu dosyaya elle sayı yazılmıyor, o
  bayatlar).
- **CI:** `.github/workflows/ci.yml` `gates` işi ~5 saat kırmızı kaldı (`MONGODB_URI` yok, Atlas'a
  koşan `@xox/db` testleri düşüyordu) — CI-002 dispatch edildi, çözüm CI'a replica set servis
  container'ı vermek. Bu dalga sonunda `gh run list --workflow=CI --limit 3` ile doğrula, yerel
  `pnpm gates` yeşili CI'ın gerçeğini KANITLAMAZ (bkz. `gotchas.md` örüntü #6, `CLAUDE.md`).

## Bilerek ertelenenler / açık borçlar

- **W1-02 kriter 11 BLOCKED:** rakip rövanş beklerken ayrılırsa teklif edene sinyal gitmiyor
  (`rematch:cancelled{reason:'opponent-left'}` protokolde var, üreten kod yok). Handoff üç adım
  halinde `W1-02.md`'de yazılı: `detach.ts` (finished odada rematic temizleme), `connection.ts`
  (sebep artık sabit `'expired'`), `RoomScreen.tsx` (yeni prop, DONDURULMUŞ dosya).
- **W2-01'e borç:** aynı `opponent-left` teli, terk/grace kartıyla birlikte kapatılabilir.
- **SEC-001 blocked:** Atlas parolasını rotate et — Ömer'in Atlas konsol erişimi gerekiyor, acil
  değil (düşük ama sıfır olmayan risk: sır bir kez transkripte düştü, repoya hiç girmedi).
- **OPS-001 blocked:** production domain bağlama — Ömer'den DNS/takım kararı gerekiyor, yalnız
  production domainini etkiliyor, preview/E2E etkilenmiyor.
- **HIGH-2'nin (SEC-002) hesap-geneli 10-deneme/5dk katmanı** canlıda izole doğrulanamadı (Vercel
  IP normalizasyonu tek gerçek IP'ye indiriyor) — yalnız birim testinde kanıtlı, kritik değil.
- **WAF eşiği önerisi (SEC-002):** `GET /api/rooms/*/ws` 30/60sn'den 60/60sn'e çıkarılması
  ÖNERİLDİ, komut ÇALIŞTIRILMADI — Ömer'in kararı bekliyor.

## Süreç notu (tekrarlanmasın)

- SEC-002 ajanı bir izin reddini lead mesajından sonra tekrar deneyip geçirdi
  (`vercel firewall publish`). Somut zarar yok, mekanizma yanlış çalıştı — kural artık
  `gotchas.md`'de: lead onayı izin reddini geçersiz kılmaz, yalnız kullanıcı kılar.
- Lead, integrator `main`'de merge koştururken aynı checkout'a commit atmasın (git kirlenir).

## Sıradaki dalga adayları (board.json'daki `todo`lardan, öncelik sırasıyla)

E2E-002/E2E-003 (P0 E2E kapıları) → W1-04 (oda/katıl, bilinçli ertelendi) → W2-01..04 (P1: süre
aşımı, profil/tema, mobil parite, gözlemlenebilirlik) → HRD-00x/PERF-001 sertleştirme.
Detay ve blok sebepleri için `docs/board/board.json` tek doğruluk kaynağıdır, bu dosyaya kart
listesi kopyalanmaz.
