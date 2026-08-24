#!/usr/bin/env bash
# Context sıkışmadan hemen önce çalışır. Kaybolacak çalışma belleğini state.md'ye sabitler.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

[[ -f docs/board/board.json ]] || exit 0

node -e '
const fs = require("node:fs");
const b = require("./docs/board/board.json");
const count = (s) => b.tasks.filter((t) => t.status === s).length;
const rows = b.tasks
  .filter((t) => t.status !== "done")
  .map((t) => `| ${t.id} | ${t.tier} | ${t.title} | ${t.status} | ${t.agent} | ${t.blockedReason ?? ""} |`)
  .join("\n");
fs.writeFileSync("docs/memory/state.md", `# Anlık durum

Otomatik üretilir — elle düzenleme, \`/xox-status\` çalıştır.

**Son güncelleme:** ${new Date().toISOString()}
**Gece koşusu:** ${b.nightRun.active ? "AKTİF, dalga " + b.nightRun.wave : "kapalı"}
**Sayım:** ${count("done")} bitti · ${count("todo")} bekliyor · ${count("in_wave")} dalgada · ${count("blocked")} bloklu

| id | katman | başlık | durum | agent | blok sebebi |
|---|---|---|---|---|---|
${rows || "| — | | tüm görevler bitti | | | |"}
`);
'

echo "state.md güncellendi. Sıkıştırmadan sonra docs/board/board.json ve docs/memory/state.md dosyalarını oku." >&2
exit 0
