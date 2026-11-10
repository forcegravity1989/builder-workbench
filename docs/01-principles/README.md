# 01-principles/ — 原则（慢变）

> **地位**：本目录是**整仓最重要的原则正本**。人和 Agent 的入口（`AGENTS.md`、`CLAUDE.md`）都挂了这里——开特性、改主张、写文档之前先对齐，不得用草稿实现推翻。

> **维护**：本篇只导航各原则的职责与读取顺序；原则分工或入口变化时同步。规则正文由对应篇维护，不在此复制。

本目录放**很少改、改了要拍板**的仓库原则。

| # | 篇 | 管什么 |
|---|---|---|
| 01 | [`01-document-organization.md`](01-document-organization.md) | 整仓知识分层、特性制品归属、文档头部与唯一正本；兼容过程工具 |
| 02 | [`02-working-backwards.md`](02-working-backwards.md) | 逆向工作法与特性 intent/spec；原型后最终对齐、仓外 plan 与自主交付；六环链与带入三问 |
| 03 | [`03-press-release-faq-flywheel.md`](03-press-release-faq-flywheel.md) | **整个产品**的新闻稿、外/内 FAQ、飞轮（主张正本） |

## 特性怎么开

1. 对齐 **03**（主张 / 飞轮检验）  
2. 按 **02** 写 `05-features/<id>/intent.md` + 带原型的 `spec.md`  
3. 分层与粒度听 **01**；过程工具形成的正式意图和规格写回所属特性，实现 plan 按 02 留仓外

细则入口表见 [`AGENTS.md`](../../AGENTS.md)「按任务读取」。

> 工程设计听 [`docs/architecture.md`](../architecture.md)；开发规矩听 [`AGENTS.md`](../../AGENTS.md)。**文档分层**听 01；**特性怎么立项**听 02；**产品对外主张与飞轮**听 03。
