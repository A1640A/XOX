#!/usr/bin/env bash
# Context sıkışmadan hemen önce çalışır. Kaybolacak çalışma belleğini state.md'ye sabitler.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

[[ -f docs/board/board.json ]] || exit 0

# Üretilen markdown Prettier'a UYGUN olmak ZORUNDA: lefthook pre-commit staged dosyalarda
# `prettier --check` çalıştırır ve dalga döngüsü state.md'yi her dalgada commit'ler.
# İki katman: (1) tablo hizası elle hesaplanır, (2) Prettier varsa AYNI süreç içinde
# (alt süreç yok, pnpm çözümlemesi yok) son biçim verilir. Prettier yoksa/yavaşsa
# 10 sn sonra vazgeçilir ve (1) yazılır — hook asla asılmaz, her koşulda 0 döner.
node -e '
const fs = require("node:fs");
const OUT = "docs/memory/state.md";

const build = (b) => {
  const tasks = Array.isArray(b.tasks) ? b.tasks : [];
  const nr = b.nightRun ?? {};
  const count = (s) => tasks.filter((t) => t.status === s).length;

  // Hücre metni: satır sonu ve boru işareti tabloyu bozar.
  const cell = (v) => String(v ?? "").replace(/\s*\r?\n\s*/g, " ").replace(/\|/g, "\\|").trim();
  const w = (s) => [...s].length;

  const head = ["id", "katman", "başlık", "durum", "agent", "blok sebebi"].map(cell);
  const body = tasks
    .filter((t) => t.status !== "done")
    .map((t) => [t.id, t.tier, t.title, t.status, t.agent, t.blockedReason].map(cell));
  const rows = body.length ? body : [["—", "", "tüm görevler bitti", "", "", ""]];
  const cols = head.map((h, i) => Math.max(3, w(h), ...rows.map((r) => w(r[i] ?? ""))));
  const line = (cs) => "| " + cs.map((c, i) => c + " ".repeat(cols[i] - w(c))).join(" | ") + " |";
  const table = [line(head), line(cols.map((n) => "-".repeat(n))), ...rows.map(line)].join("\n");

  return `# Anlık durum

Otomatik üretilir — elle düzenleme, \`/xox-status\` çalıştır.

**Son güncelleme:** ${new Date().toISOString()}
**Gece koşusu:** ${nr.active ? "AKTİF, dalga " + (nr.wave ?? 0) : "kapalı"}
**Sayım:** ${count("done")} bitti · ${count("todo")} bekliyor · ${count("in_wave")} dalgada · ${count("blocked")} bloklu

${table}
`;
};

const polish = async (text) => {
  try {
    const prettier = require("prettier");
    const cfg = (await prettier.resolveConfig(OUT)) ?? {};
    const done = await Promise.race([
      prettier.format(text, { ...cfg, filepath: OUT }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("prettier timeout")), 10000).unref()),
    ]);
    return typeof done === "string" && done.length > 0 ? done : text;
  } catch {
    return text;
  }
};

const main = async () => {
  let text;
  try {
    text = build(JSON.parse(fs.readFileSync("docs/board/board.json", "utf8")));
  } catch (e) {
    console.error("pre-compact: board.json okunamadı, state.md guncellenmedi — " + e.message);
    return;
  }
  fs.writeFileSync(OUT, await polish(text));
};

main().catch((e) => {
  console.error("pre-compact: state.md yazilamadi — " + e.message);
});
' || true

echo "state.md güncellendi. Sıkıştırmadan sonra docs/board/board.json ve docs/memory/state.md dosyalarını oku." >&2
exit 0
