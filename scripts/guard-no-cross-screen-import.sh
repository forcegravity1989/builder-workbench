#!/usr/bin/env bash
# 一屏一模块:screens/<name>/ 不许 `use crate::screens::<别的名字>::...`。
# 共享数据一律走 ui crate 的 ViewModel,或者经命令/事件绕一圈。
#
# 覆盖范围:这条只兜最常见的 `crate::screens::<别的>::` 绝对路径。同屏内的
# `use super::xxx` 是合法的(屏内子模块互引,不跨屏);真正的跨屏 `super::`
# 相对路径在合法 Rust 里极少见(屏不会嵌套),暂不在文本守卫里查——靠评审
# 兜底,不强求 grep 全覆盖。
#
# 为什么要这条:V3 的 op.rs 长到 2524 行,就是因为几屏的东西互相 reach into
# 之后没人敢拆。新壳从第一天起守规矩,比长大之后再拆便宜。
set -euo pipefail
cd "$(dirname "$0")/.."
SCREENS_DIR="crates/app-shell/src/screens"

if [ ! -d "$SCREENS_DIR" ]; then
  echo "跳过:$SCREENS_DIR 还不存在"
  exit 0
fi

fail=0
for dir in "$SCREENS_DIR"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  hits=$(grep -rn "crate::screens::" "$dir" | grep -v "crate::screens::${name}::" || true)
  if [ -n "$hits" ]; then
    echo "✗ screens/$name 跨屏引用了别的屏幕模块:"
    echo "$hits" | sed 's/^/    /'
    fail=1
  else
    echo "✓ screens/$name 无跨屏引用"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "共享数据请经 ui crate 的 ViewModel,或者经命令/事件绕一圈。"
  exit 1
fi
echo "所有屏幕模块只经命令/事件与共享 ViewModel 通信。"
