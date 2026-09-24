# STATUS

> **30 秒导读**：宠物（pet）特性的链状态正本。**draft**——2026-09-24 由发起人口头拍板「做」，intent / spec 草案同日入仓待认；代码未动。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 与矩阵」。

## 链状态（六环）

| 环 | 状态 | 证据 / 已知债 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md) 草案（五大拷问 + 新闻稿式 + 4 个开放问题）；**待意图 gate**——聊过 ≠ 过 gate |
| 2 spec | ◐ | [spec.md](spec.md) 草案：设计拍板 / 操作逻辑 / 可点原型链接 / 客户会问 / 硬核挑战 / 要求与验收；**待规格 gate**；指标不挂（按「不强求」口径） |
| 3 实现设计 | ○ | spec「实现落点」已在 [architecture](../../architecture.md) §2 ⑤ 桌面壳 / §3 三 crate 上定位；未动代码、06-module 未回写 |
| 4 TDD | ○ | 义务已列（spec R3：Codex 宠物包解析的好包 / 坏包 / 尺寸错 / 路径穿越四类单测；R1 派生规则单测）；未建 |
| 5 验收点E2E | ○ | spec「验收点 ↔ 用例」已定义 4 条用例名与 suite 归属（`pet`）；未注册、未实现 |
| 6 旅程E2E | ○ | spec 定义 1 条深链旅程（`pet-journey`）；未注册、未实现 |

## 记录

- 2026-09-24 · 发起人在会话里问「Orca 自身有宠物系统吗？没有就把 Clawd 集成进去，同时把 Codex 的宠物包打进去」。调研结论写进 intent「先回答那个问题」：Orca 无宠物；Claude Code `/buddy` 已于 v2.1.97 下线；Codex Pets 为开放格式但内置资产在 OpenAI CDN、不在 Apache-2.0 仓内。据此起草 intent / spec / 原型，入仓待认。发起人提到的分支 `claude/bw-pet-setup-f3cf33` 远端不存在，本次未能读到其先前内容。
- 2026-09-24 · 推 PR 前 subagent 自检：无 blocker；按其意见收口 intent 承诺与 spec 一致（Codex 皮肤只读本机缓存）、实现细节退回 spec、补「如何获得」、R7 门禁清单对齐 AGENTS、目录名由 pet-companion 改 pet（companion 正是 Orca 手机 App 的词）。**未直接核实、已标注**：Codex Pets 官方文档原文（developers.openai.com 本次打不开，转述自搜索摘要）、Codex App 是否有独立形象窗、Orca 源码仓（接入被拒）。
- 待人拍的四件事见 intent「开放问题」；其中「Codex 八只资产是否随包分发」直接决定 spec 拍板 3 与验收 R4。
