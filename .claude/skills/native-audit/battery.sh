#!/usr/bin/env bash
# native-audit 度量电池:对一个 git 仓输出 9 段 37 条准则的机械探针读数。
# 用法: battery.sh <repo-path>   只读;每行 "C## 键=值";拿不到的值输出 NA(报告里标 Unknown)。
set -u
R="${1:?repo path}"
cd "$R" || { echo "NA repo=unreadable"; exit 1; }
g() { git -c core.quotepath=off "$@" 2>/dev/null; }
files() { g ls-files; }
cnt() { local n; n=$(grep -c . 2>/dev/null); echo "${n:-0}"; }          # 空输入也只打一个 0
gc() { local n; n=$(grep -ciE "$1" "$2" 2>/dev/null); echo "${n:-0}"; }   # 单文件计数,缺文件记 0
# 含模式的文件数——弱信号(只证成文与否,不证质量);排除 vendor、构建产物、测试夹具,
# 以及 native-audit 自己的准则/剧本文件(否则准则文本会污染被扫仓的读数)。
ex="--exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git --exclude-dir=vendor --exclude-dir=snapshots --exclude-dir=fixtures --exclude-dir=native-audit"
rgx() { grep -rliE $ex "$1" . 2>/dev/null | grep -vE 'native-audit|rubric\.md' | cnt; }

echo "## S0 规矩正本"
echo "C01 entry_files=$(files | grep -iE '(^|/)(AGENTS|CLAUDE)\.md$|\.cursorrules|copilot-instructions' | cnt)"
echo "C01 subtree_agents_md=$(files | grep -E '/AGENTS\.md$' | cnt)"
W_ALL=$(g log --format=%ad --date=format:%G-W%V | sort -u | cnt); W_HB=$(g log --format=%ad --date=format:%G-W%V -- AGENTS.md CLAUDE.md | sort -u | cnt)
echo "C01 handbook_weeks_changed=${W_HB}/${W_ALL}"
echo "C02 handbook_chars=$( [ -f AGENTS.md ] && wc -c < AGENTS.md | tr -d ' ' || echo NA)"
echo "C02 budget_gate_scripts=$(ls scripts 2>/dev/null | grep -ciE 'budget')"
echo "C02 self_edit_section=$(gc '^## (editing these|怎么改|修订)' AGENTS.md)"
echo "C03 map_glossary_files=$(ls docs/architecture.md docs/glossary.md CONTEXT.md DESIGN.md 2>/dev/null | cnt)"
echo "C03 read_before_change_rule=$(gc 'read .* before (changing|editing)|先读|改.*前.*先' AGENTS.md)"
echo "C04 skills=$(files | grep -E '(^|/)SKILL\.md$' | grep -vE 'vendor/|native-audit' | cnt)"
echo "C04 skills_ref_in_handbook=$(gc 'skills?/' AGENTS.md)"

echo "## S1 计划·意图"
echo "C11 issue_templates=$(ls .github/ISSUE_TEMPLATE 2>/dev/null | grep -vi config | cnt)"
echo "C11 pr_template=$(ls .github/pull_request_template.md .github/PULL_REQUEST_TEMPLATE.md .github/PULL_REQUEST_TEMPLATE 2>/dev/null | cnt)"
echo "C11 intent_files=$(files | grep -ciE 'proposed/.*\.md$|/intent\.md$')"
echo "C11 issue_automation_workflows=$(grep -lE '^\s*issues:' .github/workflows/*.yml 2>/dev/null | cnt)"
echo "C12 md_files=$(files | grep -c '\.md$')"
# 死链探针:只查相对 .md 链接;排除 vendor、冻结归档(archived/)、含省略号的举例路径;命中仍须人工复核。
DEAD=$(files | grep '\.md$' | grep -vE '^(standard/)?vendor/|/archived/|native-audit' | while IFS= read -r f; do d=$(dirname "$f"); grep -oE '\]\(([^)#: `…]+\.md)' "$f" 2>/dev/null | sed -E 's/\]\(//' | while IFS= read -r l; do [ -e "$d/$l" ] || echo "$f -> $l"; done; done | cnt)
echo "C12 dead_relative_md_links_nonvendor=${DEAD}"

