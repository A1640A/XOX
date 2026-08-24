#!/usr/bin/env bash
# Yıkıcı bir komuttan ÖNCE kurtarma noktası bırakır. Komutu ENGELLEMEZ.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
input=$(cat)

cmd=$(node -e '
let out = "";
try {
  const i = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  out = i.tool_input?.command ?? "";
} catch {
  out = "";
}
console.log(out);
' <<<"$input" || true)

if grep -qE '(rm +-[a-z]*[rf]|dropDatabase|git +reset +--hard|git +clean +-[a-z]*f|git +push +.*--force|git +branch +-D|gh +repo +delete)' <<<"$cmd"; then
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  # Saniye çözünürlüğü aynı saniyedeki iki yıkıcı komutu tek tag'e çökertirdi.
  # PID ayrıştırır, sayaç ise teorik PID çakışmasına karşı garantiler. `-f` YOK:
  # var olan bir kurtarma noktasının üzerine asla yazılmaz.
  tag="rescue/$ts-$$"
  n=0
  while git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; do
    n=$((n + 1))
    tag="rescue/$ts-$$-$n"
  done
  git tag "$tag" >/dev/null 2>&1 || true
  git stash create >/dev/null 2>&1 || true
  mkdir -p docs/board
  printf '%s\t%s\t%s\n' "$ts" "$tag" "$cmd" >> docs/board/danger.log
  echo "⚠️  Yıkıcı komut tespit edildi. Kurtarma noktası: $tag (danger.log'a yazıldı)." >&2
fi

exit 0
