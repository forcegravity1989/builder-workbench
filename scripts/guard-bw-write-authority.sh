#!/usr/bin/env bash
# 只有允许的模块能往被管项目的 `.bw/` 里写文件。
#
# 两遍:第一遍认内核那几个写入口,第二遍认裸文件写(`std::fs::write` 这种,
# 一行也不经过写入口)。
#
# 只查写、不查读(远端拿名片路径去 gh api 取文件是合法的)。查不住这些,别把
# 它的绿当成比它能力更大的承诺:
# - 「写完要不要跟着更新别的账」是数据流约束,按模块归属判断对它天生是绿的;
# - agent 按剧本写 `.bw/` 不经过 Rust,静态检查看不见;
# - 第二遍是窗口启发式(命中行前 15 后 3 行里提到 `.bw` 才算),路径在更远处
#   拼好再传进来的写会漏;`.bw` 要求后面跟 `/` `\` `"` 反引号或行尾,免得
#   `.bw-assets` / `.bw-worktrees` 这些别的东西混进来;
# - 删除类原语(`remove_file` / `remove_dir_all`)不在覆盖内 —— 仓里这类几乎
#   全是临时目录清理,收进来只会把真信号淹掉。
set -euo pipefail
cd "$(dirname "$0")/.."

# 仓文件的写入口。**名字写错过两次**,所以单独列出来并在跑之前逐个核对它们
# 真的存在 —— 守卫拿不存在的名字去 grep,只会一直打勾。
WRITE_FNS=(
  "project_file::write"
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
  "crates/bw/src/app/bootstrap.rs" # 项目约定那张活:往常驻树写名片
  "crates/bw/src/app/project.rs"   # 接入与改项目信息:写名片
  "crates/bw/src/app/plan.rs"      # 把主检出的读数吸进流水
  "crates/bw/src/app/collect.rs"   # 采集把读数写进流水
)

# 第二遍要找的裸写原语。仓里这个写法是活的 —— `bootstrap.rs` 写 `.bw/.gitignore`、
# `collect.rs` 播种读数流水,都是裸写,第一遍一个都看不见。照抄一行进壳或引擎,
# 第一遍照样打勾。
BARE_WRITE='(fs::write|fs::copy|File::create|OpenOptions::new)[[:space:]]*\('

# 文件内的 `#[cfg(test)]` 段跳过:那里写的是临时目录里的假仓,不是被管项目。
# 按括号配对只跳那一段 —— 「从第一个 cfg(test) 跳到文件尾」会连它后面的真代码
# 一起吞掉(`orca.rs` 的测试模块后面就还有代码,自测时正是这么漏的)。
scan_bare_writes() {
  local f
  for f in $(grep -rlE "$BARE_WRITE" crates --include='*.rs' || true); do
    case "$f" in */tests/*|*/examples/*) continue ;; esac
    awk -v F="$f" '
      { L[NR] = $0 }
      END {
        for (i = 1; i <= NR; i++) {
          if (L[i] !~ /#\[cfg\(test\)\]/) continue
          depth = 0; opened = 0
          for (j = i; j <= NR; j++) {
            skip[j] = 1
            t = L[j]; o = gsub(/\{/, "&", t)
            t = L[j]; c = gsub(/\}/, "&", t)
            depth += o - c
            if (o > 0) opened = 1
            if (opened && depth <= 0) break
          }
          i = j
        }
        for (i = 1; i <= NR; i++) {
          if (skip[i]) continue
          if (L[i] !~ /(fs::write|fs::copy|File::create|OpenOptions::new)[ \t]*\(/) continue
          lo = (i - 15 > 1 ? i - 15 : 1); hi = (i + 3 < NR ? i + 3 : NR)
          for (j = lo; j <= hi; j++)
            if (L[j] ~ /\.bw([\/\\"`]|$)/) { printf "%s:%d:%s\n", F, i, L[i]; break }
        }
      }' "$f"
  done
}

fail=0
while IFS= read -r hit; do
  file="${hit%%:*}"
  case "$file" in */tests/*|*/examples/*) continue ;; esac   # 临时目录里的仓,不是真被管项目
  ok=0
  for a in "${ALLOW[@]}"; do case "$file" in "$a"*) ok=1; break ;; esac; done
  [ "$ok" -eq 0 ] && { echo "✗ $hit"; fail=1; }
done < <({ grep -rnE "$WRITERS" crates --include="*.rs" || true; scan_bare_writes; })

if [ "$fail" -ne 0 ]; then
  echo
  echo "上面这些地方在往被管项目的 .bw/ 里写文件,而它们不在允许名单上。"
  echo "要么把写入挪进内核里已经负责这件事的模块,要么——如果确实是一处该有的"
  echo "新写入点——把它加进本脚本的 ALLOW,让这个决定出现在 diff 里被人看见。"
  echo "app-shell 与 bw-engine 一处都不该有:壳只发命令,引擎不碰被管项目的仓文件。"
  exit 1
fi
echo "✓ .bw/ 的写入都来自允许的模块(app-shell 与 bw-engine 零写入)。"
