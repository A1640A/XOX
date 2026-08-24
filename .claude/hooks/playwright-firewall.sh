#!/usr/bin/env bash
# Playwright'ın ana uygulama paketlerine sızmasını engeller.
set -euo pipefail
input=$(cat)

path=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));const t=i.tool_input??{};console.log(t.file_path??"")' <<<"$input")
content=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));const t=i.tool_input??{};console.log([t.content,t.new_string,t.command].filter(Boolean).join("\n"))' <<<"$input")

deny() {
  cat <<JSON
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"$1"}}
JSON
  exit 0
}

# Ana uygulama yollarında playwright içeriği
if [[ $path == apps/web/* || $path == apps/mobile/* || $path == packages/* ]] \
   && grep -qiE '(@playwright/test|from .playwright|require\(.playwright)' <<<"$content"; then
  deny "Playwright YALNIZCA apps/e2e içinde kullanılır. Bu görevi xox-qa-e2e agentına devret."
fi

# Ana uygulamalara playwright kurulumu
if grep -qE 'pnpm (add|install|i)[^|;]*(--filter[= ]@xox/(web|mobile)|--filter[= ]@xox/(game-core|shared|db|ui-tokens))[^|;]*playwright' <<<"$content" \
   || grep -qE 'pnpm (add|install|i) +-w[^|;]*playwright' <<<"$content"; then
  deny "Playwright ana projeye VEYA workspace köküne kurulamaz. Yalnızca: pnpm add -D --filter @xox/e2e"
fi

exit 0
