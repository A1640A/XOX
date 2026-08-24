#!/usr/bin/env bash
# Yıkıcı bir komuttan ÖNCE kurtarma noktası bırakır. Komutu ENGELLEMEZ.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
input=$(cat)

cmd=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));console.log(i.tool_input?.command??"")' <<<"$input")

if grep -qE '(rm +-[a-z]*[rf]|dropDatabase|git +reset +--hard|git +clean +-[a-z]*f|git +push +.*--force|git +branch +-D|gh +repo +delete)' <<<"$cmd"; then
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  git tag -f "rescue/$ts" >/dev/null 2>&1 || true
  git stash create >/dev/null 2>&1 || true
  mkdir -p docs/board
  printf '%s\t%s\n' "$ts" "$cmd" >> docs/board/danger.log
  echo "⚠️  Yıkıcı komut tespit edildi. Kurtarma noktası: rescue/$ts (danger.log'a yazıldı)." >&2
fi

exit 0
