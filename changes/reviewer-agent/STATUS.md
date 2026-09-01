# STATUS

**in_review**（2026-08-27，分支 claude/workbench-reviewer-agent-e17c68，四件 commit 未 push）

- 2026-08-27 · 发起人 /goal 拍板「构建 workbench 的 reviewer agent」→ 产物链（intent / spec / prototype）→ 本分支施工 → 门禁全过（fmt / clippy / 五守卫 / 53 测试）+ 原型浏览器真点三步 → 进评审。
- gate 说明：做不做已由发起人口头拍板；**规格 gate 与合入仍待人**——本分支把 spec、原型、实现一并送评审，认可即合，不认可按意见改或退回。
- 2026-08-27 · 谈定补入：自动触发走 CI 层（发起人两项拍板：workflow 落进本分支；认证走订阅 OAuth token）。结论已改写进 intent 开放问题 1 与 spec 拍板 7；待人做的两步=装 Claude GitHub App、配 `CLAUDE_CODE_OAUTH_TOKEN` secret。
- 2026-08-28 · App 与 token 已由人配齐（安装分支首场 run 成功）；分支已推、开 [PR #132](https://github.com/forcegravity1989/builder-workbench/pull/132)，检查全绿。与 main 上安装器生成的同路径 workflow 冲突已解（保留核实版）；本 PR 因改了 workflow 文件本身被 action 防篡改校验有意跳过评审（见 plan 风险 6），首场真实评审=合入后的下一条 PR。
- **两条交付路径**（2026-09-01 复核）：① **github CI 自动评审**（`.github/workflows/claude-code-review.yml` + `claude.yml`）✓ 已交付——是 github Action、PR 事件 + OAuth token 触发，**独立于 Workbench 运行时/按钮**，PR #132 已在跑；② **工作台内「请评审」按钮路径** defer——规范件（`standard/skills/mr-review/`、`REVIEW.md.tmpl`、`references/review.md`）在仓但**未编进二进制、未派发**（代码侧 `REVIEW_PROMPT_TMPL`/`review_system_prompt`/mr-review `include_str!` 零命中），且计划屏/会话屏无按钮、内核无评审命令（见 `docs/architecture.md` 模块7「没建」）。本 STATUS 的 in_review 指：规范入库 + github CI 路径已交付、送评审；in-app 路径留后续接上。
