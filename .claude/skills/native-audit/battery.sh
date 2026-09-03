#!/usr/bin/env bash
# native-audit 探针引擎 —— 对一个 git 仓输出 9 段 37 条准则的只读读数。
#
# 引擎不含任何业务知识:它只会「按模式表数东西」。所有「什么算手册、什么算决策
# 记录、什么算门禁」的判断都在 patterns/ 里,是可读、可换、可为别的组织重写的数据。
#   patterns/core.conf       跨组织通用惯例(默认加载)
#   patterns/ecosystem.conf  语言与 CI 平台(按仓里的标志文件自动选)
#   patterns/dialect.*.conf  某组织私有词汇(仅 --dialect 显式加载)
#
# 用法: battery.sh <repo-path> [--dialect <file>] [--patterns <dir>]
#                              [--self-exclude <仓内相对路径前缀>]...
# 输出: 每行 "C## 键=值";拿不到的值输出 Unknown(不写 N/A、不猜、不补分)。
#
# --self-exclude:自扫时排除「写着准则原文的地方」。引擎能自动认出扫描器自己所在的
# 目录,但认不出准则、规格、评估报告被放在了哪 —— 那些文件逐条复述准则用语,不排除
# 会被当成「这个仓有这条规矩」计进读数。自扫一个带 native-audit 产物链的仓时,把那条
# 产物链路径也传进来。可重复。
set -u

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATTERNS_DIR="$SELF_DIR/patterns"
DIALECT=""
REPO=""
EXTRA_SELF_EXCL=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dialect)      DIALECT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2 ;;
    --patterns)     PATTERNS_DIR="$(cd "$2" && pwd)"; shift 2 ;;
    --self-exclude) EXTRA_SELF_EXCL+=("${2%/}"); shift 2 ;;
    *)              REPO="$1"; shift ;;
  esac
done
[ -n "$REPO" ] || { echo "用法: battery.sh <repo-path> [--dialect <file>] [--patterns <dir>]" >&2; exit 2; }

# shellcheck source=patterns/core.conf
. "$PATTERNS_DIR/core.conf" || { echo "Unknown patterns=core.conf-unreadable"; exit 1; }
. "$PATTERNS_DIR/ecosystem.conf" || { echo "Unknown patterns=ecosystem.conf-unreadable"; exit 1; }

# 方言以 `|` 追加到同名通用模式后面(不覆盖),这样通用信号永远还在。
DIALECT_NAME="none"
if [ -n "$DIALECT" ]; then
  . "$DIALECT" || { echo "Unknown dialect=unreadable"; exit 1; }
  DIALECT_NAME="$(basename "$DIALECT")"
  for v in $(set | sed -n 's/^\(D_[A-Z_]*\)=.*/\1/p'); do
    base="P_${v#D_}"; add="${!v}"
    [ -n "${!base:-}" ] && printf -v "$base" '%s|%s' "${!base}" "$add" || printf -v "$base" '%s' "$add"
  done
fi

cd "$REPO" 2>/dev/null || { echo "Unknown repo=unreadable"; exit 1; }
REPO_ABS="$(pwd)"

git rev-parse --git-dir >/dev/null 2>&1 || { echo "Unknown repo=not-a-git-repo"; exit 1; }

# ── 助手 ────────────────────────────────────────────────────
g() { git -c core.quotepath=off "$@" 2>/dev/null; }

