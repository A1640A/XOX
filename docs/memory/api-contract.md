# API sözleşmesi (yaşayan doküman)

Kaynak şemalar: `packages/shared/src/ws-protocol.ts`. Bu doküman onu **anlatır**, tekrar tanımlamaz.

## REST

| Yöntem | Yol                       | Açıklama                                                                                                                     |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`             | Veritabanı erişilebilirliği. 200 `{ok:true,db}` / 503 `{ok:false,error}`                                                     |
| POST   | `/api/auth/register`      | KK-001…004. `registerBodySchema` → 201 `{userId}` / 400 (`INVALID_EMAIL`,`WEAK_PASSWORD`,`INVALID_NAME`) / 409 `EMAIL_TAKEN` |
| \*     | `/api/auth/[...nextauth]` | Auth.js — Credentials + JWT, adapter yok (ADR-0009)                                                                          |
| POST   | `/api/ws/ticket`          | KK-010, ADR-0006. Oturumluysa (Bearer/çerez) `{ticket,expiresIn:30}` / 401 `UNAUTHENTICATED`                                 |

## WebSocket

| Yol            | Açıklama                                 |
| -------------- | ---------------------------------------- |
| `/api/ws/echo` | Harness kanıt uç noktası. `x` → `echo:x` |

Oyun uç noktaları Dalga 0+ ile eklenecek; her ekleme bu tabloyu günceller.

## Planlanan yüzey (ARCH-001 · henüz uygulanmadı)

Tam tablo, gövde şemaları ve dalga eşlemesi:
`docs/superpowers/specs/2026-08-24-xox-teknik-tasarim.md` §7.
Protokol değişikliklerinin gerekçesi: `docs/adr/0001-tasima-oyun-durumu-tipi.md`.

## Kimlik — tek çözücü (AUTH-001, uygulandı)

`apps/web/lib/auth/identity.ts` → `resolveIdentity(req)` SABİT sırayla üç kaynağı dener:
`Authorization: Bearer` (aud `xox-mobile-access`) → Auth.js çerezi → `?ticket=` (aud `xox-ws`).
Üçü de `{ userId, name }` döner. `apps/web/lib/auth/tokens.ts` `jose` HS256 ile **üç ayrı
audience** kullanır (`xox-mobile-access` · `xox-mobile-refresh` · `xox-ws`) — ADR-0006/0005'in
"mobil access/refresh aynı aud, `typ` ile ayrışır" önerisinden BİLİNÇLİ sapma: kartın kriteri
üç ayrı izleyici istedi, bu da `typ` claim'i unutulsa bile çapraz kabulü kriptografik olarak
imkânsız kılıyor. `POST /api/ws/ticket` bu çözücüyü kullanır; WS-001 aynı fonksiyonu import eder.

Özet: `POST /api/auth/register` · `/api/auth/[...nextauth]` · `/api/auth/mobile/{authorize,callback,refresh}` ·
`POST /api/ws/ticket` · `POST /api/rooms` · `GET /api/rooms/[code]` · `GET /api/rooms/[code]/ws` ·
`GET /api/health/realtime` · `GET|PATCH /api/profile` · `GET /api/leaderboard` · `GET /api/matches` ·
`/api/friends`.

**WS protokolü kırıcı biçimde genişliyor** (Dalga 0a, `CTR-001`): `state` mesajına
`you`/`turnDeadline`/`graceEndsAt`/`serverTime`/`rematch` eklenir, `players` görünen ad taşır,
`won` durumu `line: WinLine | null` + `reason: 'line'|'resign'|'timeout'|'abandon'` olur,
`move:rejected.reason` ve `error.code` enum'a daralır. Bu değişiklikler **tek dalgada** toplandı;
sonraki dalgalar protokol değiştirmez.
