# STATUS — 经 WeLink 群发起评审（welink-review-invite）

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-28）**：特性随 [#199](https://github.com/forcegravity1989/builder-workbench/issues/199) v0.8|G3 立项（owner 2026-10-28 定序：本特性为 issue 第一件事，先设计送审再落地）。intent / spec / 原型草案已写，**意图与规格 gate 均待人确认**；实现未开工。owner 已定五条（2026-10-28，记入 spec 取舍）：评审对象＝特性材料评审；通道＝助手服务（welink-cli 个人账号为认可备选）；群配置＝`.bw/project.toml [chat]`；落地范围＝只发起；入口＝任务屏 Issue 行「更多操作」（首稿版本工作区入口经 owner 纠正改定，不新建页面）。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ◐ | intent.md 草案送审（2026-10-28）；意图 gate 待人确认 |
| 2 spec | ◐ | spec.md 草案含验收点 W01–W06 与旅程 WJ01、可点原型（prototype.html，任务屏 Issue 行入口示意，演示假体）；规格 gate 待人确认 |
| 3 实现设计 | ○ | 未开工；实现前须在 [architecture](../../architecture.md) 定位用例哪一站 |
| 4 TDD | 待建 | 计划看护：消息组装、`[chat]` 配置解析两类核心函数；新增例数按 ratchet 同交付内对冲 |
| 5 验收点E2E | 待建 | W01–W06 已定义（spec 验收表），未注册 |
| 6 旅程E2E | 待建 | WJ01（配置群与服务 → 工作区发起 → 真实测试群读回群助手消息 → 链接打开材料）已定义、未注册 |
