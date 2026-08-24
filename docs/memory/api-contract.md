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
