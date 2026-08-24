---
description: Otonom gece koşusunu başlatır — board'u işleyen dalga döngüsü, sabah raporuyla biter
argument-hint: [--until HH:MM] [--max-parallel N]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

Otonom gece koşusunu başlat. Argümanlar: $ARGUMENTS
(varsayılan: `--until 07:30 --max-parallel 4`)

## HAZIRLIK

1. **macOS uyumasını engelle** (bu olmadan koşu gece yarısı ölür):
   ```bash
   nohup caffeinate -dimsu -w $PPID > /dev/null 2>&1 &
   ```
2. **Koşu bayrağını yaz** — `docs/board/.night-run-active`:
   ```json
   { "deadline": "<bugün/yarın HH:MM ISO>", "maxWaves": 40, "startedAt": "<şimdi ISO>" }
   ```
3. **Ön uçuş:**
   ```bash
   pnpm install && pnpm gates
   ```
   Kırmızıysa **dalga başlatma** — önce mevcut hatayı düzelt.
4. **Board boşsa** sırayla dispatch et: `xox-analyst` → `xox-architect` → `xox-planner`.
   Planner `board.json`'ı doldurur.
5. **DALGA 0 — yürüyen iskelet.** İlk dalga tek bir dikey dilimdir: giriş → oda kur →
   ikinci istemci katıl → hamle → karşı tarafta görün, **gerçek Vercel preview + gerçek Atlas
   üzerinde kanıtlanmış.** Bu yeşil yanmadan başka hiçbir dalga başlamaz. Kanıtlanamazsa
   `decisions.md`'deki Redis yedeğini gündeme al ve Ömer'e bildirim gönder.

## DALGA DÖNGÜSÜ

`CLAUDE.md` içindeki döngüyü uygula. Her dalgada:

1. `board.json` oku → `deps` çözülmüş **ve** `conflictSet`'leri **ayrık** görevleri seç (≤ N)
2. Her göreve worktree: `.claude/worktrees/<task-id>`, branch `feat/<task-id>`
3. **Tek mesajda** paralel dispatch (her görev kendi uzman agentına)
4. Raporları topla → `board.json` güncelle → `journal.ndjson`'a yaz
5. Bitenleri `xox-reviewer`'a (+ auth/WS/DB'ye dokunduysa `xox-security`, UI/sorgu ise `xox-perf`)
6. Bulgu varsa aynı dev agenta fix görevi. **3 deneme sonrası `blocked` yap ve devam et** —
   hiçbir görev geceyi kilitleyemez
7. Yeşilleri `xox-integrator`'a → `main`'e sırayla merge
8. `xox-devops` → preview deploy → URL
9. `xox-qa-e2e` → preview URL'e karşı koş → `blocker` varsa merge'i durdur, görevi geri aç
10. `board` + `journal` + `state.md` commit + `git tag good/wave-<n>`
11. Durum panosu Artifact'ini yeniden yayınla
12. Her 3 dalgada `xox-memory-curator`

## DEVRE KESİCİLER — anında Ömer'e bildir, bekleme

- 3 ardışık dalga başarısız
- Token bütçesi %80
- `main` iki dalgadır kırık
- `docs/board/danger.log`'a yeni satır düştü
- Dalga 0 kanıtlanamadı

## BÜTÇE KADEMELERİ

%60 → `--max-parallel`'i düşür · %80 → opus agentları sonnet'e indir ·
%95 → temiz checkpoint, kısmi rapor, dur

## BİTİŞ

Deadline · board boş · veya devre kesici:

1. `docs/board/.night-run-active` dosyasını sil
2. `xox-reporter`'ı dispatch et
3. Orphan worktree'leri temizle: `git worktree prune`
4. `caffeinate` sürecini sonlandır

`Stop` hook'u koşu aktifken duruşu bloklar — döngüden erken çıkmaya çalışma.
