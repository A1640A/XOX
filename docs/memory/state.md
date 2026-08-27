# XOX — anlık durum

> Otomatik üretildi. Kaynak: `docs/board/board.json` · commit `4c3d270`
> Bu dosya **insan-okur özet**; tek gerçek kaynak board.json'dır.

## Sayılar

- **52 / 81** kart bitti
- 19 hazır · 8 bağımlılık bekliyor · 0 bloklu

## Tahta boyutu özelliği

**CANLI** — `UI-CFG-001` merge'üyle kullanıcıya açıldı (ADR-0018 §2: yayın tek bir kartın
merge'üdür). 3×3 · 6×6 · 11×11, K ayarlanabilir.

Kalan: `DESIGN-001b` · `E2E-BOARD-001`

## Bloklu

_yok_

## Hazır (bağımlılığı çözülmüş)

| Kart          | Ö   | Başlık                                                                         | Ajan             |
| ------------- | --- | ------------------------------------------------------------------------------ | ---------------- |
| `PERF-005`    | P1  | shared barreli istemciye ZOD sokuyor — 68.7 kB gzip, olculdu                   | xox-dev-web      |
| `SEC-005`     | P2  | revokeWsTicketsForUser yazildi ve test edildi ama HIC CAGRILMIYOR — signOut ka | xox-dev-backend  |
| `OPS-009`     | P2  | Skew Protection ve kill switch CANLI ortamda hic denenmedi — provasi yapilmali | xox-devops       |
| `CI-005`      | P3  | game-engine.test.ts yenilmezlik sondasi YUKE DUYARLI — paralel kosuda kirmizi  | xox-test-writer  |
| `W2-01`       | —   | Hamle süresi ve terk grace'i — çift yürütme (zamanlayıcı + tembel)             | xox-dev-realtime |
| `W2-03`       | —   | Mobil paritesi + mobil auth köprüsü (deep link, döndürmeli refresh)            | xox-dev-mobile   |
| `W3-02`       | —   | Maç geçmişi                                                                    | xox-dev-web      |
| `PERF-001`    | —   | Performans olcumu: bundle, RSC/client orani, Mongo indeks kullanimi, WS mesaj  | xox-perf         |
| `DRY-002`     | —   | errorJson tek kaynağa: apps/web/lib/http/error-json.ts                         | xox-dev-backend  |
| `OPS-004`     | —   | Next 16: middleware -> proxy dosya konvansiyonu gecisi                         | xox-devops       |
| `DB-004`      | —   | apps/web -> Mongoose model sınırını LINT ile dayat (DB-003 takibi)             | xox-dev-backend  |
| `OPS-005`     | —   | rescue tag temizligi + danger.log hic yazmiyor                                 | xox-devops       |
| `CI-003`      | —   | E2E (preview) isi HIC kosmuyor — main = Production Branch                      | xox-devops       |
| `UI-002`      | —   | Ana sayfada iki bagimsiz hata-mesaji dugumu olusabiliyor                       | xox-dev-web      |
| `DB-005`      | —   | seedTestUsers $setOnInsert kullaniyor — istatistikler HIC sifirlanmiyor        | xox-dev-backend  |
| `DESIGN-001b` | —   | Yon A'nin bilesenlere uygulanmasi — board/** HARIC, yeni token TANIMLANMAZ     | xox-designer     |
| `OPS-007`     | —   | E2E guard kirmizisi GEVSETILMEZ — nobetci kart                                 | xox-qa-e2e       |
| `W2-05`       | —   | Tema cihazlar arasi senkron degil — resolveTheme yalniz cerezi okuyor          | xox-dev-web      |
| `SEC-004`     | —   | Bilet maskelemesini hicbir test korumuyor — bugun yalniz JWT deseni kurtariyor | xox-test-writer  |

## Bağımlılık bekleyen

| Kart            | Ö   | Başlık                                                       | Bekliyor     |
| --------------- | --- | ------------------------------------------------------------ | ------------ |
| `E2E-004`       | —   | P1 E2E: hamle süresi, terk, profil ve tema                   | W2-01        |
| `E2E-005`       | —   | P1 E2E: mobil web hedefi duman testi ve ortam sağlığı        | W2-03        |
| `W3-01`         | —   | ELO, puanlılık kuralları ve sıralama                         | W2-01        |
| `E2E-006`       | —   | P2 E2E: sıralama, geçmiş, davet, emoji, arkadaşlar + 88 krit | W3-01, W3-02 |
| `HRD-001`       | —   | Sertleştirme: kapsam eşikleri ve shared mutasyon testi       | E2E-006      |
| `HRD-002`       | —   | Production yayın doğrulaması ve WS rotasyonunun canlı kanıtı | E2E-005      |
| `HRD-003`       | —   | Tam E2E regresyonu, flake avı ve yerel vc dev duman testi    | E2E-006      |
| `E2E-BOARD-001` | —   | OZELLIK KAPISI: 15 [E2E] kriteri + axe uc boyutta + eski ist | DESIGN-001b  |

## Ömer'i bekleyen

- `OPS-009` — kill switch ve Skew Protection **canlıda hiç denenmedi**. Prova production
  değişikliği gerektiriyor, onay bekliyor.
- `AI-SPIKE-001` `[MANUEL]` — gerçek Android ölçümü. `R = 6` hâlâ varsayım ve
  `ai-config.ts`'te **DOĞRULANMAMIŞ** damgası duruyor. Masaüstünde düğüm bütçesi
  bağlayıcı olduğu için bugünkü davranış bu varsayıma bağlı değil.
