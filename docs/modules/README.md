# docs/modules/ — 特性模块自足设计索引

> **30 秒导读**:buddy 每个特性模块一份自足设计,固定六节(是什么 / 代码在哪几层 / 数据落哪 / 依赖什么 / 产出与验证 / 没建什么)。给要接手某模块的人看——凭一份就能认领。`DESIGN.md` 指向这里。

## 模块清单(16 份)

| 模块 | 是什么 | 主落点 |
|---|---|---|
| [codehub-issue-正本](codehub-issue-正本.md) | issue+标签=唯一正本、本地零库、共享重算 | `bw-v4/app/issue_store.rs` |
| [仓文件解析](仓文件解析.md) | `.bw/*` 五个解析器 + 章程模板 | `bw-v4/repo/` |
| [规范铺底](规范铺底.md) | 接入时把 standard/ 模板渲染进 `.bw/`(无会话) | `bw-v4/standard/bootstrap.rs` |
| [系统提示词与渐进加载](系统提示词与渐进加载.md) | 三段静态提示词 + 运行时剧本 + skill 索引 | `bw-v4/app/bootstrap.rs` |
| [command-event-与状态机](command-event-与状态机.md) | Command/Event + issue 状态机 + Done 入边守卫 | `bw-v4/command.rs` `model.rs` |
| [健康推导](健康推导.md) | Signal derive-only + recompute + Unknown≠绿 | `bw-v4/derive/` `app/health.rs` |
| [会话与执行](会话与执行.md) | 交互式 claude + PTY + worktree + settle-once | `v4-engine/interactive_cli.rs` |
| [远端与工具探活](远端与工具探活.md) | codehub/github/remote + 工具注册+探活调度 | `v4-engine/codehub.rs` `bw-v4/app/tools.rs` |
| [open-design](open-design.md) | OD 探活 + 内嵌标签 + 产物入仓约定 | `v4-engine/open_design.rs` |
| [项目群](项目群.md) | WeLink chat + 群通知 + 群摘要 | `bw-v4/chat/` `app/chat_notify.rs` |
| [桌面壳](桌面壳.md) | 九屏 + 内核桥 + VM + 主题 + 适配 + 三守卫 | `app-shell/` |
| [指标采集与读数](指标采集与读数.md) | 脚本/手填两类 + readings.jsonl + 现算 | `bw-v4/app/collect.rs` |
| [周循环与计划](周循环与计划.md) | 周窗口 + 六列看板 + 发版 + 现算 | `bw-v4/app/plan.rs` `ops.rs` |
| [资产盘点与项目接入](资产盘点与项目接入.md) | 盘点 + 历史回填 + project-handbook + 接入 | `bw-v4/app/backfill.rs` `project.rs` |
| [技能与蒸馏](技能与蒸馏.md) | skill 加载(10 份自带)+ 蒸馏(未建) | `bw-v4/standard/skills.rs` |
| [app编排与运行时](app编排与运行时.md) | dispatch 派发 + 守卫 + 回执 + 运行时零正本 | `bw-v4/app/mod.rs` `local/` |

## 边界切线(认领时按这个分,避免撞/漏)

- **issue 实体**:正本/标签映射/持久化 → codehub-issue-正本;内存态状态机/转移表 → command-event-与状态机。`issue.rs` 正本读写归前者,命令/转移归后者。
- **探活**:工具注册+探活调度+远端 → 远端与工具探活;PTY/执行器 → 会话与执行;OD 特例 → open-design。
- **skill**:加载/索引 → 系统提示词与渐进加载(讲怎么进提示词)+ 技能与蒸馏(讲 skill 体系与蒸馏);铺底编排 → 规范铺底。
- **编排层**:`app/mod.rs` dispatch + `progress.rs` + `local/` → app编排与运行时;各用例业务 → 各自模块。

## 没建什么(跨模块汇总,详见各篇"没建什么"段)

默认 workflow 打包、蒸馏、Open Design 壳侧适配、Cursor 适配、readings.jsonl 写入端、plan/→docs/ 迁移(代码锚点待更新)。不在本索引养第二份清单——要做就开 subagent 干。