# ── 自我排除清单(必须先于任何 files()/rgx() 调用建好) ──────────
# 排除两处「写着准则原文的地方」:扫描器自己所在目录(引擎能推导),以及调用方用
# --self-exclude 指定的准则/规格/评估报告目录(引擎推导不出,它们可以在仓里任何地方)。
SELF_EXCL="$(mktemp)"; trap 'rm -f "$SELF_EXCL"' EXIT
case "$SELF_DIR" in "$REPO_ABS"/*) echo "${SELF_DIR#"$REPO_ABS"/}" >>"$SELF_EXCL" ;; esac
for p in ${EXTRA_SELF_EXCL+"${EXTRA_SELF_EXCL[@]}"}; do [ -n "$p" ] && echo "$p" >>"$SELF_EXCL"; done
# 两处都不在被扫仓内时,写一个绝不会出现在路径里的哨兵 —— 空文件或空行会让
# `grep -vFf` 把每一行都当命中排除掉(踩过:某仓的技能与决策记录整个被清零)。
[ -s "$SELF_EXCL" ] || echo '__native_audit_no_self_exclusion__' >"$SELF_EXCL"
SELF_EXCL_SHOWN="$(tr '\n' ' ' <"$SELF_EXCL" | sed 's/__native_audit_no_self_exclusion__/none/')"

# 入库文件清单,已剔除 vendored / 第三方 / 子模块与自我排除项 —— 别人的代码、
# 以及写着准则原文的文件,都不反映这个仓自己的实践水位。
# (git ls-files 不吃 grep 的 --exclude-dir,所以在这里按路径模式剔。)
files() { g ls-files | grep -vE "$P_VENDORED_PATH" | grep -vFf "$SELF_EXCL"; }
# 不做任何剔除的原始清单。只给「要找的东西本来就住在被剔目录里」的探针用(如 vendor 清单)。
files_all() { g ls-files; }
cnt() { local n; n=$(grep -c . 2>/dev/null); echo "${n:-0}"; }
# 按 ERE 数「含该模式的文件数」——弱信号:只证成文与否,不证做得好不好。
rgx() { grep -rliE $EXCL "$1" . 2>/dev/null | grep -vFf "$SELF_EXCL" | cnt; }
# 数一组候选路径里存在几个(空格分隔的 glob,不存在的不计)
haveN() { local n=0 p; for p in $1; do for e in $p; do [ -e "$e" ] && n=$((n+1)); done; done; echo "$n"; }
# 在一组文件里数含模式的文件数
grepN() { local pat="$1" list="$2" n=0 f; for f in $list; do for e in $f; do [ -f "$e" ] && grep -qiE "$pat" "$e" 2>/dev/null && n=$((n+1)); done; done; echo "$n"; }
# 手册文件清单(按通用模式找,不写死叫 AGENTS.md)
HANDBOOKS="$(files | grep -iE "$P_HANDBOOK_FILE" | head -20)"
ROOT_HANDBOOK="$(echo "$HANDBOOKS" | grep -vE '/' | head -1)"
# 在「本仓的手册」里数模式(手册叫什么由模式表决定)
hb() { [ -n "$ROOT_HANDBOOK" ] && { local n; n=$(grep -ciE "$1" "$ROOT_HANDBOOK" 2>/dev/null); echo "${n:-0}"; } || echo Unknown; }

EXCL=""; for d in $P_EXCLUDE_DIR; do EXCL="$EXCL --exclude-dir=$d"; done

# 脚本目录(不假设一定叫 scripts/)
SCRIPT_FILES=""
for d in $P_SCRIPT_DIR; do [ -d "$d" ] && SCRIPT_FILES="$SCRIPT_FILES $(ls "$d" 2>/dev/null | sed "s|^|$d/|")"; done
sN() { echo "$SCRIPT_FILES" | tr ' ' '\n' | grep -iE "$1" | cnt; }

# CI 配置文件清单(跨平台)
CI_FILES=""; for p in $CI_GLOB; do for e in $p; do [ -f "$e" ] && CI_FILES="$CI_FILES $e"; done; done
CI_N=$(echo "$CI_FILES" | tr ' ' '\n' | grep -c . )

# 生态探测:仓里有哪些标志文件就叠加哪些语言的模式
ECOS=""; STRICT_PAT=""; LINT_FILES=""; TEST_CMD=""; TESTMARK=""; SRC_EXT=""
for e in $ECO_ALL; do
  mv="ECO_${e}_MARKER"; found=0
  for m in ${!mv}; do for x in $m; do [ -e "$x" ] && found=1; done; done
  [ "$found" -eq 1 ] || continue
  ECOS="$ECOS $e"
  sv="ECO_${e}_STRICT"; lv="ECO_${e}_LINT"; tv="ECO_${e}_TEST"; mkv="ECO_${e}_TESTMARK"; ev="ECO_${e}_SRC"
  STRICT_PAT="${STRICT_PAT:+$STRICT_PAT|}${!sv}"; LINT_FILES="$LINT_FILES ${!lv}"
  TEST_CMD="${TEST_CMD:+$TEST_CMD|}${!tv}"; TESTMARK="${TESTMARK:+$TESTMARK|}${!mkv}"
  SRC_EXT="${SRC_EXT:+$SRC_EXT|}${!ev}"
done
ECOS="${ECOS# }"; [ -n "$ECOS" ] || ECOS="unknown"

echo "## META"
echo "M00 scanner=native-audit/battery.sh patterns=$(basename "$PATTERNS_DIR") dialect=${DIALECT_NAME}"
echo "M04 self_excluded=${SELF_EXCL_SHOWN% }"
echo "M01 ecosystems=${ECOS}"
echo "M02 ci_platform_files=${CI_N}"
echo "M03 handbook_detected=${ROOT_HANDBOOK:-none}"

echo "## S0 规矩正本"
echo "C01 handbook_entry_files=$(echo "$HANDBOOKS" | cnt)"
echo "C01 handbook_subtree=$(files | grep -iE "$P_HANDBOOK_SUBTREE" | cnt)"
if [ -n "$ROOT_HANDBOOK" ]; then
  W_ALL=$(g log --format=%ad --date=format:%G-W%V | sort -u | cnt)
  W_HB=$(g log --format=%ad --date=format:%G-W%V -- $HANDBOOKS | sort -u | cnt)
  echo "C01 handbook_weeks_changed=${W_HB}/${W_ALL}"
  echo "C02 handbook_bytes=$(wc -c < "$ROOT_HANDBOOK" | tr -d ' ')"
else
  echo "C01 handbook_weeks_changed=Unknown reason=no-handbook-file"
  echo "C02 handbook_bytes=Unknown reason=no-handbook-file"
fi
echo "C02 budget_gate_scripts=$(sN 'budget|wordcount|length')"
echo "C02 self_edit_section=$(hb "$P_SELF_EDIT")"
echo "C03 map_glossary_files=$(files | grep -iE "$P_MAP_FILE" | cnt)"
echo "C03 read_before_change_rule=$(hb "$P_READ_BEFORE")"
echo "C04 skill_files=$(files | grep -iE "$P_SKILL_FILE" | grep -vFf "$SELF_EXCL" | cnt)"
echo "C04 skills_ref_in_handbook=$(hb 'skill|playbook|prompt')"

echo "## S1 计划·意图"
echo "C11 issue_templates=$(haveN "$P_ISSUE_TEMPLATE_DIR")"
echo "C11 pr_template=$(haveN "$P_PR_TEMPLATE")"
echo "C11 intent_files=$(files | grep -iE "$P_INTENT_FILE" | cnt)"
echo "C11 issue_automation_ci=$(grepN 'issues:|issue_comment|issue事件' "$CI_FILES")"
echo "C12 md_files=$(files | grep -c '\.md$')"
DEAD=$(files | grep '\.md$' | grep -vE '/(archived|vendor|third_party)/' | grep -vFf "$SELF_EXCL" | while IFS= read -r f; do d=$(dirname "$f"); grep -oE '\]\(([^)#: `…]+\.md)' "$f" 2>/dev/null | sed -E 's/\]\(//' | while IFS= read -r l; do [ -e "$d/$l" ] || echo "$f -> $l"; done; done | cnt)
echo "C12 dead_relative_md_links=${DEAD}"

echo "## S2 设计·决策"
DEC=$(files | grep -iE "$P_DECISION_PATH" | grep -vE '\.zh\.md$|\.i18n\.ya?ml$|/(AGENTS|README)\.md$' | grep -vFf "$SELF_EXCL")
DEC_N=$(echo "$DEC" | cnt)
ALT_N=$(echo "$DEC" | while IFS= read -r f; do [ -n "$f" ] && [ -f "$f" ] && grep -qiE "$P_ALTERNATIVES_SECTION" "$f" && echo x; done | cnt)
CON_N=$(echo "$DEC" | while IFS= read -r f; do [ -n "$f" ] && [ -f "$f" ] && grep -qiE "$P_CONSEQUENCE_SECTION" "$f" && echo x; done | cnt)
echo "C21 decision_records=${DEC_N}"
echo "C21 decision_format_gates=$(sN 'adr|decision|agent-note|rfc')"
echo "C21 mandate_written=$(hb "$P_DECISION_MANDATE")"
echo "C22 records_with_alternatives=${ALT_N}/${DEC_N}"
echo "C22 records_with_consequences=${CON_N}/${DEC_N}"
LC_N=$(echo "$DEC" | sed -E 's|/[^/]*$||' | sort -u | grep -icE "/$P_LIFECYCLE_DIR(/|$)")
echo "C23 lifecycle_dirs=${LC_N}"
echo "C23 status_files=$(files | grep -iE "$P_STATUS_FILE" | cnt)"
echo "C23 frozen_manifest=$(files | grep -iE "$P_FROZEN_MANIFEST" | cnt)"

echo "## S3 构建"
echo "C31 plan_files=$(files | grep -iE "$P_PLAN_FILE" | cnt)"
echo "C31 plan_first_rule=$(rgx "$P_PLAN_FIRST")"
echo "C32 hook_config=$(haveN "$P_HOOK_CONFIG")"
echo "C32 gate_scripts=$(echo "$SCRIPT_FILES" | tr ' ' '\n' | sed 's|.*/||' | grep -iE "$P_GATE_SCRIPT" | grep -vE '\.(spec|test)\.' | cnt)"
echo "C32 gate_selftests=$(echo "$SCRIPT_FILES" | tr ' ' '\n' | sed 's|.*/||' | grep -icE "$P_GATE_SELFTEST")"
echo "C32 ci_configs=${CI_N}"
MERGES=$(g rev-list --count --merges HEAD); AI_MERGES=$(g log --merges --format=%s HEAD | grep -ciE "$P_AI_BRANCH")
echo "C33 ai_or_worktree_merges=${AI_MERGES}/${MERGES}"
echo "C33 parallel_unit_rule=$(hb 'worktree|parallel session|并行')"
echo "C34 gen_scripts=$(echo "$SCRIPT_FILES" | tr ' ' '\n' | sed 's|.*/||' | grep -icE "$P_GEN_SCRIPT")"
# 用 files_all:vendor 清单本身就住在 vendored 目录里(vendor/README、third_party/MANIFEST),
# files() 已按 P_VENDORED_PATH 把那些路径整段剔掉,拿它来找清单永远找不到。
echo "C34 vendor_manifest=$(files_all | grep -iE "$P_VENDOR_MANIFEST" | cnt)"
if [ "$ECOS" = "unknown" ]; then
  echo "C35 strict_config=Unknown reason=no-known-ecosystem-marker"
  echo "C35 lint_config=Unknown reason=no-known-ecosystem-marker"
