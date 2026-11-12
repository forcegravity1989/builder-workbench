# architecture.md — Workbench 设计正本

> **30 秒导读与维护约定**：给判断产品旅程、接手模块与维护知识的人和模型读取。只写 BW 整体用例、逻辑能力、Electron 叠层与数据流；结构为 §1 旅程 → §2 能力 → §3 实现与待迁移边界。整体旅程、能力或实现边界变化时更新。开发规则见 [AGENTS](../AGENTS.md)，模块取舍见 [06-module](06-module/README.md)，视觉与原型见 [设计系统](04-design-system/README.md) / [hifi](hifi/)，产品主张见 [原则 03](01-principles/03-press-release-faq-flywheel.md)。不写开发流水或把原型当已交付能力。

本篇描述主干 `main`（原 `bw-orca`，2026-09-30 扶正）的 Orca Electron 路线。旧 Rust 版本已退出主干、归档为 `archive/main-pre-orca`，可以提供用户意图和历史证据，不能直接证明这里已经交付。当前能力按源码边界描述，实际可用性仍需对应特性的真壳验收。

## §1 · 用例与旅程

### 顶层旅程 · 五站

**项目版本 → 构建交付 → 治理 → 反馈 → 进化**是产品目标，主张以原则 03 为准。五站不是五个已完成模块；导航也不是验收结果。当前导航为总览、计划、任务、验收、自动化、知识库，另有项目墙、接入和设置入口。

### 当前入口与边界

