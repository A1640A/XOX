---
description: xox-reporter agentını dispatch ederek sabah raporunu üretir
allowed-tools: Task, Bash, Read
---

`xox-reporter` agentını dispatch et. Ona şunları ver:

- `docs/board/board.json` yolu
- Kapsanacak zaman aralığı (varsayılan: son 12 saat)
- Raporun yazılacağı yol: `docs/reports/<bugünün tarihi>-night-run.md`

Agent bitince raporun yolunu ve yayınlanan Artifact URL'ini kullanıcıya göster.