echo "## S2 设计·决策"
DEC=$(files | grep -E 'adr/|/notes/(implemented|proposed|rejected|archived)/|^changes/.*/(intent|spec)\.md$' | grep -vE '\.zh\.md$|\.i18n\.yaml$|/AGENTS\.md$|README' )
DEC_N=$(echo "$DEC" | cnt)
ALT_N=$(echo "$DEC" | while IFS= read -r f; do [ -n "$f" ] && grep -qiE '^## (alternatives|替代方案|放弃方案|考虑过)' "$f" && echo x; done | cnt)
echo "C21 decision_records=${DEC_N}"
echo "C21 decision_format_gates=$(ls scripts 2>/dev/null | grep -ciE 'agent-note|adr|decision')"
echo "C21 mandate_written=$(gc 'must include an agent note|决策记录|changes/<id>' AGENTS.md)"
echo "C22 records_with_alternatives=${ALT_N}/${DEC_N}"
echo "C23 lifecycle_dirs=$(ls -d .agents/notes/*/ 2>/dev/null | cnt)"
echo "C23 status_files=$(files | grep -c 'STATUS\.md$')"
echo "C23 frozen_manifest=$(ls .agents/notes/archived/manifest.json 2>/dev/null | cnt)"

echo "## S3 构建"
echo "C31 plan_files=$(files | grep -ciE '/plan\.md$|acceptance')"
echo "C31 plan_first_rule=$(rgx 'plan(ning)? before|先计划后动手|acceptance criteria')"
echo "C32 hook_config=$(ls lefthook.yml .husky .pre-commit-config.yaml .githooks 2>/dev/null | cnt)"
echo "C32 gate_scripts=$(ls scripts 2>/dev/null | grep -ciE '^(verify|guard|check)-' )"
echo "C32 gate_scripts_with_spec=$(ls scripts 2>/dev/null | grep -ciE '^(verify|guard|check)-.*\.(spec|test)\.')"
echo "C32 ci_workflows=$(ls .github/workflows 2>/dev/null | cnt)"
MERGES=$(g rev-list --count --merges HEAD); AI_MERGES=$(g log --merges --format=%s HEAD | grep -ciE 'codex/|claude|copilot|worktree|cursor/')
echo "C33 ai_or_worktree_merges=${AI_MERGES}/${MERGES}"
echo "C33 worktree_rule=$(gc 'worktree' AGENTS.md)"
echo "C34 gen_scripts=$(ls scripts 2>/dev/null | grep -ciE '^gen-')"
echo "C34 vendor_manifest=$(ls vendor/README.md standard/vendor/*/MANIFEST* standard/vendor/README.md 2>/dev/null | cnt)"
echo "C35 strict_type_config=$(grep -lsE '"strict": *true|forbid\(unsafe_code\)|-D warnings' tsconfig*.json .github/workflows/*.yml crates/*/src/lib.rs crates/*/src/main.rs 2>/dev/null | cnt)"
echo "C35 lint_dup_config=$(ls .oxlintrc* .eslintrc* eslint.config.* .jscpd.json clippy.toml rustfmt.toml 2>/dev/null | cnt)"
echo "C35 dependabot=$(ls .github/dependabot.yml 2>/dev/null | cnt)"
echo "C35 dependency_policy_written=$(rgx 'hand-roll|dependenc(y|ies) (policy|over)|成熟 CLI|自建须举证|不为.*兼容')"
echo "C36 conventional_prefix_rate=$(g log --no-merges --format=%s -500 HEAD | grep -cE '^[a-z]+(\(|:)')/$(g log --no-merges --format=%s -500 HEAD | cnt)"
echo "C36 commits_total=$(g rev-list --count HEAD) nonmerge=$(g rev-list --count --no-merges HEAD)"
echo "C36 span=$(g log --reverse --format=%ad --date=short HEAD | head -1)..$(g log -1 --format=%ad --date=short HEAD)"
echo "C36 authors=$(g shortlog -sn --no-merges HEAD | cnt) top1=$(g shortlog -sn --no-merges HEAD | head -1 | awk '{print $1}')"

echo "## S4 测试·验证"
echo "C41 testing_doc=$(ls docs/testing.md docs/TESTING.md 2>/dev/null | cnt)"
echo "C41 test_commands_in_handbook=$(gc 'test|测' AGENTS.md)"
echo "C42 ci_mentions_test=$(grep -lsiE 'cargo test|pnpm (run )?test|npm test|pytest|vitest' .github/workflows/*.yml 2>/dev/null | cnt)"
echo "C42 ci_coverage_or_snapshot_gate=$(grep -lsiE 'coverage|snapshot' .github/workflows/*.yml 2>/dev/null | cnt)"
echo "C43 evidence_rule=$(rgx 'report only commands run|证据.*(进|入) ?(PR|MR)|only .*commands.* run|读回')"
echo "C43 change_scope_tool=$(ls scripts 2>/dev/null | grep -ciE 'change-scope|changed-files')"
echo "C44 regression_first_rule=$(rgx 'watch red|introduce the regression|先写.*失败测试|坏例')"
echo "C44 test_file_protection=$(rgx 'never (modify|edit) tests|do not (modify|edit) (the )?tests|禁止.*改.*测试')"
echo "C45 real_entry_rule=$(rgx 'built-bin|verify the world|self-report|真实入口|读回')"
echo "C46 flake_policy=$(rgx 'flak(e|y)|nondeterministic|抖动')"

