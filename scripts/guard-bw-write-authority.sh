#!/usr/bin/env bash
# 只有允许的模块能往被管项目的 `.bw/` 里写文件。
#
# 只查写、不查读(远端拿名片路径去 gh api 取文件是合法的)。查不住两件事:
# 「写完要不要跟着更新别的账」是数据流约束,按模块归属判断对它天生是绿的;
# agent 按剧本写 `.bw/` 不经过 Rust,静态检查看不见。
set -euo pipefail
cd "$(dirname "$0")/.."

# 仓文件的写入口。**名字写错过两次**,所以单独列出来并在跑之前逐个核对它们
# 真的存在 —— 守卫拿不存在的名字去 grep,只会一直打勾。
WRITE_FNS=(
  "project_file::write"
  "issue_policy_file::write"
  "managed_file::write"
  "standard_file::write"
  "readings_file::upsert_metric_reading"
  "readings_file::absorb_main_readings"
)

# 自检:名单里的每个函数必须在**它自己那个模块文件**里真实存在。按模块定位,
# 不拿裸名满 crates/ 找 —— 那样 `metrics_file::write` 这种不存在的条目会被别的
# 模块里的同名函数匹上,守卫与它的自检同时失效。
for fn in "${WRITE_FNS[@]}"; do
  module="${fn%%::*}"; name="${fn##*::}"; src="crates/bw/src/repo/${module}.rs"
  if [ ! -f "$src" ] || ! grep -qE "fn[[:space:]]+${name}[[:space:]]*[(<]" "$src"; then
    echo "✗ 守卫自检失败:${fn} 在 ${src} 里找不到定义。"
    echo "  函数改名或搬家了就跟着改这份名单 —— 否则守卫会一直报绿,却什么都没守住。"
    exit 1
  fi
done

# 按**词边界**匹配,不按行首锚定:`write_file(` 前面可以是任意限定前缀
# (`crate::repo::` / `bw::repo::` / 裸导入),也可以出现在赋值右边。用 POSIX
# 字符类而不是 `\s`,BSD/macOS 的 grep 也认(本仓门禁以本机为准)。
WRITERS="$(printf '%s[[:space:]]*\\(|' "${WRITE_FNS[@]}")(^|[^A-Za-z0-9_])write_file[[:space:]]*\\("

# 允许写的模块。加一处新的写入点 = 明着改这份名单,让它出现在 diff 里。
ALLOW=(
  "crates/bw/src/repo/"            # 写入口自己的定义处
  "crates/bw/src/standard/"        # 规范铺底:唯一往项目落件的地方
  "crates/bw/src/app/bootstrap.rs" # 铺底那张活
  "crates/bw/src/app/project.rs"   # 接入与项目信息
  "crates/bw/src/app/plan.rs"      # 切在研版本
  "crates/bw/src/app/tools.rs"     # 配置屏保存类别→工具映射
  "crates/bw/src/app/collect.rs"   # 采集追加读数流水
)

fail=0
while IFS= read -r hit; do
  file="${hit%%:*}"
  case "$file" in */tests/*|*/examples/*) continue ;; esac   # 临时目录里的仓,不是真被管项目
  ok=0
  for a in "${ALLOW[@]}"; do case "$file" in "$a"*) ok=1; break ;; esac; done
  [ "$ok" -eq 0 ] && { echo "✗ $hit"; fail=1; }
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