else
  echo "C35 strict_config=$(grepN "$STRICT_PAT" "$CI_FILES $(files | grep -E '\.(toml|json|props)$' | head -40 | tr '\n' ' ')")"
  echo "C35 lint_config=$(haveN "$LINT_FILES")"
fi
echo "C35 dep_bot=$(haveN "$BOT_CONFIG")"
echo "C35 dependency_policy=$(rgx "$P_DEPENDENCY_POLICY")"
SAMPLE=$(g log --no-merges --format=%s -500 HEAD | cnt)
echo "C36 conventional_prefix_rate=$(g log --no-merges --format=%s -500 HEAD | grep -cE '^[a-z]+(\(|!|:)')/${SAMPLE}"
echo "C36 commits_total=$(g rev-list --count HEAD) nonmerge=$(g rev-list --count --no-merges HEAD)"
echo "C36 span=$(g log --reverse --format=%ad --date=short HEAD | head -1)..$(g log -1 --format=%ad --date=short HEAD)"
echo "C36 authors=$(g shortlog -sn --no-merges HEAD | cnt) top1_commits=$(g shortlog -sn --no-merges HEAD | head -1 | awk '{print $1}')"

echo "## S4 测试·验证"
echo "C41 testing_doc=$(files | grep -iE "$P_TESTING_DOC" | cnt)"
echo "C41 test_cmds_in_handbook=$(hb 'test|测试')"
if [ "$ECOS" = "unknown" ]; then
  echo "C42 ci_runs_tests=Unknown reason=no-known-ecosystem-marker"
  echo "C42 test_marks=Unknown reason=no-known-ecosystem-marker"
