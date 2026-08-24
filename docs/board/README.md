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
| `status`      | `todo` · `in_wave` · `review` · `reviewing` · `blocked` · `done` · `failed`         |
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

## Durum anlamları — `Stop` hook'u bunlara göre karar verir

| Durum             | Anlamı                                               | Lead şu an bir şey yapabilir mi? |
| ----------------- | ---------------------------------------------------- | -------------------------------- |
| `todo`            | Bekliyor; bağımlılığı çözülmüşse dispatch edilebilir | **evet**                         |
| `in_wave`         | Dispatch edildi, geliştirici agent çalışıyor         | hayır, bekle                     |
| `review`          | Bitti, reviewer **henüz atanmadı**                   | **evet**                         |
| `reviewing`       | Reviewer atandı, çalışıyor                           | hayır, bekle                     |
| `blocked`         | İnsan kararı bekliyor                                | hayır                            |
| `done` / `failed` | Kapandı                                              | hayır                            |

`in_wave` ve `reviewing` **uçuşta** sayılır: hook duruşa izin verir, arka plan agent-i bitince
bildirim lead-i geri çağırır ve döngü kaldığı yerden devam eder. Bu ikisini "işlenebilir"
saymak canlı kilit yaratır — lead yield edemez ama dispatch edecek işi de yoktur.

## Kadro işleri de board'a yazılır

`xox-memory-curator`, `xox-integrator`, `xox-reporter` gibi **kart üretmeyen** agent'ların
koşuları da board'a bir görev olarak eklenmeli (`MEM-001`, `INT-<kart>`, `RPT-<tarih>`).

Sebep: `Stop` hook'unun kapasite hesabı `in_wave`/`reviewing` görevleri sayar. Board'da
temsil edilmeyen bir agent gerçek kapasiteyi tüketir ama hook onu görmez — sonuç, tavan
doluyken lead'in yeni iş dispatch etmeye zorlanması. Board, yapılan **tüm** işi modellemeli;
yalnız ürün kartlarını değil.
