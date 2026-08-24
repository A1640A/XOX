#!/usr/bin/env bash
# Playwright'ın ana uygulama paketlerine sızmasını engeller.
set -euo pipefail
input=$(cat)

# Claude Code, Write/Edit araçlarına MUTLAK yol verir (tool_input.file_path).
# Karşılaştırma göreli önekler üzerinden yapıldığı için yolu önce köke göre indirger:
# proje kökünü sök, `..` parçalarını çöz, var olan en derin atanın sembolik bağını gerçekle.
# Kök dışındaki yollar `../...` olur ve hiçbir desene uymaz — istenen davranış.
path=$(XOX_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}" node -e '
const fs = require("node:fs");
const p = require("node:path");
const real = (d) => { try { return fs.realpathSync(d); } catch { return d; } };
let out = "";
try {
  const i = JSON.parse(fs.readFileSync(0, "utf8"));
  const raw = i.tool_input?.file_path ?? "";
  if (raw) {
    const root = real(p.resolve(process.env.XOX_ROOT ?? "."));
    let head = p.resolve(root, raw);
    let tail = "";
    while (!fs.existsSync(head)) {
      const up = p.dirname(head);
      if (up === head) break;
      tail = tail ? p.join(p.basename(head), tail) : p.basename(head);
      head = up;
    }
    out = p.relative(root, p.join(real(head), tail));
  }
} catch {
  out = "";
}
console.log(out);
' <<<"$input" || true)

content=$(node -e '
let out = "";
try {
  const i = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  const t = i.tool_input ?? {};
  out = [t.content, t.new_string, t.command].filter(Boolean).join("\n");
} catch {
  out = "";
}
console.log(out);
' <<<"$input" || true)

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
