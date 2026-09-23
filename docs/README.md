# docs/ — 全仓文档地图

> **本篇维护约定**：给寻找知识落点的人与模型看；开始查资料、迁移文档或调整入口时读取。只列现行入口、职责与读取时机，不复制正文规则、能力清单或开发命令。结构为仓根入口、知识分层、其他资产；路径或职责变化时更新。分层正本是 [原则 01](01-principles/01-document-organization.md)，维护流程是 [AGENTS](../AGENTS.md)，具体格式读目标原文头部。

## 仓根入口

| 入口 | 什么时候读 |
|---|---|
| [README.md](../README.md) | 首次了解产品、当前能力与快速开始；这是给人看的仓库门面 |
| [AGENTS.md](../AGENTS.md) | 模型或开发者开始任务、维护文档、提交与开 PR |
| [CLAUDE.md](../CLAUDE.md) | 对应工具导入 AGENTS，无独立规则 |
| [CONTEXT.md](../CONTEXT.md) | 解释领域词、区分容易混淆的概念，或维护命名 |

## 知识分层

| 路径 | 职责 | 什么时候读 |
|---|---|---|
| [01-principles/](01-principles/README.md) | 01 文档分层、02 逆向工作法、03 产品主张/FAQ/飞轮 | 调整知识归属、开特性、改产品主张 |
| [architecture.md](architecture.md) | 整体旅程、逻辑模块、Electron 叠层与数据流 | 找现行设计、实现边界和工程落点 |
| `02-adr/`（预留，当前无文件） | 难回头的架构决策及取舍 | 后续迁移产生新决策时记录；历史查 Git |
| `03-guide/`（预留，当前无文件） | 给用户的操作、结果、下一步 | 后续按已验证的 Orca 旅程补齐 |
| [04-design-system/](04-design-system/README.md) | 视觉规范、样式与 token；来源和镜像方式见该入口 | 设计或修改界面视觉 |
| [05-features/](05-features/) | 特性 intent/spec/plan/状态；当前仅保留 [reviewer-agent](05-features/reviewer-agent/STATUS.md) 与 [version-planning](05-features/version-planning/STATUS.md) | 迁移时重新决策并按 [六环](01-principles/02-working-backwards.md#62-六环交付链)补齐；保留不等于 Electron 验收通过 |
| [06-module/](06-module/README.md) | 模块实现心智、主要矛盾与取舍 | 修改某一模块前 |
| [10-reference/](10-reference/) | 外部资料提炼与历史参考，按篇区分现行/历史 | 追溯来源或理解旧概念，不作为当前实现证据 |
| [hifi/](hifi/) | 屏幕版式与旅程原型 | 对照交互设计；原型不是已交付界面 |

模型从 AGENTS 的任务路径到达这里，再读目标文件原文头部和正文；到达链接不等于读取，更不等于已遵守。产品目标与当前实现冲突时，分别回到 03 与 architecture 核对，不能把主张或原型改写成已经交付。

## 其他资产

| 路径 | 定位 |
|---|---|
| [workbench-start](../.claude/skills/workbench-start/SKILL.md) | BW 自己的开发与交付方法；按任务分流，知识定义与治理 Skill 共用 |
| [project-knowledge](../.claude/skills/project-knowledge/SKILL.md) | 项目知识整改、只读全景与反哺方法；当地已认可规范优先，逐块清理存量 |
| [ref/](../ref/upstream.md) | 按需读取的 Orca 工程参考；修改对应执行核、协议或同步上游时读，不覆盖 BW 产品正本 |
| [standard/](../standard/README.md) | Workbench 给被管项目提供的规范资产，不等于本仓研发知识库 |
| `src/renderer/src/workbench/` | Workbench Electron 叠层（导航、计划三屏、项目墙）；工程验证读 AGENTS |
| `config/scripts/`、`scripts/` | Orca 构建检查与 BW 开发辅助脚本；实际入口以 AGENTS / package.json 为准 |
| `.bw/` | 本项目的约定和计划等仓内材料；具体以在用文件为准，不把 main 的 release 工具链视为已迁入 |

变更原因与验证证据查 commit/PR，历史查 Git；设计直接读 architecture，不另设仓根设计指针或变更流水。
