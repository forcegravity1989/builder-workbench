#!/usr/bin/env bash
# 提交前门禁 —— 这份脚本是门禁清单的唯一正本。
# CLAUDE.md / README.md / DEVELOPMENT.md 只指到这里,不再各自复述命令清单
# (历史教训:清单曾在三处各写一份,互相漂移出三个不同版本)。
#
# 与 CI(.github/workflows/ci.yml)的关系:CI 是这份清单的子集。
# CI 那台 Linux 没有 WebKit/GTK,两个桌面壳(app-desktop / app-shell)在那边
# 链接不过,所以壳的编译与 clippy 只在本机跑;三个结构守卫是纯文本检查,
# 不用编译,两边都跑。
set -euo pipefail
cd "$(dirname "$0")/.."

run() { echo; echo "▶ $*"; "$@"; }

run cargo fmt --all --check

# app-desktop(V3 旧壳)不 lint:一心 V4,旧壳等删、不再投入。
# app-shell(V4 新壳)要 lint:新壳从第一天起就守规矩。
run cargo clippy --workspace --exclude app-desktop -- -D warnings

# wasm32 keepalive:保住「以后也许的 Web 版」那扇门。
run cargo check -p bw-core --target wasm32-unknown-unknown --no-default-features
run cargo check -p ui --target wasm32-unknown-unknown

# 结构守卫(纯文本检查,CI 里也跑)。
run ./scripts/guard-kernel-ui-free.sh
run ./scripts/guard-no-cross-screen-import.sh
run ./scripts/guard-screen-hooks.sh
run ./scripts/guard-file-lines.sh

# 两个壳编译得过(只在本机,理由见文件头)。
run cargo check -p app-desktop
run cargo check -p app-shell

# 与 CI 完全相同的一条:裸 cargo test 只跑 default-members(不含两个壳)。
run cargo test

echo
echo "✅ 门禁全过"
