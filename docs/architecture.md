# architecture.md — Workbench 设计正本

> **30 秒导读与维护约定**：给判断产品旅程、接手模块与维护知识的人和模型读取。只写 BW 整体用例、逻辑能力、Electron 叠层与数据流；结构为 §1 旅程 → §2 能力 → §3 实现与待迁移边界。整体旅程、能力或实现边界变化时更新。开发规则见 [AGENTS](../AGENTS.md)，模块取舍见 [06-module](06-module/README.md)，视觉与原型见 [设计系统](04-design-system/README.md) / [hifi](hifi/)，产品主张见 [原则 03](01-principles/03-press-release-faq-flywheel.md)。不写开发流水或把原型当已交付能力。

本篇描述主干 `main`（原 `bw-orca`，2026-09-30 扶正）的 Orca Electron 路线。旧 Rust 版本已退出主干、归档为 `archive/main-pre-orca`，可以提供用户意图和历史证据，不能直接证明这里已经交付。当前能力按源码边界描述，实际可用性仍需对应特性的真壳验收。

## §1 · 用例与旅程

### 顶层旅程 · 五站

**项目版本 → 构建交付 → 治理 → 反馈 → 进化**是产品目标，主张以原则 03 为准。五站不是五个已完成模块；导航也不是验收结果。当前导航为总览、计划、任务、验收、自动化、知识库，另有项目墙、接入和设置入口。

### 当前入口与边界

| 用户要做的事 | 当前承载 | 当前边界 |
|---|---|---|
| 打开或接入项目 | 项目墙、接入覆盖层与 Orca 仓库列表 | 名片保真合并只补空字段、坏文件不覆盖；经固定分支 `bw/project` PR 合入被管仓、克隆前远端预探测与同远端去重已实现（真实远端未验）。G3 跨主机：项目墙只上能读到 `.bw/project.toml` 的项目并按项目/主机稳定身份归并（同一项目多主机一张卡、重复添加不重复计数），「导入 Builder 主机」批量壳只调用 Orca 原生配对，Orca Projects 侧栏保持原生全量、不接受 BW 过滤（原叠层收窄过滤已回退）；行为判据见 [project-intake spec](05-features/project-intake/spec.md)「§5 跨主机与项目墙」；旧 Rust 的项目约定常驻 worktree + Issue 运作完整旅程不在范围 |
| 核对结果、拟目标、拆版本工作 | 计划屏：原生 terminal 固定工作区 + 右侧材料单页 | 经材料 RPC 读写 `.bw/planning/<版本>/`；开工注入渲染后 SYSTEM 与 week-planning Skill 指针，来源和覆盖边界见 §2 ③ |
| 核对交付、出包、逐目标验收、归档 | 验收屏：与计划共用容器，独立固定树 bw/week-acceptance；出包区块按项目远端自动对接出包流水线（CodeHub 执行面→cloudbuild CLI、制品面→CloudDragon 会话，GitHub→gh CLI），界面不区分宿主 | 旅程灯只读模型写入材料的 workflow.stage（「出包」灯例外，随出包区块读到的真实制品包点亮）；归档 PR 合入状态按 archivePr 薄读取，CodeHub 等读不到状态一律保持未知，正文编辑延期 |
| 执行工作与管理任务 | Orca 终端、Tasks、worktree | 复用执行核；不能据规划会话可打开就认定所有 Issue 开工都已接 BW 纪律 |
| 设置定时工作 | Orca Automations | 调度能力在执行核；「配置自动化」入口（右板页头）打开原生编辑器：已登记条目直接编辑，未登记预填创建；BW 提示词随进屏覆盖同步为当前版本、用户设置保留，启用与时间由人确认；真实到点触发与旧自动配置迁移须逐项验证 |
| 查看项目概况 | 总览与项目墙 | 总览已接北极星、业务/项目指标两区与各版本当前材料，正式内容统一读主检出（主干本地镜像）并标注来源；页头「更新代码」是唯一同步入口（快进主检出后重读快照）。项目墙卡片给四项只读事实读数（版本/承诺进展/在跑会话/PR 待审，现算三态、无健康灯），任务明细归总览。业务按特性及引领/滞后关系展示，项目读取提交及合入 PR/MR 趋势，开放 Issue 只显示当前快照。缺数据保持 Unknown；真实数据与 Electron 旅程待验，见[总览指标 STATUS](05-features/overview-metrics/STATUS.md) |
| 查看和编辑项目知识 | 知识库文档、代码、对账页签 | 文档树与正文已读真实仓库；代码页仍为占位，对账与建议仍有固定演示数据；保存和来源边界见 §3 |
| 独立评审、出包与发布 | 保留的 reviewer-agent / version-planning 资料、现有 Orca 构建工具 | Electron 的 BW CI/CD、评审与正式交付链待对应任务迁移验证；旧 Rust Release/出包按钮与 ADR 不作为本分支操作说明 |

