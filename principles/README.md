# principles/ — 原则（慢变）

> **地位**：本目录是**整仓最重要的原则正本**。人和 Agent 的入口（`AGENTS.md`、`CLAUDE.md`）都挂了这里——开特性、改主张、写文档之前先对齐，不得用草稿实现推翻。

本目录放**很少改、改了要拍板**的仓库原则。

| # | 篇 | 管什么 |
|---|---|---|
| 01 | [`01-document-organization.md`](01-document-organization.md) | 整仓知识/文档怎么分层；`changes/` 少 gate（intent + 带原型的 spec；plan 仅大风险；小修直修）；兼容 Superpowers / grill-me |
| 02 | [`02-working-backwards.md`](02-working-backwards.md) | 产品开发方法：逆向工作法；特性级 intent/spec；对齐 03 飞轮检验 |
| 03 | [`03-press-release-faq-flywheel.md`](03-press-release-faq-flywheel.md) | **整个产品**的新闻稿、外/内 FAQ、飞轮（主张正本） |
| 04 | [`04-ai-native-sdlc.md`](04-ai-native-sdlc.md) | 研发过程原则（AI-Native SDLC playbook 提炼）：产物链、六阶段做法、治理哲学、明确不采纳的 |

## 特性怎么开

1. 对齐 **03**（主张 / 飞轮检验）  
2. 按 **02** 写 `changes/<id>/intent.md` + 带原型的 `spec.md`  
3. 分层与粒度听 **01**；Superpowers / grill-me **可用**，产出落回 `changes/`，不当第二正本  

细则入口表见 [`AGENTS.md`](../AGENTS.md)「特性起手路径」。

> 工程设计听 [`docs/architecture.md`](../docs/architecture.md)；开发规矩听 [`AGENTS.md`](../AGENTS.md)。**文档分层**听 01；**特性怎么立项**听 02；**产品对外主张与飞轮**听 03；**研发过程的方法来源与取舍**听 04。
