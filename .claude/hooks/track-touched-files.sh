#!/usr/bin/env bash
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
input=$(cat)

path=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));console.log(i.tool_input?.file_path??"")' <<<"$input")
[[ -n $path ]] || exit 0

mkdir -p docs/board
printf '{"ts":"%s","event":"file.touched","path":"%s"}\n' "$(date -u +%FT%TZ)" "${path#"$PWD/"}" \
  >> docs/board/journal.ndjson
exit 0
