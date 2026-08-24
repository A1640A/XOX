---
description: Board durumunu yeniler, state.md'yi üretir ve okunabilir özet gösterir
allowed-tools: Bash, Read, Write
---

1. `docs/board/board.json`'ı oku.
2. `.claude/hooks/pre-compact.sh` içindeki üretici mantıkla `docs/memory/state.md`'yi yenile.
3. Şu tabloyu göster:
   - Gece koşusu aktif mi, hangi dalga, deadline ne zaman
   - P0/P1/P2 tamamlanma yüzdeleri
   - **Bloklu görevler** — id, başlık, sebep, kaç deneme yapılmış
   - Bağımlılığı çözülmüş ve hazır bekleyen görevler
   - Son 10 journal olayı
   - `main` yeşil mi (`git log --oneline -1` + son `good/wave-*` tag'i)
4. `docs/board/danger.log` boş değilse **mutlaka göster.**
