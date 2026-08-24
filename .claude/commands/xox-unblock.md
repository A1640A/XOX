---
description: Bloklanmış bir görevi inceler, kararı uygular ve kuyruğa geri koyar
argument-hint: <task-id> [karar açıklaması]
allowed-tools: Bash, Read, Write, Edit, Task
---

Bloklu görev: $ARGUMENTS

1. `board.json`'dan görevi bul; `blockedReason` ve `attempts` değerlerini oku.
2. `docs/board/reports/<task-id>.md` raporunu oku — ne denendi, nerede takıldı.
3. `docs/memory/gotchas.md`'de ilgili bir kayıt var mı bak.
4. Kullanıcının kararını uygula. Karar verilmemişse **2-3 seçenek sun ve önerini söyle** — sonra dur.
5. Karar netse:
   - `status`'u `todo` yap, `attempts`'i `0`'a çek, `blockedReason`'ı temizle
   - Kararı görev kartının `acceptance` listesine bir madde olarak ekle (agent aynı duvara çarpmasın)
   - Kararı `docs/memory/decisions.md`'ye yaz
   - `journal.ndjson`'a `{"event":"unblocked","task":"<id>","decision":"<özet>"}` ekle
6. Gece koşusu aktifse görev bir sonraki dalgada otomatik alınır; değilse `/xox-wave` öner.
