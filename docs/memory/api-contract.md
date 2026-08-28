# API sözleşmesi (yaşayan doküman)

Kaynak şemalar: `packages/shared/src/ws-protocol.ts`. Bu doküman onu **anlatır**, tekrar tanımlamaz.

## REST

| Yöntem | Yol                       | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`             | Veritabanı erişilebilirliği. 200 `{ok:true,db}` / 503 `{ok:false,error}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| POST   | `/api/auth/register`      | KK-001…004. `registerBodySchema` → 201 `{userId}` / 400 (`INVALID_EMAIL`,`WEAK_PASSWORD`,`INVALID_NAME`) / 409 `EMAIL_TAKEN`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| \*     | `/api/auth/[...nextauth]` | Auth.js — Credentials + JWT, adapter yok (ADR-0009)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| POST   | `/api/ws/ticket`          | KK-010, ADR-0006. Gövde `{roomCode}` ZORUNLU. Oturumluysa (Bearer/çerez) `{ticket,expiresIn:30}` / 400 `INVALID_CODE` / 401 `UNAUTHENTICATED`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POST   | `/api/admin/migrate`      | OPS-003 · YALNIZ production runbook'u (CI bunu çağırmaz, bkz. decisions.md). `x-migration-secret` başlığı `MIGRATION_SECRET`'a `timingSafeEqual` ile eşleşmeli — eşleşmezse 404 (401/403 varlığı doğrular). `?db=xox_dev\|xox_test\|xox_prod` ZORUNLU ve sunucunun gerçek `getDbName()`'iyle eşleşmeli, aksi hâlde 409 `db_mismatch` (yanlış ortamı indekslemeyi engeller). Başarıda `ensureIndexes()` çağrılır → 200 `{ok:true,db,at}` / 400 `invalid_db_param` / 409 `already_running`\|`db_mismatch` / 503 `migration_failed` (sürücü hatası asla gövdeye/loga sızmaz) |
| GET    | `/api/health/realtime`    | RT-PROBE-001 · gerçek "health" değil, change-stream gecikme sondası — **production'da 404** (yalnız preview/dev). Tek seferde bir sonda çalışır (`probeRunning` kilidi, ikincisi 409). `?samples=&eventTimeoutMs=&gapMs=` ile ayarlanır. 200 `{ok,p50Ms,p95Ms,maxMs,budgetMs:1500,verdict:'pass'\|'fail',resumeTokenOnWrapper,resumeTokenOnDriver,peakOpenStreams,region,...}`                                                                                                                                                                                            |

## WebSocket

