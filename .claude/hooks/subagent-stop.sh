#!/usr/bin/env bash
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
mkdir -p docs/board docs/board/reports

printf '{"ts":"%s","event":"subagent.stop"}\n' "$(date -u +%FT%TZ)" >> docs/board/journal.ndjson

# Son 10 dakikada rapor yazılmamışsa lead'i uyar (engellemez).
recent=$(find docs/board/reports -name '*.md' -newermt '-10 minutes' 2>/dev/null | wc -l | tr -d ' ')
if [[ $recent == 0 ]]; then
  echo "Uyarı: son 10 dakikada docs/board/reports altına rapor yazılmadı. Subagent raporunu sen kaydet ve board.json'ı güncelle." >&2
fi
exit 0
