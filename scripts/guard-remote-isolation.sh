#!/usr/bin/env bash
# 远端两条线必须互不相识:GitHub 那一臂里不许出现 codehub,codehub 那一臂里不许
# 出现 github/gh。共用的东西(PrOpened、名片路径、issue DTO)住在基类
# `remote/mod.rs`;跟平台无关的东西(分支名、git 远端地址)住在 `workspace.rs`。
#
# 「外面不许绕过基类直接调某一臂」那条**由编译器守着**(两臂是 `remote` 的私有
# 子模块,`bw_engine::github::…` 这条路径根本不存在),这里不重复查。这条脚本只
# 守编译器管不到的那半:两臂之间在**同一个父模块内**是互相可见的,只有靠约定。
set -euo pipefail
cd "$(dirname "$0")/.."

GH_ARM=crates/bw-engine/src/remote/github.rs
CH_ARM=crates/bw-engine/src/remote/codehub.rs

# 只查真代码:行注释(`//` / `///` / `//!`)里提一句对方是允许的 —— 解释「为什么
# 这里跟对面不一样」正是该写的注释,把它也禁掉只会让人删注释而不是删耦合。
strip_comments() { grep -vE '^[[:space:]]*//' "$1"; }

fail=0
check() { # <文件> <禁词正则> <人话>
  local file="$1" pattern="$2" what="$3" hits
  hits=$(strip_comments "$file" | grep -nEi "$pattern" || true)
  if [ -n "$hits" ]; then
    echo "✗ $file 里出现了$what:"
    echo "$hits" | sed 's/^/    /'
    fail=1
  else
    echo "✓ $file 不认识$what"
  fi
}

check "$GH_ARM" 'codehub' 'codehub'
# `gh` 单独成词才算(`through`、`right` 这种词里的 gh 不算);GitLab 是 codehub
# 的底子,出现在这一臂里同样说明抄错了地方。
check "$CH_ARM" '\bgithub\b|\bgh\b|\bGitLab::|crate::remote::github' 'github/gh'

if [ "$fail" -ne 0 ]; then
  echo
  echo "两臂必须互不相识。共用的类型放基类 crates/bw-engine/src/remote/mod.rs;"
  echo "跟平台无关的(分支名、git 地址)放 crates/bw-engine/src/workspace.rs。"
  exit 1
fi
echo "远端两臂互不相识。"