| Yol                    | Açıklama                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/rooms/[code]/ws` | Oyun WS upgrade'i. **Kimlik zorunlu** (çerez ya da `?ticket=`). `maxPayload` 8 KiB. Kapanış kodları aşağıda.                                                                                               |
| ~~`/api/ws/echo`~~     | **SİLİNDİ** (2026-08-25, WS-001 inceleme turu). Kimlik doğrulaması olmayan, sınırsız, açık echo ucuydu; `maxPayload` varsayılan 256 KiB'da 1:1 yansıtıcı olarak kullanılabiliyordu. Kanıt görevi bitmişti. |

**Kapanış kodları — preview'da istemciye ULAŞTIĞI ölçüldü** (ADR-0006'nın HTTP 401 geri çekilme
planına gerek kalmadı):

| Kod    | `reason`               | Ne zaman                       |
| ------ | ---------------------- | ------------------------------ |
| `4401` | `unauthenticated`      | kimliksiz ya da geçersiz bilet |
| `4403` | `ticket-room-mismatch` | bilet başka bir odaya ait      |
| `4404` | `invalid-code`         | oda kodu şemaya uymuyor        |
| `4404` | `room-not-found`       | oda yok ya da TTL ile silindi  |

Oyun uç noktaları Dalga 0+ ile eklenecek; her ekleme bu tabloyu günceller.

## Planlanan yüzey (ARCH-001 · henüz uygulanmadı)

Tam tablo, gövde şemaları ve dalga eşlemesi:
`docs/superpowers/specs/2026-08-24-xox-teknik-tasarim.md` §7.
Protokol değişikliklerinin gerekçesi: `docs/adr/0001-tasima-oyun-durumu-tipi.md`.

## Kimlik — tek çözücü (AUTH-001, uygulandı; güvenlik denetimi sonrası güncellendi)

`apps/web/lib/auth/identity.ts` → `resolveIdentity(req, options?)` SABİT sırayla en fazla üç
kaynağı dener: `Authorization: Bearer` (aud `xox-mobile-access`) → Auth.js çerezi → `?ticket=`
(aud `xox-ws`). Üçü de `{ userId, name, room? }` döner.

**⚠️ `?ticket=` VARSAYILAN OLARAK KAPALI.** `resolveIdentity(req)` (ikinci argüman yok) ticket
kaynağını hiç denemez — `options.allowTicket === true` AÇIKÇA geçilmeden `?ticket=` YOK SAYILIR.
İlk sürüm bunu her çağrıda kabul ediyordu; `POST /api/ws/ticket`'ın KENDİSİ bir bileti kabul
ediyor olması, saldırganın aynı bileti 25 sn'de bir bu uca tekrar POST ederek 30 saniyelik
sızıntıyı SÜRESİZ hesap devralmaya çevirmesine izin veriyordu (güvenlik denetimi BLOCKER-2).
**`allowTicket:true`'yu YALNIZ WS upgrade route'u (WS-001) geçmeli.**

`apps/web/lib/auth/tokens.ts` `jose` HS256 ile **üç ayrı audience** kullanır
(`xox-mobile-access` · `xox-mobile-refresh` · `xox-ws`) — ADR-0006/0005'in "mobil access/refresh
aynı aud, `typ` ile ayrışır" önerisinden BİLİNÇLİ sapma: kartın kriteri üç ayrı izleyici istedi,
bu da `typ` claim'i unutulsa bile çapraz kabulü kriptografik olarak imkânsız kılıyor.
`AUTH_SECRET` en az 32 karakter olmak ZORUNDA (`getSecretKey()` kısa sırrı REDDEDER — aynı sır
Auth.js oturum JWT'sini de imzalıyor, kısa bir sır tüm kimlik katmanını çökertir).

**Bilet oda koduna BAĞLIDIR (`room` claim, yatay yetki).** `POST /api/ws/ticket` gövdesi
`{roomCode}` İSTER (zod `roomCodeSchema`, route içinde yerel şema — `packages/shared`
DONDUĞU için oraya eklenmedi); dönen bilet `room` claim'ini taşır. **WS-001'in upgrade
handler'ı `identity.room`'u URL'deki oda koduyla KARŞILAŞTIRMAK ZORUNDADIR** — eşleşmezse
bağlantı reddedilmeli (öneri: `4403`). Aksi halde A odası için kesilmiş bir bilet B odasında
"aynı kullanıcı" olarak kabul edilir.

`POST /api/ws/ticket` bu çözücüyü `allowTicket` GEÇMEDEN kullanır (kendisi bir bilet ÜRETİR,
KABUL ETMEZ); WS-001'in WS upgrade route'u `resolveIdentity(req, { allowTicket: true })`
çağırmalı ve `identity.room`'u doğrulamalı.

Özet: `POST /api/auth/register` · `/api/auth/[...nextauth]` · `/api/auth/mobile/{authorize,callback,refresh}` ·
`POST /api/ws/ticket` · `POST /api/rooms` · `GET /api/rooms/[code]` · `GET /api/rooms/[code]/ws` ·
`GET /api/health/realtime` · `GET|PATCH /api/profile` · `GET /api/leaderboard` · `GET /api/matches` ·
`/api/friends`.

**Not:** `GET /api/health/realtime` bu listede planlanan yüzeyin parçası olarak görünüyor ama
YUKARIDAKİ REST tablosunda zaten UYGULANMIŞ durumda (RT-PROBE-001, KARAR KAPISI geçildi — bkz.
decisions.md). Dalga 0'da yeniden yazılmaz; olduğu gibi kalır, yalnız gerekirse `?samples=` ile
yeniden ölçülür.

**WS protokolü kırıcı biçimde genişliyor** (Dalga 0a, `CTR-001`): `state` mesajına
`you`/`turnDeadline`/`graceEndsAt`/`serverTime`/`rematch` eklenir, `players` görünen ad taşır,
`won` durumu `line: WinLine | null` + `reason: 'line'|'resign'|'timeout'|'abandon'` olur,
`move:rejected.reason` ve `error.code` enum'a daralır. Bu değişiklikler **tek dalgada** toplandı;
sonraki dalgalar protokol değiştirmez.

## `RoomDoc.result` (W1-02, Dalga 1)

`packages/db`'deki `rooms` koleksiyonuna `result: RoomResult | null` alanı eklendi —
`{ kind, winner, line, reason }`, `ADR-0001`'in taşıma `TransportStatus` şekliyle BİREBİR aynı.
`state:'finished'` ile AYNI CAS'ta yazılır (pes/süre-aşımı/terk dahil TÜM sonlanma yolları).
`apps/web/lib/game/room-view.ts` sonucu ÖNCELİKLE bu alandan okur (yalnız normal biten oyunlarda
tahtadan `evaluateStatus`e düşer) — sonuç `games` koleksiyonundan OKUNMAZ (bkz. decisions.md,
R1/tek-okuma-kaynağı gerekçesi).

## `ConnectionBadge` `data-durum` — DÖRT değer (W1-03, spec §2.0'ın yerini alır)

`docs/superpowers/specs/2026-08-24-xox-teknik-tasarim.md` §2.0'ın üçlü tablosu (`bagli`/`kopuk`/
`bekliyor`) GERİDE KALDI. Güncel dört değer:

| Değer        | Ne zaman                                          | İstemci davranışı                                                             |
| ------------ | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bagli`      | WS açık, oturum aktif                             | —                                                                             |
| `kopuk`      | Ağ kesintisi (1006 vb.), grace penceresi sürüyor  | Üstel geri çekilmeyle otomatik yeniden bağlan, "Tekrar dene" gösterilir       |
| `bekliyor`   | Rakip henüz katılmadı                             | —                                                                             |
| `devredildi` | Bu oturum `SESSION_TAKEOVER` (4409) ile kapatıldı | Yeniden bağlanma DENENMEZ, düğme gösterilmez (sonsuz takeover savaşını önler) |

