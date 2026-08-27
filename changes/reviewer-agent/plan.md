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

## 完成的定义

spec 的 R1~R5 全绿;门禁全过;原型能点;`review_briefing` 能读回评审提示词(含剧本与阶段规范路径);commit 分件、不 push。
