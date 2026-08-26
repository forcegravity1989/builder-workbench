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

if git diff --cached --name-only -- "$DB" | grep -q .; then
  echo "✗ $DB 被暂存进了 feature 提交。"
  echo "  codegraph.db 不进 feature commit —— CI 是唯一发布者(只在 main 上 publish)。"
  echo "  撤回:git restore --staged $DB"
  echo "  本机长期忽略它的改动:git update-index --skip-worktree $DB"
  exit 1
fi

echo "✓ $DB 未暂存(CI 在 main 上发布)。"