echo "## S5 评审·合入·发布"
echo "C51 review_skill=$(files | grep -ciE 'skills/[^/]*review[^/]*/SKILL\.md$')"
echo "C51 review_workflow=$(grep -lsiE 'review' .github/workflows/*.yml 2>/dev/null | cnt)"
echo "C52 merge_committers=$(g log --merges --format=%cn HEAD | sort | uniq -c | sort -rn | head -3 | awk '{printf "%s:%s ", $2, $1}')"
echo "C52 agent_merge_ban=$(rgx 'gh pr merge|不.*merge|no.*merge.*own|cannot approve')"
echo "C53 label_taxonomy_written=$(rgx 'kind/|area/|bw:status:')"
echo "C53 force_policy=$(rgx 'force-with-lease|不.*force|never raw')"
echo "C54 tags=$(g tag | cnt) release_workflows=$(ls .github/workflows 2>/dev/null | grep -ci release) release_merges=$(g log --merges --format=%s HEAD | grep -ci 'release/')"
echo "C54 changelog_safety_notices=$(ls CHANGELOG.md SAFETY.md THIRD_PARTY_NOTICES.md LICENSE 2>/dev/null | cnt)"
# 「rollback」在 agent 产品里常是运行时概念(效果撤销/会话回滚),只认发布/运维语境的窄模式。
echo "C55 rollback_written=$(rgx 'rollback (plan|procedure|drill|runbook|path)|(release|deploy|发版|部署).{0,20}(rollback|回滚)|回滚(演练|剧本|步骤|路径)')"

echo "## S6 运维·事故"
echo "C61 postmortems=$(files | grep -iE 'postmortem|post-mortem|incident|复盘|事故' | grep -vE '\.zh\.md$|\.i18n\.yaml$|README|native-audit' | cnt)"
echo "C61 postmortem_criteria_written=$(rgx 'post-?mortem|复盘|事故记录')"
echo "C62 handbook_cites_postmortem=$(grep -ciE 'postmortem|复盘|事故' AGENTS.md docs/testing.md 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')"
echo "C63 issue_automation_scripts=$(ls .github/issue-management 2>/dev/null | cnt) metric_scripts=$(ls .bw/scripts 2>/dev/null | cnt)"

echo "## S7 知识维护·反 slop"
echo "C71 doc_structure_rule=$(rgx 'one home per fact|一事一家|current state, not|写现状|历史横幅|30 秒导读')"
echo "C72 slop_checklist=$(rgx 'slop|黑话|写作纪律|reasoning transcript')"
echo "C73 doc_gate_scripts=$(ls scripts 2>/dev/null | grep -ciE 'md-|doc|link|budget|mermaid|translation')"
echo "C74 simplify_archive_skill=$(files | grep -ciE 'skills/[^/]*(simplif|archive|减法)[^/]*/SKILL\.md$')"
echo "C74 frozen_or_banner_rule=$(rgx 'frozen|冻结|历史横幅|过时不删')"

echo "## S8 AI 协作"
TOTAL=$(g rev-list --count HEAD); AI_TR=$(g log --format='%(trailers:key=Co-Authored-By,valueonly)' HEAD | grep -ciE 'claude|codex|cursor|copilot|gpt|gemini|deepseek|bot')
echo "C81 ai_coauthor_trailers=${AI_TR}/${TOTAL}"
echo "C81 ai_trailer_by_name=$(g log --format='%(trailers:key=Co-Authored-By,valueonly)' HEAD | grep . | sed -E 's/ *<.*//' | sort | uniq -c | sort -rn | head -4 | awk '{c=$1; $1=""; printf "%s:%s ", substr($0,2), c}')"
echo "C81 ai_merges=${AI_MERGES}/${MERGES}"
echo "C82 claude_md_is_link_or_import=$( [ -L CLAUDE.md ] && echo symlink || (grep -qE '^@AGENTS\.md' CLAUDE.md 2>/dev/null && echo import || echo none) )"
echo "C82 multiharness_metadata_gate=$(ls scripts 2>/dev/null | grep -ciE 'skill|harness')"
echo "C83 secret_policy_written=$(rgx 'never commit credential|不.*提交.*(密钥|凭据)|secrets? (policy|never)|不入仓')"
echo "C83 env_gitignored=$(gc '^\.env|\*\.env|secrets?' .gitignore)"
echo "C84 snapshot_or_eval_regression=$(rgx 'snapshot|回放|评测集|eval suite')"