`kopuk` ve `devredildi` davranışça TAM TERSTİR (biri yeniden dener, diğeri asla) — tek bir DOM
değerine sıkıştırılamaz, bkz. `decisions.md`.

## `rooms.turnDeadline` ARTIK YAZILIYOR — AS-08 kapandı (W2-01, Dalga 2)

`turnDeadline` P0 boyunca **daima `null`**du. Dalga 2'den itibaren:

| Yazan             | Değer                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `joinRoom`        | oyun başlarken `now + MOVE_TIMEOUT_SECONDS`                       |
| `applyMove`       | oyun sürüyorsa `now + MOVE_TIMEOUT_SECONDS`; oyun bittiyse `null` |
| `resign`          | `null`                                                            |
| `settleDeadlines` | `null` (sonuçla aynı CAS)                                         |
| `startRematch`    | `null` — **bilinen açık**, bkz. decisions.md                      |

`settleDeadlines(code, now)` artık gerçekten yazıyor: `casUpdateRoom({ code, version,
state:'playing' })` ile **tam olarak biri** yazar (çift yürütme idempotansı, ADR-0004).
Sonuç `forfeitStatus(winner, 'timeout'|'abandon')` → `rooms.result` + `games.endReason`.

**Uyarı — `move:applied` `turnDeadline` TAŞIMIYOR.** İstemcinin gördüğü sayaç tam `state`
mesajları arasında bayatlar. Sunucu otoritesi doğrudur; düzeltme için takip kartı gerekiyor
(decisions.md, 2026-08-28).
