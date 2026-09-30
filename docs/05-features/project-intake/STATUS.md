# STATUS — 纳入项目与项目信息记录

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-09-29）**：补登记特性——能力已实现在用（v0.5 收尾期），链文档按 02 §6.3 补齐中；intent 草案已入仓，**待人 gate**（待决问题清单见 intent 末节）。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | 草案在本目录 [intent.md](intent.md)，待 gate；带入来源 = 2026-09-29 用户拍板补登记 |
| 2 spec | ○ | intent 过 gate 后开写；现行行为依据暂散落 architecture 用例表与源码（落点清单见 intent 文末） |
| 3 实现设计 | ◐ | architecture「打开或接入项目 / 查看项目概况」与 06-module/桌面壳 有散落记录，无特性级 design |
| 4 TDD | ◐ | 合规存量：project-charter（toml 解析/回写/简写归一化）、workbench-wall-projects（组聚合喂数据作用域推导；2026-09-30 环 4 盘点删远端链接/回退标签展示例）；project-page-state 等 UI 页面态测试已随 PR #282 裁剪 |
| 5 验收点E2E | ○ | 待 spec 定验收点后逐项注册；暂无以「看见有用例」反推的覆盖 |
| 6 旅程E2E | ○ | 候选主旅程 =「接入项目 → 墙上见名片 → 切换进总览 → 重启读回一致」，待 spec 定稿注册后真壳执行 |

**已知债**：**名片 toml 仅写本地工作区，未经 PR 落被管仓并由 builders 合入**——main v0.4 为已交付行为（`crates/bw/src/app/project.rs`：名片写项目约定树 + `push_and_open_mr` + Issue 转 InReview + 未合入横幅提示；已有名片 adopt 只补空字段），bw-orca 迁移中丢失；2026-09-29 用户确认为必要旅程（否则后来者重复建名片起 PR），进 spec 必做与验收点，实现在 Orca 上重新决策。项目约定完整旅程的其余部分（常驻 worktree、运作自动化随接入写入）暂不在本特性范围；墙卡版本/周目标/健康为占位 Unknown（用户拍板暂不细设计）；接入无可写性专门探测，名片写失败只记「可稍后补」且暂无补录入口（main 的 EditProjectCard 命令即补录正本，随 toml PR 化一并进 spec）。存量旧仓无需补录（v0.4 起已有 toml、字段为 `opportunity`，经 v0.4.0 `crates/bw/src/repo/project_file.rs` 核实；bw-orca 读取端另兼容更早的 `north_star` 字段，属历史数据、与 v0.4 主线无关）；克隆中断残留暂不处理，看实际用户反馈。
