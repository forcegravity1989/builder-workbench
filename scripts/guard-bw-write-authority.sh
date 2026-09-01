#!/usr/bin/env bash
# 只有允许的模块能往被管项目的 .bw/config/ 与 .bw/state/ 里写文件。
#
# 只查写、不查读(远端拿名片路径去 gh api 取文件是合法的)。查不住两件事:
# 「写完 config 要跟着更新指纹」是数据流约束,按模块归属判断对它天生是绿的
# (由端到端验收兜);agent 按剧本写 config/ 不经过 Rust,静态检查看不见。
set -euo pipefail
cd "$(dirname "$0")/.."

# 仓文件的写入口。`write_file` 是底层那个,其余是各解析器自己的。
#
# 按**词边界**匹配,不按行首锚定:`write_file(` 前面可以是任意限定前缀
# (`crate::repo::` / `bw::repo::` / 裸导入),也可以出现在赋值右边。原来那版
# 用 `^\s*write_file\(` 行首锚 + 写死 `crate::repo::` 前缀,壳里一句
# `let _ = bw::repo::write_file(...)` 两条都不匹配 —— 守卫会报绿。用
# POSIX 字符类而不是 `\s`,BSD/macOS 的 grep 也认(本仓门禁以本机为准)。
WRITERS='(issue_policy_file|project_file|managed_file|metrics_file)::write[[:space:]]*\(|append_metric_reading[[:space:]]*\(|(^|[^A-Za-z0-9_])write_file[[:space:]]*\('

# 允许写的模块。加一处新的写入点 = 明着改这份名单,让它出现在 diff 里。
ALLOW=(
  "crates/bw/src/repo/"                 # 写入口自己的定义处
  "crates/bw/src/standard/bootstrap.rs" # 规范铺底:唯一往新项目落件的地方
  "crates/bw/src/app/bootstrap.rs"      # 铺底那张活:名片也进同一个 MR
  "crates/bw/src/app/project.rs"        # 接入与名片编辑
  "crates/bw/src/app/plan.rs"           # 切在研版本
  "crates/bw/src/app/tools.rs"          # 配置屏保存映射(+ 同步指纹)
  "crates/bw/src/app/collect.rs"        # 采集追加读数流水
)

fail=0
while IFS= read -r hit; do
  file="${hit%%:*}"
  # 测试与示例豁免:它们造的是临时目录里的仓,不是真被管项目。
  case "$file" in
    */tests/*|*/examples/*) continue ;;
  esac
  ok=0
  for a in "${ALLOW[@]}"; do
    case "$file" in "$a"*) ok=1; break ;; esac
  done
  if [ "$ok" -eq 0 ]; then
    echo "✗ $hit"
    fail=1
  fi
done < <(grep -rnE "$WRITERS" crates --include="*.rs" || true)

if [ "$fail" -ne 0 ]; then
  echo
  echo "上面这些地方在往被管项目的 .bw/ 里写文件,而它们不在允许名单上。"
  echo "要么把写入挪进内核里已经负责这件事的模块,要么——如果确实是一处该有的"
  echo "新写入点——把它加进本脚本的 ALLOW,让这个决定出现在 diff 里被人看见。"
  echo "app-shell 与 bw-engine 一处都不该有:壳只发命令,引擎不碰被管项目的仓文件。"
  exit 1
fi
echo "✓ .bw/ 的写入都来自允许的模块(app-shell 与 bw-engine 零写入)。"
