# docs/06-module/ — 模块实现心智模型

> 30 秒导读:这一层是**单个模块怎么实现**的心智模型补充。`architecture.md` 给整体用户旅程(用例)+ 逻辑模块划分;本目录给每个模块的实现心智——设计面对的**主要矛盾和取舍**,不纠结实现细节。对用户产生价值的特性描述在 `docs/05-features/`。分层正本见 [`../01-principles/01-document-organization.md`](../01-principles/01-document-organization.md)。

当前阅读以 [architecture](../architecture.md) 标出的 Electron 边界为准；旧 Rust 集中读写口、嵌入 Orca 的会话路径和发版实现不作为本分支事实。迁移时按六环更新对应模块，不整篇继承旧方案。

## 装什么

每个模块一篇(`.md`),讲:

- 这个模块的**实现心智模型**——怎么理解它的内部结构、关键概念、数据怎么流。
- 设计面对的**主要矛盾**和**取舍**——为什么这样选、放弃了什么、卡点认了什么。

## 不装什么

- 代码路径清单、数据 schema 字段、“没建”流水——那是实现细节,不在这层(看代码或 `architecture.md` 的逻辑模块表；新架构决策按实际需要记录)。
- 整体旅程和模块划分——在 [`../architecture.md`](../architecture.md)。
- 用户价值特性——在 [`../05-features/`](../05-features/)。

## 三层边界

| 层 | 回答什么 |
|---|---|
| [`docs/architecture.md`](../architecture.md) | 整体用户旅程(用例)+ 逻辑模块划分 |
| `docs/06-module/`(本层) | 单个模块的实现心智模型 + 主要矛盾/取舍 |
| [`docs/05-features/`](../05-features/) | 对用户产生价值的特性 |

## 命名

一篇一个模块,文件名用模块的短名(跟 `architecture.md` 逻辑模块表对齐)。模块新增或大改时补一篇;小修不进。
