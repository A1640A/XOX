#!/usr/bin/env bash
# Gece koşusu aktif ve iş varsa duruşu BLOKLAR. Üç koruma: deadline, dalga tavanı,
# ardışık başarısızlık. Bunlardan biri tetiklenirse durmaya izin verir.
#
# SIRA KRİTİKTİR: deadline YALNIZCA küçük ve bir kez yazılan bayrak dosyasından okunur ve
# board.json okunmadan ÖNCE değerlendirilir. Böylece bozuk/yarım yazılmış bir board
# "durdurulamaz oturum" üretemez — süre dolduğunda bayrak silinir ve duruşa izin verilir.
# Board bozuksa (deadline henüz dolmamışken) duruş BLOKLANIR ve onarım istenir; sessizce
# geceyi bitirmek yerine lead board dosyasını tamir eder.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

FLAG="docs/board/.night-run-active"
[[ -f $FLAG ]] || exit 0

node -e '
const fs = require("node:fs");
const FLAG = "docs/board/.night-run-active";
const BOARD = "docs/board/board.json";

const decide = () => {
  const stop = (reason) => {
    try { fs.rmSync(FLAG, { force: true }); } catch {}
    return { systemMessage: `Gece koşusu sonlandı: ${reason}. xox-reporter ile sabah raporunu üret.` };
  };
  const block = (reason) => ({ decision: "block", reason });

  // 1) Bayrak. Okunamıyorsa deadline doğrulanamaz -> tek güvenli yön: durmaya izin ver.
  let flag;
  try {
    flag = JSON.parse(fs.readFileSync(FLAG, "utf8"));
  } catch {
    return stop("gece bayrağı okunamadı, deadline doğrulanamıyor");
  }

  // 2) Deadline — board OKUNMADAN önce. Eksik/geçersiz deadline DOLMUŞ sayılır.
  const raw = flag?.deadline;
  const deadline = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""));
  if (!Number.isFinite(deadline) || Date.now() > deadline) return stop("deadline doldu");

  // 3) Board hiç yoksa eski davranış: sessizce durmaya izin ver.
  if (!fs.existsSync(BOARD)) return null;

  // 4) Board var ama okunamıyor/bozuk -> duruşu BLOKLA, onarım iste.
  let b;
  try {
    b = JSON.parse(fs.readFileSync(BOARD, "utf8"));
    if (!Array.isArray(b.tasks)) throw new Error("tasks dizisi yok");
  } catch (e) {
    return block(
      `docs/board/board.json OKUNAMIYOR (${e.message}). Yarım yazılmış veya bozuk. ` +
        `Gece koşusu bu yüzden sonlandırılmadı — önce board dosyasını ONAR: ` +
        `1) son geçerli sürümü geri al: git show HEAD:docs/board/board.json > docs/board/board.json ` +
        `2) o commit sonrasındaki olayları docs/board/journal.ndjson içinden tekrar uygula ` +
        `3) JSON.parse ile geçerliliğini ve tasks dizisini doğrula ` +
        `4) board dosyasını commit et, sonra dalga döngüsüne devam et. ` +
        `Deadline ${flag.deadline} geçtiğinde bu blok kendiliğinden kalkar.`,
    );
  }

  const nr = b.nightRun ?? {};
  if ((nr.wave ?? 0) >= (flag.maxWaves ?? 40)) return stop("dalga tavanına ulaşıldı");
  if ((nr.consecutiveFailures ?? 0) >= 3) return stop("üç ardışık dalga başarısız");
  if ((nr.tokenBudgetUsedPct ?? 0) >= 95) return stop("token bütçesi %95");

  const isDone = (id) => b.tasks.find((x) => x.id === id)?.status === "done";
  const actionable = b.tasks.filter(
    (t) => ["todo", "in_wave", "review"].includes(t.status) && (t.deps ?? []).every(isDone),
  );

  if (actionable.length === 0) return stop("işlenebilir görev kalmadı");

  return block(
    `Gece koşusu aktif (dalga ${nr.wave ?? 0}, deadline ${flag.deadline}). ` +
      `${actionable.length} işlenebilir görev var: ${actionable.slice(0, 4).map((t) => t.id).join(", ")}. ` +
      `CLAUDE.md dalga döngüsüne dön: board oku → çakışmayan görevleri seç → paralel dispatch → ` +
      `review → merge → deploy → e2e → board commit.`,
  );
};

// process.exit KULLANILMAZ: macOS boru hatlarında stdout eşzamansızdır ve exit yazımı keser.
// Doğal çıkışta Node stdout kuyruğunu boşaltır — JSON protokolü bozulmaz.
let out = null;
try {
  out = decide();
} catch (e) {
  console.error("night-continue: beklenmeyen hata, duruşa izin veriliyor — " + (e?.message ?? e));
  out = null;
}
if (out) console.log(JSON.stringify(out));
' || true

exit 0
