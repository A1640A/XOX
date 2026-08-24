# Görev panosu

`board.json` lead'in tek gerçek kaynağıdır. Context sıkışsa da bu dosya kalır.

## Görev kaydı

```json
{
  "id": "P0-003",
  "title": "Oda oluşturma API uç noktası",
  "tier": "P0",
  "agent": "xox-dev-backend",
  "deps": ["P0-001"],
  "conflictSet": ["apps/web/app/api/rooms/**", "packages/db/src/models/room.ts"],
  "status": "todo",
  "attempts": 0,
  "branch": null,
  "report": null,
  "acceptance": ["POST /api/rooms 201 ve 6 haneli kod döner", "Aynı kod iki kez üretilmez"],
  "blockedReason": null
}
```

| Alan          | Anlamı                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| `status`      | `todo` · `in_wave` · `review` · `blocked` · `done` · `failed`                       |
| `deps`        | Bu görev başlamadan `done` olması gereken görev id'leri                             |
| `conflictSet` | Dokunacağı dosya desenleri. **İki görev aynı dalgaya ancak kümeleri ayrıksa girer** |
| `attempts`    | 3'e ulaşırsa `blocked` yapılır ve gece durmadan devam eder                          |

## journal.ndjson

Her satır bağımsız bir JSON olay. Append-only — çakışmaz, asla silinmez.

```json
{
  "ts": "2026-08-25T02:14:03Z",
  "wave": 3,
  "event": "task.done",
  "task": "P0-003",
  "agent": "xox-dev-backend",
  "tests": "8/8"
}
```

Olaylar: `wave.start` · `task.dispatch` · `task.done` · `task.blocked` · `review.finding` ·
`merge.ok` · `merge.revert` · `deploy.preview` · `qa.result` · `decision` · `gotcha` · `danger`