迁移不是把旧八屏逐屏翻译。每个特性先确认在 Orca 上服务谁、完成什么事，再按 [原则 02 §6.2–6.3](01-principles/02-working-backwards.md#62-六环交付链)补齐旅程与证据。旧 ADR、指南和未保留的特性文档已清理；后续按真实决定补，不从旧 main 整体恢复。

## §2 · 能力与责任

以下是逻辑能力划分，不以模块数量计算产品特性。

### ① 关键信息维护（事实层）

Issue 原生状态与关闭原因是处理结果正本，版本目标和任务关联由仓内计划 JSON 承载，项目约定由 `.bw/project.toml` 承载。完成由人确认、未知不装健康等要求以 AGENTS 四铁律为准。旧 Rust 的集中读写口、现算类型与指标采集实现不能直接描述当前 Electron；模块取舍见 [关键信息维护](06-module/关键信息维护.md)。

### ② 会话与执行（执行层）

计划与验收完整复用 Orca 原生会话工作区：顶部新建会话和 Agent 控件、标签/分屏、资源管理器、智能体历史及可收起的工具侧栏均由 Orca 拥有。左侧保留 BW 导航，其下与其他页一样显示项目列表。BW 只在右侧提供业务板：计划屏启动入口是目标区空板卡「与计划助手新建计划」（唯一会话发起入口，仅无计划时显示），验收屏首行协作卡片保留“新建验收”；分支名与“配置自动化”入口在页头（一次性配置不占每周主操作区），原生标签栏不加 BW 按钮；不另建聊天、历史或会话绑定。进入计划/验收只准备并选择固定工作树，回显原生 terminal 和材料；进屏不做任何 Git 动作。页头「更新代码」是唯一同步入口：把本屏固定树快进到主干最新并重读材料，执行期间材料只读；快进不了（分叉、远端不可达等）保持原样、仅通知、不残留横幅、不换数据源，统一提示交会话模型处理；启动入口调用已登记自动化的手动运行，普通原生新建不注入业务提示。数据文件问题作为一次性上下文随同一次手动运行合并递交（不另建会话、不覆盖保存的提示），模型先说明方案经用户确认再改数据；归档与拆解直接在会话中发起，页面不贴终端草稿；验收屏旅程灯只读模型写入材料的 workflow.stage，计划屏自 G3 起不渲染灯（stage 契约不变）。“配置指标”使用独立 bw/metrics-refresh 工作树。真实执行证据仍需逐项核对。详见 [会话与执行](06-module/会话与执行.md)。

### ③ 系统提示词与渐进加载（执行规范）

`standard/` 保存 BW 的提示词、reference、技能与样例。`version-cycle/cycle-prompt.ts` 在计划/验收/指标配置开工时渲染内置 SYSTEM.md.tmpl 并内嵌对应 Skill 发现 Stub（week-planning / version-acceptance / metrics-refresh；Stub 投影位于根级 `skills/`，正源在 `standard/skills/`），完整指南与 reference 经 `ORCA skills get` 命令按需读取；模板占位符未解析即抛错。提示资产随产品打包，没有 `standard/` 的普通被管项目也能获得完整提示。路径存在、递交指针、模型读取正文和遵守规范是四种证据。

完整维护对照和缺口见 [系统提示词与渐进加载](06-module/系统提示词与渐进加载.md)；正文职责见 [standard/README](../standard/README.md)。修正文不等于修复运行时分发。

### ④ 技能与提炼（规范与方法）

`standard/skills/` 是给被管项目的业务执行规范；`.claude/skills/` 是 BW 自己的开发方法；Orca 根级 `skills/`、`skill-guides/`、`skill-stubs/` 有各自的能力分发用途。它们不因都叫 Skill 就合成一个知识库或共享一套打包承诺。技能提炼目标尚不能以技能列表存在证明。详见 [技能与提炼](06-module/技能与蒸馏.md)。

### ⑤ 桌面壳（交互层）

`src/renderer/src/workbench/` 承载 BW 导航、计划/验收两屏、总览、项目墙、接入与知识库；Orca 执行面在原组件中复用。主进程 / preload 提供文件、窗口和会话能力。详见 [桌面壳](06-module/桌面壳.md)，逐项源码清单见 [INVENTORY](../src/renderer/src/workbench/INVENTORY.md)。

## §3 · 实现架构与数据流

### Orca 执行核与 BW 叠层

Orca 执行核提供终端、会话、worktree、Tasks、Automations 和 Explorer。BW 叠层通过 `WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1` 启用。壳内槽位：总览=activity 槽 OverviewPage（真实数据），任务=tasks 槽原生 TaskPage，计划/验收=artifacts 准备入口 → 原生 terminal 固定工作区旁的 `CycleWorkspaceShell` 右板（`cycle-view-state.ts` 仅指明准备流程，侧栏两个独立入口，不扩 TopLevelView union），自动化/知识库照旧。叠层外改动保持明确钩子边界；上游身份和同步纪律见 [ref/upstream](../ref/upstream.md)，不要将 BW 的 `origin/main` 合并当作 Orca 升级。

BW 的业务契约在 `src/shared/workbench/`，材料事务、指标与历史 runtime 及宿主适配在 `src/main/workbench/`，界面在 `src/renderer/src/workbench/`；`src/relay/workbench/` 只在原生 SSH relay 上调用同一材料事务。主 RPC 方法族为 `workbench.materials.*`（材料事务读写）与 `workbench.metrics.{list,read,refresh}`、`workbench.history.{list,read,readPlan}`、`workbench.archive.prStatus`（注册在 `src/main/runtime/rpc/methods/workbench-*.ts`）；SSH 宿主的采集与历史命令走窄执行器 `workbench.metrics.execute` / `workbench.history.execute`，不扩 provider.exec 白名单。Orca RPC/CLI 注册处及 relay 组合入口保持薄挂载，工作树、连接、调度和会话内核不承载 BW 业务。Web/配对是访问方式，SSH/WSL 是执行位置，均复用原生身份与路由；不另加本机专属开关。

产品知识继续在 `docs/`，Orca 工程参考按需读 `ref/`。`ref/` 不覆盖产品原则；旧 `crates/` 不存在于现行分支。

### 版本材料与选版

计划/验收两屏经 `workbench.materials.*` RPC 与 `ORCA bw materials` CLI 读写固定工作树的 `.bw/planning/<版本>/` 材料，共用同一材料事务核心（version-document-store：expectedRevision、跨进程互斥、原子替换）；会话内的模型经 CLI 操作同一份材料，旧 planning.py 写入器已退役删除。流程选版是原生 worktree 偏好 `workbenchSelectedVersion`（main/workbench/version-selection.ts），context 只读、select 只写偏好，CLI 与 UI 共享；不按会话标题、日期或上次打开项推断版本。验收屏旅程灯只读材料的 `workflow.stage`（模型每完成一阶段写入，灰/绿两态；验收屏「出包」灯例外，随出包区块读到的真实制品包点亮），计划屏自 G3 起不渲染灯（stage 仍供会话校准）；归档 PR 合入状态按材料记录的 `workflow.archivePr` 薄读取。两屏共用自动保存、TaskPort 单项 Issue 读回和归档状态读取链；目标卡骨架按屏分叉（计划屏 G3 PlanningGoalCard、验收屏 VersionGoalCard 只读骨架）；页面不再维护独立全量任务区，归档后可继续编辑原材料；这不是另一份 Issue 状态正本。完成、合入与发布仍需人决定。

### 知识库材料

`knowledge-repo-loader.ts` 与 `use-knowledge-repo.ts` 从 `activeRepo.path` 扫描、分类和读写文档；当前编辑保存直接写该路径下的文件，没有自动创建评审工作树或 PR。选中的执行 worktree 不会自动改变该来源。若注册的是其他分支的检出目录（如 `archive/main-pre-orca` 旧 main 归档），知识页仍读该目录下的文档，而非当前执行会话的工作树。

分类走内置规则，规则并不覆盖全部 `ref/` 工程参考；单仓分类地图（`.bw/knowledge-map.toml`）能力已删除，归知识库独立特性重新决策。`skills/bw-knowledge-docs` 是被管项目侧剧本，不等同于仓内 project-knowledge 的治理方法。代码页、对账及建议中的演示项不是真实扫描结论。

### 随特性迁移重新决策的边界

- 知识库保存怎样遵守分支 / PR 评审、来源如何随项目与工作树变化、Orca 工程参考如何在现有分类下可见，以及对账如何获得真实证据。
- BW 规范从产品资产到被管项目会话的可达路径、模板渲染与实际加载证据。
- 健康信号与真实指标、反馈与进化、独立评审和正式交付链。

以上是待迁移边界，当前知识基线清理只校准说明与入口，不修改运行时。每项由对应特性任务按六环重新决策和验证，不能把本篇的说明修订当成实现已完成。

## 版本协作与指标边界

三个特性已接入生产入口：[版本计划](05-features/version-planning/design.md)、[版本验收](05-features/version-acceptance/design.md)、[总览指标](05-features/overview-metrics/design.md)。BW 拥有版本材料、目标/验收业务与指标服务；Orca 保持会话、任务详情/编辑、工作树、调度和 provider 正本，通过薄适配复用（原生文件扩点清单见 [ref/upstream](../ref/upstream.md)），不在各屏分别建任务编辑器、会话存储或采集器。业务指标仅采用按日/周可回溯的脚本，源数据及存储由用户项目或服务负责；目录同步最新已合入来源，每次采集固定本次来源，旧计划与验收证据原样留查。“配置指标”每次在固定维护树中新建原生会话并进入该会话。该指标闭环已接入；SSH/WSL 与配对实机、真实到点自动化、真实 provider 归档全链和 Electron 旅程的验证边界见各特性 STATUS，源码接入不能代替验收。
