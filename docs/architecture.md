# architecture.md — Workbench 设计正本

> **30 秒导读与维护约定**：给判断产品旅程、接手模块与维护知识的人和模型读取。只写 BW 整体用例、逻辑能力、Electron 叠层与数据流；结构为 §1 旅程 → §2 能力 → §3 实现与待迁移边界。整体旅程、能力或实现边界变化时更新。开发规则见 [AGENTS](../AGENTS.md)，模块取舍见 [06-module](06-module/README.md)，视觉与原型见 [设计系统](04-design-system/README.md) / [hifi](hifi/)，产品主张见 [原则 03](01-principles/03-press-release-faq-flywheel.md)。不写开发流水或把原型当已交付能力。

本篇描述 `bw-orca` 的 Orca Electron 路线。`main` 的 Rust 版本仍服务用户，两者不是同一套实现；旧 main 可以提供用户意图和历史证据，不能直接证明这里已经交付。当前能力按源码边界描述，实际可用性仍需对应特性的真壳验收。

## §1 · 用例与旅程

### 顶层旅程 · 五站

**项目版本 → 构建交付 → 治理 → 反馈 → 进化**是产品目标，主张以原则 03 为准。五站不是五个已完成模块；导航也不是验收结果。当前导航为总览、计划、任务、自动化、知识库，另有项目墙、接入和设置入口。

### 当前入口与边界

| 用户要做的事 | 当前承载 | 当前边界 |
|---|---|---|
| 打开或接入项目 | 项目墙、接入覆盖层与 Orca 仓库列表 | 接入可写工作区的 `.bw/project.toml`；尚未实现旧 Rust 的项目约定常驻 worktree + Issue + MR 完整旅程 |
| 核对结果、拟目标、拆版本工作 | 计划页签右侧原生三屏，左侧规划会话 | 读写 `.bw/planning/<版本>/data.json`；新建 Claude 会话解析 SYSTEM 与 week-planning 指针，文件来源和覆盖边界见 §2 ③ |
| 执行工作与管理任务 | Orca 终端、Tasks、worktree | 复用执行核；不能据规划会话可打开就认定所有 Issue 开工都已接 BW 纪律 |
| 设置定时工作 | Orca Automations | 调度能力在执行核；旧 BW 的周一、周五、每日采集自动配置须在迁移中逐项验证 |
| 查看项目概况 | 总览与项目墙 | 部分名片、计划材料来自仓文件；总览和健康展示仍含演示数据，不能当真实指标结论 |
| 查看和编辑项目知识 | 知识库文档、代码、对账页签 | 文档树与正文已读真实仓库；代码页仍为占位，对账与建议仍有固定演示数据；保存和来源边界见 §3 |
| 独立评审、出包与发布 | 保留的 reviewer-agent / version-planning 资料、现有 Orca 构建工具 | Electron 的 BW CI/CD、评审与正式交付链待对应任务迁移验证；旧 Rust Release/出包按钮与 ADR 不作为本分支操作说明 |