else
  echo "C42 ci_runs_tests=$(grepN "$TEST_CMD" "$CI_FILES")"
  echo "C42 test_marks=$(grep -rcE "$TESTMARK" $EXCL --include='*' . 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')"
fi
echo "C42 ci_coverage_or_snapshot=$(grepN "$CI_COVERAGE_SIGNAL" "$CI_FILES")"
echo "C43 evidence_rule=$(rgx "$P_EVIDENCE_RULE")"
echo "C43 change_scope_tool=$(sN "$P_CHANGE_SCOPE_TOOL")"
echo "C44 regression_first_rule=$(rgx "$P_REGRESSION_FIRST")"
echo "C44 test_file_protection=$(rgx "$P_TEST_PROTECTION")"
echo "C45 real_entry_rule=$(rgx "$P_REAL_ENTRY")"
echo "C46 flake_policy=$(rgx "$P_FLAKE_POLICY")"

echo "## S5 评审·合入·发布"
echo "C51 review_skill=$(files | grep -iE "$P_REVIEW_SKILL" | grep -vFf "$SELF_EXCL" | cnt)"
echo "C51 review_ci=$(grepN "$P_REVIEW_CI" "$CI_FILES")"
echo "C52 merge_committers=$(g log --merges --format=%cn HEAD | sort | uniq -c | sort -rn | head -3 | awk '{c=$1; $1=""; printf "%s:%s ", substr($0,2), c}')"
echo "C52 self_merge_ban=$(rgx "$P_SELF_MERGE_BAN")"
echo "C53 label_taxonomy=$(rgx "$P_LABEL_TAXONOMY")"
echo "C53 force_policy=$(rgx "$P_FORCE_POLICY")"
echo "C54 tags=$(g tag | cnt) release_ci=$(grepN "$P_RELEASE_CI" "$CI_FILES") release_merges=$(g log --merges --format=%s HEAD | grep -ciE 'release|version bump')"
echo "C54 release_files=$(haveN "$P_RELEASE_FILE")"
echo "C55 rollback_written=$(rgx "$P_ROLLBACK")"

