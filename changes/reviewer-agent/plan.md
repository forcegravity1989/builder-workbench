# Plan · 独立评审（reviewer agent）

> **30 秒导读**：这是什么——本次变更的**实施计划件**（改哪些文件 / 顺序 / 风险 / 怎么证明）。给谁看——审 PR 的人对着它核 diff。现在作数吗——**施工中**（2026-08-27）。上游：`intent.md` → `spec.md`（含 `prototype.html`）→ 本篇。未命中大风险清单（无迁移、无权限面扩大、无对外契约变更），plan 不升 gate。

## 改哪些文件

```
standard/skills/mr-review/SKILL.md                 新增(评审剧本:两轴评审+意见六段+硬约束)
standard/system-prompt/references/review.md        新增(评审阶段规范)
standard/system-prompt/REVIEW.md.tmpl              新增(评审会话主提示词,外置与 SYSTEM.md.tmpl 同机制)
standard/VERSION                                   5.9 → 5.10
standard/README.md                                 登记三份新件与版本行
crates/bw/src/standard/system_prompt.rs            REVIEW_PROMPT_TMPL + REF_REVIEW(REFS 3→4)
crates/bw/src/standard/skills.rs                   MR_REVIEW_SKILL(PACKS 5→6)
crates/bw/src/app/ops.rs                           skill_slug / workflow_label 加 mr-review
crates/bw/src/command.rs                           Command::ReviewIssue / CancelReview + Event::ReviewStarted / ReviewCancelled
crates/bw/src/app/mod.rs                           dispatch 两臂 + 评审会话读写助手 + review_briefing
crates/bw/src/local/sessions.rs                    评审会话轴:<iid>-review.jsonl(list 跳过评审件)
crates/bw/src/app/session.rs                       review_issue(守卫+起评审 PTY)/ cancel_review;delete_session 连评审会话一起收
crates/bw/src/app/bootstrap.rs                     review_system_prompt + review_references
crates/app-shell/src/vm.rs                         SessionVm 加评审会话两字段;SessionTab::Review
crates/app-shell/src/bridge/vm_panels.rs           build_sessions 填评审会话字段
crates/app-shell/src/bridge/vm_build.rs            note_of 两臂
crates/app-shell/src/bridge/mod.rs                 ShowBriefing 加 review 位;ReviewStarted 后选中会话并切评审页签
crates/app-shell/src/main.rs                       评审终端挂载(与写码终端同机制)
crates/app-shell/src/screens/session/mod.rs        动作条「请评审 / ■ 停止评审」+「评审」页签
crates/app-shell/src/screens/plan/detail.rs        评审中活的详情加「请评审」
changes/reviewer-agent/                            本产物链五件(intent/spec/prototype/plan/STATUS)
docs/architecture.md                               模块 4/7/15 各补一句评审落点
CHANGELOG.md                                       一行
.github/workflows/claude-code-review.yml           新增(谈定补入:GitHub 仓 PR 事件自动 review,OAuth token 认证)
```

## 顺序与进度

| # | 步 | 状态 |
|---|---|---|
| 1 | 产物链:intent + spec + 可点原型 | ✔ |
| 2 | standard 三件(剧本/阶段规范/评审模板)+ VERSION + README | 施工中 |
| 3 | 内核:命令/事件、评审会话轴、review_issue 守卫与起会话、briefing | 待做 |
| 4 | 壳:动作条按钮、评审页签、终端挂载、详情入口、note | 待做 |
| 5 | 门禁全过(fmt / clippy / 三守卫 / 行数 / 壳编译 / cargo test) | 待做 |
| 6 | 原型浏览器真开一遍 + briefing 读回验证 + 文档收尾(architecture/CHANGELOG) | 待做 |
| 7 | 分件 commit(不 push),STATUS 置 in_review | 待做 |

## 风险

1. **会话身份轴**:会话记录与 worktree 都按活 1:1 键控。评审会话另立文件轴(`<iid>-review.jsonl`),worktree 共用不另开;`SessionStore::list` 必须跳过评审件,否则会话列表冒出重复行。
2. **接回 id 污染**:SessionStart hook 的 runs 目录按 `<project>_<iid>` 键控,评审会话挂同一个 hook 会覆盖写码会话的 `--resume` id。解法:评审会话**不挂 hook**,MVP 无接回(spec 已如实标注)。
3. **评审会话越权**:提示词/剧本/阶段规范三处写死禁 merge、禁状态、禁改码;Rust 侧评审路径零状态写入。剩余风险是模型不听话——人仍是 gate,评审意见只是证据。
4. **Mock 远端**:`open_mr_for_branch` 在 Mock 上恒 `None`,评审在无真远端的测试环境会如实拒绝「没有可评之物」——这是正确行为,不造假路径。
5. **CI workflow 在 secret 配好前不生效**:`CLAUDE_CODE_OAUTH_TOKEN` 由人本机 `claude setup-token` 生成并配进仓 secret,Claude GitHub App 也由人装;落文件本身零副作用,配好前 action 只会失败在认证一步,不产假 review。参数以 claude-code-guide 对官方文档的核实为准,不照抄外来草稿。(2026-08-28 已配齐:App 装好、token 生效,安装分支的首场 run 成功。)
6. **【拍板后撤销】每晚兜底 sweep**:曾按拍板落地(`claude-pr-sweep.yml`,确定性筛选判据对真仓 dry-run 命中 #116),同日发起人定调撤销——评审已随 CI 事件驱动每 PR 出评论,机器人巡扫是第二条路径;评审 run 失败在 PR 检查上显红、人 re-run 即补,不是静默漏。存量与被防篡改跳过的 PR 手动 `@claude` 兜。留痕不留文件。
7. **【已撞、已解释】改 workflow 文件的 PR 上评审被有意跳过**:action 有防篡改校验——`pull_request` 触发时,PR 分支上的评审 workflow 必须与默认分支**逐字节一致**才真跑,否则 skip(防 PR 改 workflow 给自己放水;官方明说首次加/改这份文件的 PR 上属正常)。所以 PR #132 自己吃不到这场评审,首场真实评审发生在**合入后的下一条 PR**。另:`/install-github-app` 已把它生成的同路径文件合进 main,本分支解冲突时按「不留双路径」保留核实版(fork 守卫 + 钉 sonnet),合入即成唯一正本。

## 完成的定义

spec 的 R1~R5 全绿;门禁全过;原型能点;`review_briefing` 能读回评审提示词(含剧本与阶段规范路径);commit 分件、不 push。