迁移不是把旧八屏逐屏翻译。每个特性先确认在 Orca 上服务谁、完成什么事，再按 [原则 02 §6.2–6.3](01-principles/02-working-backwards.md#62-六环交付链)补齐旅程与证据。旧 ADR、指南和未保留的特性文档已清理；后续按真实决定补，不从 main 整体恢复。

## §2 · 能力与责任

以下是逻辑能力划分，不以模块数量计算产品特性。

### ① 关键信息维护（事实层）

Issue 与标签是工作状态正本，版本计划内容由仓内 JSON 承载，项目约定由 `.bw/project.toml` 承载。完成由人确认、未知不装健康等要求以 AGENTS 四铁律为准。旧 Rust 的集中读写口、现算类型与指标采集实现不能直接描述当前 Electron；模块取舍见 [关键信息维护](06-module/关键信息维护.md)。

### ② 会话与执行（执行层）

复用 Orca 的终端、agent、Tasks、Automations 与 worktree。计划页签左侧创建或接回规划会话；新开会话才递交 BW 提示，接回不重递交。能打开窗口、能找到工具和已经完成真实执行分别取证。详见 [会话与执行](06-module/会话与执行.md)。

### ③ 系统提示词与渐进加载（执行规范）

`standard/` 保存 BW 的提示词、reference、技能与样例。当前 `plan-week-planning-prompt.ts` 只在规划工作树和主项目中查找文件，向新建 Claude 会话提供存在的绝对路径；被管项目没有这些文件时会缺指针。它没有把整套资产随安装包派发，也没有在此入口替换 `SYSTEM.md.tmpl` 的占位符。路径存在、递交指针、模型读取正文和遵守规范是四种证据。

完整维护对照和缺口见 [系统提示词与渐进加载](06-module/系统提示词与渐进加载.md)；正文职责见 [standard/README](../standard/README.md)。修正文不等于修复运行时分发。

### ④ 技能与提炼（规范与方法）

`standard/skills/` 是给被管项目的业务执行规范；`.claude/skills/` 是 BW 自己的开发方法；Orca 根级 `skills/`、`skill-guides/`、`skill-stubs/` 有各自的能力分发用途。它们不因都叫 Skill 就合成一个知识库或共享一套打包承诺。技能提炼目标尚不能以技能列表存在证明。详见 [技能与提炼](06-module/技能与蒸馏.md)。

### ⑤ 桌面壳（交互层）

`src/renderer/src/workbench/` 承载 BW 导航、计划三屏、项目墙、接入与知识库；Orca 执行面在原组件中复用。主进程 / preload 提供文件、窗口和会话能力。详见 [桌面壳](06-module/桌面壳.md)，逐项源码清单见 [INVENTORY](../src/renderer/src/workbench/INVENTORY.md)。

## §3 · 实现架构与数据流

### Orca 执行核与 BW 叠层

Orca 执行核提供终端、会话、worktree、Tasks、Automations 和 Explorer。BW 叠层通过 `WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1` 启用。叠层外改动保持明确钩子边界；上游身份和同步纪律见 [ref/upstream](../ref/upstream.md)，不要将 BW 的 `origin/main` 合并当作 Orca 升级。

产品知识继续在 `docs/`，Orca 工程参考按需读 `ref/`。`ref/` 不覆盖产品原则；旧 `crates/` 不存在于现行分支。

### 计划材料

右侧三屏通过文件接口读写规划工作树的 `.bw/planning/<版本>/data.json`，会话用 `planning.py` 的 read / update / confirm 处理同一份材料。归档读主项目，已登记的同版本规划草稿可覆盖显示；这不是另一份 Issue 状态正本。完成、合入与发布仍需人决定。

### 知识库材料

`knowledge-repo-loader.ts` 与 `use-knowledge-repo.ts` 从 `activeRepo.path` 扫描、分类和读写文档；当前编辑保存直接写该路径下的文件，没有自动创建评审工作树或 PR。选中的执行 worktree 不会自动改变该来源。若注册的是 main 检出目录，知识页仍读 main 文档，而非当前执行会话的 bw-orca。

分类可由项目 `.bw/knowledge-map.toml` 指定；没有映射时走默认规则，规则并不覆盖全部 `ref/` 工程参考。`skills/bw-knowledge-docs` 指导这类映射，不等同于仓内 project-knowledge 的治理方法。代码页、对账及建议中的演示项不是真实扫描结论。

### 随特性迁移重新决策的边界

- 知识库保存怎样遵守分支 / PR 评审、来源如何随项目与工作树变化、Orca 工程参考如何在现有分类下可见，以及对账如何获得真实证据。
- BW 规范从产品资产到被管项目会话的可达路径、模板渲染与实际加载证据。
- 健康信号与真实指标、反馈与进化、独立评审和正式交付链。

以上是待迁移边界，当前知识基线清理只校准说明与入口，不修改运行时。每项由对应特性任务按六环重新决策和验证，不能把本篇的说明修订当成实现已完成。
