#!/usr/bin/env bash
# Gece koşusu aktif ve iş varsa duruşu BLOKLAR. Üç koruma: deadline, dalga tavanı,
# ardışık başarısızlık. Bunlardan biri tetiklenirse durmaya izin verir.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

FLAG="docs/board/.night-run-active"
[[ -f $FLAG ]] || exit 0
[[ -f docs/board/board.json ]] || exit 0

node -e '
const fs = require("node:fs");
const flag = JSON.parse(fs.readFileSync("docs/board/.night-run-active", "utf8"));
const b = JSON.parse(fs.readFileSync("docs/board/board.json", "utf8"));

const stopNow = (reason) => {
  fs.rmSync("docs/board/.night-run-active", { force: true });
  console.log(JSON.stringify({ systemMessage: `Gece koşusu sonlandı: ${reason}. xox-reporter ile sabah raporunu üret.` }));
  process.exit(0);
};

if (Date.now() > Date.parse(flag.deadline)) stopNow("deadline doldu");
if (b.nightRun.wave >= (flag.maxWaves ?? 40)) stopNow("dalga tavanına ulaşıldı");
if (b.nightRun.consecutiveFailures >= 3) stopNow("üç ardışık dalga başarısız");
if ((b.nightRun.tokenBudgetUsedPct ?? 0) >= 95) stopNow("token bütçesi %95");

const actionable = b.tasks.filter(
  (t) => ["todo", "in_wave", "review"].includes(t.status) &&
         t.deps.every((d) => b.tasks.find((x) => x.id === d)?.status === "done"),
);

if (actionable.length === 0) stopNow("işlenebilir görev kalmadı");

console.log(JSON.stringify({
  decision: "block",
  reason: `Gece koşusu aktif (dalga ${b.nightRun.wave}, deadline ${flag.deadline}). ` +
    `${actionable.length} işlenebilir görev var: ${actionable.slice(0, 4).map((t) => t.id).join(", ")}. ` +
    `CLAUDE.md dalga döngüsüne dön: board oku → çakışmayan görevleri seç → paralel dispatch → ` +
    `review → merge → deploy → e2e → board commit.`,
}));
'
