# STATUS

> **历史状态记录（2026-09-11）**：下文按原日期保留交付、迁移与评审记录；GitHub CI 和工作台内入口是两条路径，不能互相代替交付证明。当前术语见 [CONTEXT.md](../../../CONTEXT.md)。

## 链状态（[02 §6.2](../../01-principles/02-working-backwards.md) 六环 · 2026-09-21 全局自检补格式）

| 环 | 状态 | 证据 / 已知债 |
|---|---|---|
| 1 intent | ● | `intent.md`（2026-09-20 召唤制拍板修订已同步） |
| 2 spec | ● | `spec.md` 拍板 7 = 召唤制机制细节正本；指标未挂（按「不强求」口径，方法资产不挂产品指标） |
| 3 实现设计 | ● | `.github/workflows/claude-code-review.yml`（头注释即设计）+ `review-state.mjs` 唯一实现 |
| 4 TDD | — | 不适用：无 Rust 面；行为由召唤矩阵四态实测看护（draft 跳过 / 闲聊不误杀 / 回执不假绿 / 防篡改拦截） |
| 5 验收点E2E | ◐ | 四态实测 + #236 fork 判定修复闭环有真实证据（#232/#236/#235 记录）；**未注册为 suites 用例**——已知债 |
| 6 旅程E2E | ◐ | #235 上 4 轮召唤评审真实闭环 = 真实旅程证据；未注册旅程套件 |

> 原叙事各节保留其历史与现状记录身份，格式对齐不重写历史。

**in_review**（2026-08-27，分支 claude/workbench-reviewer-agent-e17c68，四件 commit 未 push）

- 2026-08-27 · 发起人 /goal 拍板「构建 workbench 的 reviewer agent」→ 产物链（intent / spec / prototype）→ 本分支施工 → 门禁全过（fmt / clippy / 五守卫 / 53 测试）+ 原型浏览器真点三步 → 进评审。
- gate 说明：做不做已由发起人口头拍板；**规格 gate 与合入仍待人**——本分支把 spec、原型、实现一并送评审，认可即合，不认可按意见改或退回。
- 2026-08-27 · 谈定补入：自动触发走 CI 层（发起人两项拍板：workflow 落进本分支；认证走订阅 OAuth token）。结论已改写进 intent 开放问题 1 与 spec 拍板 7；待人做的两步=装 Claude GitHub App、配 `CLAUDE_CODE_OAUTH_TOKEN` secret。
- 2026-08-28 · App 与 token 已由人配齐（安装分支首场 run 成功）；分支已推、开 [PR #132](https://github.com/forcegravity1989/builder-workbench/pull/132)，检查全绿。与 main 上安装器生成的同路径 workflow 冲突已解（保留核实版）；本 PR 因改了 workflow 文件本身被 action 防篡改校验有意跳过评审（见 plan 风险 6），首场真实评审=合入后的下一条 PR。
- **两条交付路径**（2026-09-01 复核）：① **github CI 自动评审**（`.github/workflows/claude-code-review.yml` + `claude.yml`）✓ 已交付——是 github Action、PR 事件 + OAuth token 触发，**独立于 Workbench 运行时/按钮**，PR #132 已在跑；② **工作台内「请评审」按钮路径** defer——规范件（`standard/skills/mr-review/`、`REVIEW.md.tmpl`、`references/review.md`）在仓但**未编进二进制、未派发**（代码侧 `REVIEW_PROMPT_TMPL`/`review_system_prompt`/mr-review `include_str!` 零命中），且计划屏/会话屏无按钮、内核无评审命令（见 `docs/architecture.md` 模块7「没建」）。本 STATUS 的 in_review 指：规范入库 + github CI 路径已交付、送评审；in-app 路径留后续接上。
- 2026-09-20 · **触发模型修订**（发起人拍板，W1 CI/CD 规范化批）：github CI 评审从 PR 事件全自动改为 `/code-review` 评论按需召唤（draft 不触发；`workflow_dispatch` 为同一职责手动入口）；CI Summary 与验证 Review 新增「外部代码评审」机读状态行（未召唤=灰，不失败、不缺省绿，实现于 `.bw/release/verify/review-state.mjs`）；intent 开放问题 1 与 spec 拍板 7 已同步修订。工作台内「请评审」路径维持 defer 不变。