echo "## S6 运维·复盘"
echo "C61 postmortem_files=$(files | grep -iE "$P_DOC_EXT" | grep -iE "$P_POSTMORTEM_PATH" | grep -vE '\.zh\.md$|\.i18n\.ya?ml$|README' | grep -vFf "$SELF_EXCL" | cnt)"
echo "C61 postmortem_rule=$(rgx "$P_POSTMORTEM_RULE")"
echo "C62 handbook_cites_postmortem=$(hb "$P_POSTMORTEM_RULE")"
echo "C63 automation_scripts=$(sN "$P_AUTOMATION_SCRIPT")$( files | grep -icE "$P_AUTOMATION_SCRIPT" | sed 's/^/+/')"

echo "## S7 知识维护·反 slop"
echo "C71 doc_structure_rule=$(rgx "$P_DOC_STRUCTURE")"
echo "C72 slop_checklist=$(rgx "$P_SLOP_CHECKLIST")"
echo "C73 doc_gate_scripts=$(sN "$P_DOC_GATE_SCRIPT")"
echo "C74 simplify_archive_skill=$(files | grep -iE "$P_SKILL_FILE" | grep -iE "$P_SIMPLIFY_SKILL" | grep -vFf "$SELF_EXCL" | cnt)"
echo "C74 frozen_rule=$(rgx "$P_FROZEN_RULE")"

echo "## S8 AI 协作"
TOTAL=$(g rev-list --count HEAD)
AI_TR=$(g log --format='%(trailers:key=Co-Authored-By,valueonly)' HEAD | grep -ciE "$P_AI_TRAILER")
echo "C81 ai_coauthor_trailers=${AI_TR}/${TOTAL}"
echo "C81 ai_trailer_by_name=$(g log --format='%(trailers:key=Co-Authored-By,valueonly)' HEAD | grep -iE "$P_AI_TRAILER" | sed -E 's/ *<.*//' | sort | uniq -c | sort -rn | head -4 | awk '{c=$1; $1=""; printf "%s:%s ", substr($0,2), c}')"
echo "C81 ai_merges=${AI_MERGES}/${MERGES}"
# 多 harness 共用一份正本:软链 / 导入 / 内容相同,三种做法都算
MH="none"
if [ -n "$ROOT_HANDBOOK" ]; then
  for h in $(echo "$HANDBOOKS" | grep -vE '/'); do
    [ "$h" = "$ROOT_HANDBOOK" ] && continue
    if [ -L "$h" ]; then MH="symlink"; break
    elif grep -qE "^@?$ROOT_HANDBOOK|^@" "$h" 2>/dev/null; then MH="import"; break
    elif [ -f "$h" ] && cmp -s "$h" "$ROOT_HANDBOOK"; then MH="copy"; break; fi
  done
fi
echo "C82 handbook_shared_across_harness=${MH}"
echo "C82 multiharness_gate=$(sN "$P_MULTIHARNESS_GATE")"
echo "C83 secret_policy=$(rgx "$P_SECRET_POLICY")"
echo "C83 secret_ignored=$( [ -f .gitignore ] && { n=$(grep -ciE "$P_SECRET_IGNORE" .gitignore); echo "${n:-0}"; } || echo Unknown )"
echo "C84 agent_regression=$(rgx "$P_AGENT_REGRESSION")"
