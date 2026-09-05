#!/usr/bin/env bash
# `.codegraph/codegraph.db` 不进 feature commit —— CI 是唯一发布者(见
# `.github/workflows/codegraph.yml`,只在 main 上跑 publish)。
#
# 本地 dev 改过的 db 一旦 `git add` 进 feature 提交,合入时就绕过了「CI 唯一
# 发布者」。这条守卫在本地门禁里挡:codegraph.db 出现在暂存区就报错退出。
# 想让本地改动不进暂存,也可以 `git update-index --skip-worktree
# .codegraph/codegraph.db`(本机一次性,不随仓走)。
set -euo pipefail
cd "$(dirname "$0")/.."

DB=".codegraph/codegraph.db"

if [ ! -f "$DB" ]; then
  exit 0
fi

# 合并 main 时,main 那份 CI 发布的快照必然出现在暂存区 —— 那不是「feature
# 提交塞了一份本地重建的 db」,撤销它反而会把 main 的快照回退掉。所以合并
# 进行中、且暂存的正是被合那一侧的原样快照时放行;只要有一个字节不一样,
# 说明是本地改过的,照样报错。
if [ -f .git/MERGE_HEAD ] || git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  staged="$(git rev-parse -q --verify ":$DB" || true)"
  incoming="$(git rev-parse -q --verify "MERGE_HEAD:$DB" || true)"
  if [ -n "$staged" ] && [ "$staged" = "$incoming" ]; then
    echo "✓ $DB 是合并带进来的原样快照,放行。"
    exit 0
  fi
fi

if git diff --cached --name-only -- "$DB" | grep -q .; then
  echo "✗ $DB 被暂存进了 feature 提交。"
  echo "  codegraph.db 不进 feature commit —— CI 是唯一发布者(只在 main 上 publish)。"
  echo "  撤回:git restore --staged $DB"
  echo "  本机长期忽略它的改动:git update-index --skip-worktree $DB"
  exit 1
fi

echo "✓ $DB 未暂存(CI 在 main 上发布)。"
