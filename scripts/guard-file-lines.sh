#!/usr/bin/env bash
# 单文件超限直接拒绝 —— 不再走回 op.rs 2524 行的老路。
#
# 只查 Workbench MVP 三 crate(app-shell / bw / bw-engine)。
# 上限简单粗暴(不排除注释、不排除测试),比「聪明的排除规则」更不容易被绕过。
set -euo pipefail
cd "$(dirname "$0")/.."
LIMIT=${LIMIT:-2000}
SOFT=${SOFT:-600}

roots=()
[ -d crates/app-shell/src ] && roots+=(crates/app-shell/src)
[ -d crates/bw/src ] && roots+=(crates/bw/src)
[ -d crates/bw-engine/src ] && roots+=(crates/bw-engine/src)
if [ ${#roots[@]} -eq 0 ]; then
  echo "跳过:app-shell / bw / bw-engine 都还不存在"
  exit 0
fi

fail=0
soft_hits=0
while IFS= read -r -d '' f; do
  n=$(wc -l < "$f" | tr -d ' ')
  if [ "$n" -gt "$LIMIT" ]; then
    echo "✗ $f 有 $n 行,超过上限 $LIMIT 行"
    fail=1
  elif [ "$n" -gt "$SOFT" ]; then
    echo "· $f 有 $n 行,超过软目标 $SOFT 行(不阻断,提醒该拆了)"
    soft_hits=$((soft_hits + 1))
  fi
done < <(find "${roots[@]}" -name '*.rs' -print0)

[ "$fail" -eq 0 ] || exit 1
echo "没有文件超过上限 $LIMIT 行(超过软目标 $SOFT 行的:$soft_hits 个)。"
