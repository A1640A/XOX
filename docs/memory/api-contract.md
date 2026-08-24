# API sözleşmesi (yaşayan doküman)

Kaynak şemalar: `packages/shared/src/ws-protocol.ts`. Bu doküman onu **anlatır**, tekrar tanımlamaz.

## REST

| Yöntem | Yol           | Açıklama                                                                 |
| ------ | ------------- | ------------------------------------------------------------------------ |
| GET    | `/api/health` | Veritabanı erişilebilirliği. 200 `{ok:true,db}` / 503 `{ok:false,error}` |

## WebSocket

| Yol            | Açıklama                                 |
| -------------- | ---------------------------------------- |
| `/api/ws/echo` | Harness kanıt uç noktası. `x` → `echo:x` |

Oyun uç noktaları Dalga 0+ ile eklenecek; her ekleme bu tabloyu günceller.

## Planlanan yüzey (ARCH-001 · henüz uygulanmadı)

Tam tablo, gövde şemaları ve dalga eşlemesi:
`docs/superpowers/specs/2026-08-24-xox-teknik-tasarim.md` §7.
Protokol değişikliklerinin gerekçesi: `docs/adr/0001-tasima-oyun-durumu-tipi.md`.

Özet: `POST /api/auth/register` · `/api/auth/[...nextauth]` · `/api/auth/mobile/{authorize,callback,refresh}` ·
`POST /api/ws/ticket` · `POST /api/rooms` · `GET /api/rooms/[code]` · `GET /api/rooms/[code]/ws` ·
`GET /api/health/realtime` · `GET|PATCH /api/profile` · `GET /api/leaderboard` · `GET /api/matches` ·
`/api/friends`.

**WS protokolü kırıcı biçimde genişliyor** (Dalga 0a, `CTR-001`): `state` mesajına
`you`/`turnDeadline`/`graceEndsAt`/`serverTime`/`rematch` eklenir, `players` görünen ad taşır,
`won` durumu `line: WinLine | null` + `reason: 'line'|'resign'|'timeout'|'abandon'` olur,
`move:rejected.reason` ve `error.code` enum'a daralır. Bu değişiklikler **tek dalgada** toplandı;
sonraki dalgalar protokol değiştirmez.
