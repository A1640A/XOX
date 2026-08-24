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
  # `git tag` yalnız HEAD'i sabitler; commit'lenmemiş çalışma ağacı tag'de yok.
  # `git stash create` onu bir dangling commit'e yazar ama SHA'yı SADECE stdout'a basar —
  # atarsak nesne kimsenin bulamayacağı bir yerde kalır. SHA'yı yakala ve log'a yaz.
  stash=$(git stash create 2>/dev/null || true)
  [ -n "$stash" ] || stash='stash-yok'
  mkdir -p docs/board
  printf '%s\t%s\t%s\t%s\n' "$ts" "$tag" "$stash" "$cmd" >> docs/board/danger.log
  echo "⚠️  Yıkıcı komut tespit edildi. Kurtarma noktası: $tag · stash: $stash (danger.log'a yazıldı)." >&2
fi

exit 0
