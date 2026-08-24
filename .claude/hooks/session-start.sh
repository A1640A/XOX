#!/usr/bin/env bash
# Oturum açılışında / resume'da / COMPACT SONRASINDA board özetini context'e enjekte eder.
# Bu, uzun gece koşusunda context kaybına karşı birinci savunmadır.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

BOARD="docs/board/board.json"
[[ -f $BOARD ]] || exit 0

summary=$(node -e '
const b = require("./docs/board/board.json");
const by = (s) => b.tasks.filter((t) => t.status === s);
const line = (t) => `  ${t.id} [${t.tier}] ${t.title} → ${t.agent}`;
const out = [];
out.push(`GECE KOŞUSU: ${b.nightRun.active ? "AKTİF, dalga " + b.nightRun.wave : "kapalı"}`);
out.push(`Görevler: ${by("done").length} bitti · ${by("todo").length} bekliyor · ${by("blocked").length} bloklu · ${by("failed").length} başarısız`);
const blocked = by("blocked");
if (blocked.length) { out.push("BLOKLU:"); blocked.forEach((t) => out.push(line(t) + ` — ${t.blockedReason ?? "sebep yok"}`)); }
const ready = b.tasks.filter((t) => t.status === "todo" && t.deps.every((d) => b.tasks.find((x) => x.id === d)?.status === "done"));
if (ready.length) { out.push("HAZIR (bağımlılığı çözülmüş):"); ready.slice(0, 8).forEach((t) => out.push(line(t))); }
console.log(out.join("\n"));
' 2>/dev/null || echo "board.json okunamadı")

recent=$(tail -n 5 docs/board/journal.ndjson 2>/dev/null || true)

cat <<JSON
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$(node -e '
const s = process.argv[1], r = process.argv[2];
console.log(JSON.stringify(
  "## XOX board durumu (otomatik enjekte)\n" + s +
  "\n\nSon 5 olay:\n" + (r || "(yok)") +
  "\n\nHafıza dosyaları: docs/memory/{state,gotchas,decisions,conventions,api-contract}.md" +
  "\nBir yaklaşımı denemeden ÖNCE gotchas.md oku."
));' "$summary" "$recent")}}
JSON