完整工作旅程围绕五类核心结果：[建立项目方向与阶段安排](03-guide/project-direction/README.md)、确定本版承诺并开工、把任务推进到可信交付、核对版本承诺并由人验收、根据真实效果调整后续工作。持续治理项目与复用已验证做法是两条建设中的长期旅程，不能据知识库、Skill 或定时入口存在就视为已可用。准备事项归 [BW 入门矩阵](04-design-system/guidance.md#bw-入门矩阵)，七条旅程及复用功能归[探索 BW 矩阵](04-design-system/guidance.md#探索-bw-矩阵)。走查先筛选并打磨基础功能，再串联完整旅程；各格分别记录引导、指南与传播覆盖，不代表完整旅程已经验收。

| 用户要做的事                     | 当前承载                                                                                                                                                                             | 当前边界                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 添加与打开项目                   | 项目墙与 Orca 原生添加                                                                                                                                                               | Git 仓和普通文件夹无需名片即可上墙；统一添加沿原生打开／克隆／新建并继续工作。本机个人／团队属性由人修改，不入仓；共享墙聚合前过滤个人来源，不撤回已打开工作区。墙和总览共用项目信息编辑器，负责人等名片字段沿 bw/project PR/MR，无远端沿原有本地保存；普通文件夹不新增名片保存链。原生分组、菜单与主机设置复用，具体行为和未验边界见 [project-intake spec](05-features/project-intake/spec.md)与 STATUS。    |
| 核对结果、拟目标、拆版本工作     | 计划屏：原生 terminal 固定工作区 + 右侧材料单页                                                                                                                                      | 经材料 RPC 读写 `.bw/planning/<版本>/`；开工预填一句指向完整 week-planning Skill 的请求，由用户发送，来源和覆盖边界见 §2 ③                                                                                                                                                                                                                                                                                    |
| 核对交付、出包、逐目标验收、归档 | 验收屏：与计划共用容器，独立固定树 bw/week-acceptance；出包区块按项目远端自动对接出包流水线（CodeHub 执行面→cloudbuild CLI、制品面→CloudDragon 会话，GitHub→gh CLI），界面不区分宿主 | 界面不设灯：旅程/出包/归档灯随 v10 全部退役，状态以文字与 chip 如实读回，`workflow.stage` 降级为材料内部进度（供技能恢复校准与自动化）不由界面渲染；归档 PR 合入状态按 archivePr 薄读取，CodeHub 等读不到状态一律保持未知，正文编辑延期                                                                                                                                                                       |
| 执行工作与管理任务               | Orca 终端、Tasks、worktree                                                                                                                                                           | 复用执行核；不能据规划会话可打开就认定所有 Issue 开工都已接 BW 纪律                                                                                                                                                                                                                                                                                                                                           |
| 设置定时工作                     | Orca Automations                                                                                                                                                                     | 调度能力在执行核；「配置自动化」入口（右板页头）打开原生编辑器：已登记条目直接编辑，未登记预填创建；BW 提示词随进屏覆盖同步为当前版本、用户设置保留，启用与时间由人确认；真实到点触发与旧自动配置迁移须逐项验证                                                                                                                                                                                               |
| 查看项目概况                     | 总览与项目墙                                                                                                                                                                         | 墙卡显示负责人、主机、侧栏排序首版的最多两条目标和计划归档／任务已关闭总数／验收归档事实，复用对应页面端口，不统计全仓 PR 或会话。总览的正式材料仍读主检出，页头更新代码重读快照；名片编辑共用墙上设置栏。指标按既有场景与目标值呈现，缺数据 Unknown，不能替代人工验收。实际验证见 [project-intake STATUS](05-features/project-intake/STATUS.md)与[总览指标 STATUS](05-features/overview-metrics/STATUS.md)。 |
| 查看和编辑项目知识               | 知识库文档、代码、对账页签                                                                                                                                                           | 文档树与正文已读真实仓库；代码页仍为占位，对账与建议仍有固定演示数据；保存和来源边界见 §3                                                                                                                                                                                                                                                                                                                     |
| 独立评审、出包与发布             | 保留的 reviewer-agent / version-planning 资料、现有 Orca 构建工具                                                                                                                    | Electron 的 BW CI/CD、评审与正式交付链待对应任务迁移验证；旧 Rust Release/出包按钮与 ADR 不作为本分支操作说明                                                                                                                                                                                                                                                                                                 |

迁移不是把旧八屏逐屏翻译。每个特性先确认在 Orca 上服务谁、完成什么事，再按 [原则 02 §6.2–6.3](01-principles/02-working-backwards.md#62-六环交付链)补齐旅程与证据。旧 ADR、指南和未保留的特性文档已清理；后续按真实决定补，不从旧 main 整体恢复。

## §2 · 能力与责任

以下是逻辑能力划分，不以模块数量计算产品特性。

### ① 关键信息维护（事实层）

Issue 原生状态与关闭原因是处理结果正本，版本目标和验收标准由计划 JSON 承载，Issue 的版本与目标关联由标签和标题提供，项目约定由 `.bw/project.toml` 承载。完成由人确认、未知不装健康等要求以 AGENTS 四铁律为准。旧 Rust 的集中读写口、现算类型与指标采集实现不能直接描述当前 Electron；模块取舍见 [关键信息维护](06-module/关键信息维护.md)。

### ② 会话与执行（执行层）

计划与验收完整复用 Orca 原生会话、标签/分屏、历史、资源管理器和工具，BW 只挂右侧业务板。未开始时分别显示“开始计划 / 开始验收”短卡；专用入口准备完整 Skill 并打开可编辑的原生会话草稿，只有会话实际打开成功才展示四区，失败留在短卡并回显原因。目标尚未形成也展示空目标区；已有有效材料独立恢复。启动视图仅在渲染进程内按流程、版本、项目/宿主/owner 和工作树隔离保存，切屏保留，不替代原生会话恢复。普通原生新会话不注入 BW 提示。验收计划未合入不阻断会话，助手先提醒并协助处理、不自动合入；没有可读 committed 固定计划时不创建验收材料。

侧栏绑定决定流程版本与宿主，页头只读回显；旧无绑定固定树保留选版偏好，无绑定树也无旧固定树时只读回看主干材料。工作树显示不依赖会话恢复；全树原生右击菜单提供绑定、改绑与解绑，解绑只移除版本归属，保留稳定身份、父子关系、文件与会话，不设置版本级重复绑定按钮。断链沿原生图标和激活机制表达，点击保留现有内容与其他导航；侧栏滚动复用原生容器。

进屏不做 Git 同步。“更新代码”显式同步并重读材料。主检出快进到主干，流程分支同步主干和跟踪的远端分支。执行中材料只读，任一路冲突时保留工作树现场。材料问题作为一次性上下文随同一次原生运行递交，助手说明方案并经人确认后处理。两屏无旅程灯，归档、拆解及发布等操作在会话执行；“配置指标”使用独立指标树。#439 增量当前只有静态接线证据，真实旅程见各特性 STATUS；详见 [会话与执行](06-module/会话与执行.md)。

### ③ 系统提示词与渐进加载（执行规范）

开工提示由 `version-cycle/cycle-prompt.ts` 生成一句用户请求，指向执行宿主实际安装的完整 Skill。正源 `standard/skills/` 与公共 `standard/references/` 经构建组成自包含包，复用 Orca 原生安装服务；用户项目无需拥有 standard。模型发送后完整读取 Skill 与其指定必读规范，运行事实沿原生工具读回。安装与冲突边界见 [会话入口与 Skill 加载](06-module/系统提示词与渐进加载.md)。文件存在、安装成功、模型读取正文和遵守规范是不同证据。

完整维护对照和缺口见 [系统提示词与渐进加载](06-module/系统提示词与渐进加载.md)；正文职责见 [standard/README](../standard/README.md)。修正文不等于修复运行时分发。

### ④ 技能与提炼（规范与方法）

`standard/skills/` 是给被管项目的业务执行规范；`.claude/skills/` 是 BW 自己的开发方法；Orca 根级 `skills/`、`skill-guides/`、`skill-stubs/` 有各自的能力分发用途。它们不因都叫 Skill 就合成一个知识库或共享一套打包承诺。技能提炼目标尚不能以技能列表存在证明。详见 [技能与提炼](06-module/技能与蒸馏.md)。

### ⑤ 桌面壳（交互层）

`src/renderer/src/workbench/` 承载 BW 导航、计划/验收两屏、总览、项目墙、接入与知识库；Orca 执行面在原组件中复用。主进程 / preload 提供文件、窗口和会话能力。详见 [桌面壳](06-module/桌面壳.md)，逐项源码清单见 [INVENTORY](../src/renderer/src/workbench/INVENTORY.md)。

客户端的检查与安装复用原生更新链。Windows Workbench 在下载层接 GitHub 断点恢复，整包下载的流量取舍和恢复规则见 [客户端更新](06-module/客户端更新.md)。

## §3 · 实现架构与数据流

### Orca 执行核与 BW 叠层

Orca 执行核提供终端、会话、worktree、Tasks、Automations 和 Explorer。BW 叠层通过 `WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1` 启用。壳内槽位：总览=activity 槽 OverviewPage（真实数据），任务=tasks 槽原生 TaskPage，计划/验收=原生 terminal 固定工作区旁的 `CycleWorkspaceShell` 右板（artifacts 槽是旧固定树准备入口；G2 侧栏版本行对绑定流程树直接走原生激活，`cycle-view-state.ts` 仅指明准备流程，不扩 TopLevelView union），自动化/知识库照旧。G2 版本工作区（#383）：侧栏版本区=目录现算（材料∪绑定∪已提交目标回看）＋「＋新建版本」接 `workbench.versionWorkspace.prepare`；任务=同一原生 TaskPage 可选携带 `workbenchTaskScope`（版本/目标完整任务引用集，经原生 provider 物化，缺数据如实保留）；目标/Issue 开工复用同一原生创建器（预填名称/备注上下文/父级建议），版本绑定在真实创建结果处写入（instanceId 围栏）；绑定流程树的材料读写以绑定版本为限（跨版拒绝）；每版「总览」=activity 槽经 `project-page-state` 模块态挂载 VersionOverviewPage（与项目墙/名片页同机制，只读聚合正式材料、绑定工作稿及原生任务／PR 依据，历史沿验收 planRef 固定）。契约与边界见[版本工作区 design](05-features/version-workspace/design.md)；版本总览的 SDLC 与 AI 统计沿 Orca 本机设置按原生项目身份独立选择、默认关闭；基础任务状态不依赖可选统计，项目总览与助手提示词不接入这些开关。版本总览的用户行为见[版本总览 spec](05-features/version-overview/spec.md)。两屏复用版本材料与原生任务缓存。里程碑独立对照规划、正式版本周期与目标交付结果；版本总览按开关读取 SDLC 阶段证据。叠层外改动保持明确钩子边界；上游身份和同步纪律见 [ref/upstream](../ref/upstream.md)，不要将 BW 的 `origin/main` 合并当作 Orca 升级。

BW 的业务契约在 `src/shared/workbench/`，材料事务、指标与历史 runtime 及宿主适配在 `src/main/workbench/`，界面在 `src/renderer/src/workbench/`；`src/relay/workbench/` 只在原生 SSH relay 上调用同一材料事务。主 RPC 方法族为 `workbench.materials.*`（材料事务读写）与 `workbench.metrics.{list,read,refresh}`、`workbench.history.{list,read,readPlan}`、`workbench.versionBinding.{read,set}`（G2 版本绑定：原生身份定位、owner 验证、读回确认）、`workbench.versionWorkspace.prepare`（G2 新版本两棵流程树准备：宿主端预检、去重创建、绑定与空计划初始化）、`workbench.archive.prStatus`、`workbench.release.status`（#462 发布状态薄读回，注册在 `src/main/runtime/rpc/methods/workbench-*.ts`）；SSH 宿主的采集与历史命令走窄执行器 `workbench.metrics.execute` / `workbench.history.execute`，不扩 provider.exec 白名单。Orca RPC/CLI 注册处及 relay 组合入口保持薄挂载，工作树、连接、调度和会话内核不承载 BW 业务。Web/配对是访问方式，SSH/WSL 是执行位置，均复用原生身份与路由；不另加本机专属开关。

通知首期承接 PR 评审请求，通过原生弹窗多选已连接主机，首次全选、重发沿用上次名单并可调整；通过 `workbench.review.*` 薄 RPC 复用原生配对连接与宿主路由，接收端写本机用户数据后确认送达，项目暂不可访问也保留通知；打开时复用本机副本或已有远程项目。GitHub PR 与 CodeHub MR 沿各自原生 provider 查询，详情请求及缓存绑定宿主来源。界面复用原生菜单、弹窗、多选、浮层、徽标和评审详情，不另建通信通道或成员系统。行为与验证边界见[通知](05-features/pr-review-notify/spec.md)。

产品知识继续在 `docs/`，Orca 工程参考按需读 `ref/`。`ref/` 不覆盖产品原则；旧 `crates/` 不存在于现行分支。

### 版本材料与选版

计划/验收两屏经 `workbench.materials.*` RPC 与 `ORCA bw materials` CLI 读写固定工作树的 `.bw/planning/<版本>/` 材料，共用同一材料事务核心（version-document-store：expectedRevision、跨进程互斥、原子替换）；会话内的模型经 CLI 操作同一份材料，旧 planning.py 写入器已退役删除。流程选版是原生 worktree 偏好 `workbenchSelectedVersion`（main/workbench/version-selection.ts），context 只读、select 只写偏好，CLI 与 UI 共享；不按会话标题、日期或上次打开项推断版本。两屏界面都不渲染灯：`workflow.stage`（preparation/showcase/archive 三值，模型每完成一阶段写入）只作材料内部进度，供会话校准与自动化，界面以文字与 chip 如实读回状态；归档 PR 合入状态按材料记录的 `workflow.archivePr` 薄读取，发布状态按材料记录的 `workflow.release` tag 读回键经 `workbench.release.status` 现算（是否已发布、时间、Release 页与资产；读数不落材料，正本在 Git 标签与 Release 页）。两屏共用自动保存、TaskPort 单项 Issue 读回和归档状态读取链；目标行骨架按屏分叉（计划屏 G3 PlanningGoalCard；验收屏 v10 AcceptanceGoalRow 只读勾勾表行，取计划屏行形态裁剪——收起态目标句/负责人/关联 Issue 数/批注角标/行尾单个未判定/达成/不达成状态，不设指标区。原共用 VersionGoalCard 已随 v10 删除）；页面不再维护独立全量任务区，归档后可继续编辑原材料；验收 Issue 按未关闭、未知、已关闭排序与分别计数，遗留是未关闭的人工标记子集，成功读回才显示 Feature/Bug。这不是另一份 Issue 状态正本。完成、合入与发布仍需人决定。 新建版本先定位紧邻前版再找验收来源，缺少则留空不回退，已有固定来源不自动替换。两屏纪要采用共识/遗留文本与整份人工确认，归档前每条已落实或关联真实跟进 Issue，由助手核对、PR 人审；旧 closed 兼容保留，无逐项控件或前端硬门禁。

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
