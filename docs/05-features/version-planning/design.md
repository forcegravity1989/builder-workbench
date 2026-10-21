# 版本计划实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管本次设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：上文已授权实施，详细设计未逐项细审，未决项须人工确认；已实现范围及证据见 STATUS，正文按当前接线回写，未标注落点的接口仍为设计。G2 版本运作（含版本归档）设计于 2026-10-20 评审定稿，其接线要求的生产验证缺口见 STATUS。架构定位：§1 项目版本，§2 ①事实、②执行、③规范、⑤壳，§3 Orca 执行核与 BW 叠层。

## 现状与复用

本轮已完成入口切换：旧三屏链条（PlanJourneyShell / PlanWeekBoard / PlanWeekPlanChat / plan-week-* / workbench-plan.css）已退役删除，以下为当前接线。

本轮已完成入口迁移：启动按钮由原生 TabBar 移至 BW 右板首行协作卡片（CycleStartCard），“配置自动化”在页头；分支信息留在右板页头，原生会话控件不含 BW 按钮（tab-bar-surface 的薄挂载已撤除）。异常文件与当前选版经同一启动入口带入会话：手动运行已登记自动化时作为一次性上下文（automation.runNow 的 oneShotPrompt，capability 门控）随保存提示在派发端合并单次递交，保留用户保存的提示、工具、模型与会话复用配置，不另建会话、不覆盖自动化记录；独立的 startMaterialRequest 通道已退役删除。

| 落点 | 采用方式 |
|---|---|
| AppWorkspaceShell → CycleWorkspaceProvider / CycleWorkspaceShell | artifacts 只作固定树准备入口；ensureCycleWorktree 后正式选择并切到 terminal，paired 宿主先激活。terminal 当前树为 bw/week-plan 或 bw/week-acceptance 时，在唯一原生 Terminal 旁挂右板；不扩 TopLevelView |
| 原生 Terminal / TabBar / RightSidebar | 完整复用会话、标签/分屏、资源管理器与历史；TabBar 不挂 BW 按钮（原 CycleStartButton 薄挂载已撤除），左侧项目列表在计划与验收同样显示。移除 CycleChat、历史嵌入、portal 重发布和 sessionStorage 会话绑定 |
| main/workbench/version-document-store + `workbench.materials.*` RPC / `ORCA bw materials` CLI | 跨进程 CAS 统一写入；renderer 直接 writeFile 的旧链路已删除 |
| TaskPageContent → GitHubItemDialog → ConversationTabDescription / GitHubMarkdownComposer | 直接复用页面、正文编辑及 runWorkItemBodyUpdate；BW 不复制详情组件 |
| use-task-page-detail-routing 的 worktreeNavHistory / goBackWorktree | 导航历史携带 BW 来源；openTaskPage 新增 returnToPreviousView（跳过 tasks 哨兵，返回 BW 来源视图），BW 子视图与屏内滚动位置由 cycle-view-state 和 use-planning-view-memory 恢复。 |
| shared/automations-types | 复用原生登记和运行记录；「配置自动化」按钮打开原生编辑器：host 按工作树宿主身份，首次登记 existing 固定树、reuseSession=false、prompt 不含 cycleId，后续尊重用户保存的配置。手动运行的一次性上下文走 automation.runNow 可选 oneShotPrompt（派发端合并、capability 门控），接缝登记见 [upstream](../../../ref/upstream.md) |

## 共享边界

BW 业务放在 renderer/workbench 下的 version-cycle、version-planning、version-acceptance、metrics 子域。Orca 组件只接收通用导航来源或调用回调；计划、验收、指标相互通过数据契约协作，不跨屏导入页面组件。

| 所有者 | 责任 | 不拥有 |
|---|---|---|
| BW version-cycle 共享层 | 项目/版本上下文、版本材料读写与自动保存、目标卡骨架、共用任务/归档状态行 UI | 调度器、聊天日志、Issue 正文和状态正本 |
| 计划 | 版本目标、总结、任务引用、派生纪要 | 验收结论、指标采集实现 |
| 验收 | 固定计划引用、实际交付、人的结论和后续 | 改写原承诺、自动完成 Issue |
| 指标 | 定义、窗口、采集和读数；详见 [指标设计](../overview-metrics/design.md) | 版本目标值和验收结论 |
| Orca | Tasks、工作树、会话、Automations、项目/宿主身份、通用文件与命令权限 | BW 的业务规则 |

共享接口已按职责落地为 renderer 端口 + 原生 RPC：VersionHistoryPort.list/read/readPlan（version-history-port，按固定 Git 提交发现及读取多周记录）、「配置指标」经 CycleWorkspaceProvider 直接进入 bw/metrics-refresh 固定维护树原生会话（提示由指标模块提供；不设端口抽象，原死契约 MetricSetupPort 已随收尾代码批删除）、VersionDocumentPort.read/save(expectedRevision)（version-material-port）、TaskPort.listVersion/openDetail(origin)/refresh（task-port，github.workItem / codehub.viewTask 复用原生读取层，单条失败 kind:'unavailable'）、ArchivePrPort.readStatus（archive-pr-port → workbench.archive.prStatus，按材料记录的 workflow.archivePr 编号薄读取 PR 合入状态，读不到保持 unknown）、MetricsPort.list/read/refresh（metrics-port，指标端定义）。原 CycleSessionPort.prepareRequest 贴草稿通道与 ArchivePort.readStatus 字节证明链已整体退役删除。底层仍调用原生能力，不另建存储。

## 版本材料与写入

PlanningBoard 保留未选版本与已选版本的同一骨架：顶部明确选版，正文依次为进展/风险、目标卡（含关联 Issue 子块）和一行归档状态。PlanningJourneyNav 只滚动定位正文并显示 workflow.stage 灯，不发起请求、不以点击标记评审完成。VersionGoalCard 的计划分支直接编辑目标、交付件和可选验收说明；验收只读分支不变。单卡与批量开合按项目、仓库、宿主、版本及屏保存视图偏好，验收另按轮次隔离；该偏好不写入业务材料。PlanGoalMetrics 展示可选指标承诺与当前读数，指标定义和采集依据按会话 SOP 配置。可添加项按指标名称排重，已绑定承诺继续保留原 ref 与基线；同名目录定义变化提示更新，不作为第二份承诺。存量重复承诺由人核对，验收端显式列出全部目标及基线并提示无法唯一比较。预览纪要在目标标题旁；进展区在 summary.progressSource 存在时内联回显派生只读纪要（use-progress-minutes），无引用或读取失败时显示文本输入；风险输入仅由用户填写（模型通道被人工守卫拒绝）。取消目标补充弹窗和常规保存栏。计划样式在 version-planning.css、planning-fields.css 和 planning-dialogs.css 内限定，不改变总览。

usePlanningMaterial 继续复用 MaterialDraftController 的本地草稿、远端修订与 CAS，不新增材料副本。usePlanningAutosave 对连续编辑去抖并串行写入；写入期间的新编辑继续保留，在显式 flush 时排空到最新修订后才返回。版本切换先 flush，写入前复核当前范围与材料身份。冲突、远端删除或错误暂停自动写入，由 PlanningPersistenceNotice 提供保留双方内容、重读或明确重试；不以自动重试覆盖模型编辑。轮询只发现材料变化，旅程灯随轮询到的 workflow.stage 更新。组件/控制器检查不替代真壳输入、重启及真实模型并发验证。

保留 .bw/planning/<version>/data.json，目标 schema_version=3；原结构里的 plan.goals 演进为稳定 goalId 对应的结果承诺、可选交付说明/验收说明、可选 metricRef 与版本目标。可选 workflow 节记录模型写入的 SOP 阶段（stage/updatedAt/archivePr，契约在 shared/version-workflow 与 version-records），旅程灯只对它做序号比较。风险和进展保持 summary 语义；版本进展以人选定的验收纪要为依据，支持同版上周和已完成版本；标明来源，不把历史结果冒称当前成绩。可选 summary.progressSource 保存明确选定验收的 version/cycleId/sourceCommit/revision，不推断版本顺序。use-progress-minutes 懒读 VersionHistoryPort.read/readPlan，经固定修订核对后用 buildAcceptanceReport 核对证据并生成内联只读纪要（人话正文，不含技术标识）；「查看验收依据」先保存当前计划，再定位同项目、宿主及 runtime owner 的已登记验收工作树，经该树材料端口选定引用版本；历史选择保存固定 sourceCommit/revision，按与内联纪要相同的主干来源校验读回，不受周目录去重影响。返回 Issue 详情仍恢复该固定来源；无来源时普通进入验收，工作树或固定来源不可读时显示错误，不改读当前轮、不初始化替代材料。来源失败不回退，异步结果受工作区及材料身份约束。选择引用不覆盖 summary.progress，内容由会话按授权整理，经同一 CAS 保存；既有 schema3 无引用仍可读，未真实验证模型带入行为。版本周期不由自然周推断。计划入口初态为待选择版本，列举候选不写盘；用户在 UI 或会话明确选择后才加载可编辑材料，明确新建后才创建。禁用 mtime 推断当前版本与自动 init default；加载失败不能新建替代物。

任务只保存 provider/repo/number 与 goalId 的引用，展示状态从 Orca provider 读回；缓存有读取时间，离线不是空任务。三段纪要从目标纯函数生成，不再存 live_notes、transcript、独立可编辑 minutes。协议细节的唯一模型参考是 [version-records](../../../standard/system-prompt/references/version-records.md)。

UI 与模型共用在文件所属宿主执行的版本材料写入核心；模型入口是宿主下发的 `ORCA bw materials` CLI 薄入口。写入含受信任项目根、版本路径校验、expectedRevision、跨进程互斥和原子替换；重读修订后再提交，锁范围只含本文件事务，不锁住模型对话。CLI 与 UI 不各自实现一次校验。planning.py、version-plan.html 模板与 data-template.json 已在消费方切换的同一交付内退役删除，旧 confirm / submit-confirmed 不再控制任何流程；check-week-comment.py 与 week-plan-comment.md 保留作历史评论修复协议。

材料事务核心位于 src/main/workbench/version-document-store.ts，共同身份与 read/save 类型位于 src/shared/workbench/version-document.ts。它只接受明确版本，读取不存在材料无副作用，修订按原始字节计算；复用 proper-lockfile 和 Orca durable-file-write。计划/验收结构由 shared/workbench/version-material.ts 校验，共同层验证 schema/version/cycleId。schema2 只报告需显式迁移；不做自动升级。

材料服务通过 BW 的 main/workbench/version-material-runtime 组合适配，使用 Orca 原生 runtime RPC、项目/工作树解析及 SSH relay。页面 nativeVersionMaterialPort 按原生 worktree 的 hostId 和 runtimeOwnerEnvironmentId 路由，配对客户端与执行宿主分开处理；CLI 沿用选中的 runtime，不因 isRemote 禁用。workbench.materials.list/read/save 与 orca bw materials 共用校验；请求只传身份，文件根由原生登记解析。文件所属宿主运行同一材料事务，核对 Git common directory 与实际固定分支，并在文档锁内重查。WSL 元数据路径复用原生转换。list 无写入副作用，不默认选版本。

流程选版是原生 worktree 偏好 `workbenchSelectedVersion`（main/workbench/version-selection.ts）：context 只读、select 只写偏好，CLI `ORCA bw materials context/select` 与 UI 共享同一偏好；无 session→version 永久映射，历史会话切换只换左侧聊天，不自动切右侧材料。跨周有限场景：同版本计划/验收各只一轮活动材料，归档后由人明确开下一轮。

计划/验收屏与 CLI 均已消费这些入口，旧 Plan 页面和旧开工提示已删除。材料校验只证明结构及写入一致性，不能证明引用的脚本读数真实、计划已合入或记录中的人已认可；对应特性必须从真实来源读回后推导状态。外部 Git 操作不受材料锁控制，提交前的分支复核不等同于锁住所有 Git checkout。

schema2 通过一次显式迁移转为新计划；原文件/提交保留来源，旧 results 导入验收草稿并记录其实际归属版本，旧 confirmation 只作历史证据，不生成新认可。所有消费者与写入者一起切换；不做永久双写或遇错静默退回旧界面。迁移失败保留原件并报告。

通用 SYSTEM 同时服务有关联 Issue 与无 Issue 的原生项目任务；宿主为真实引用渲染 Issue 上下文；创建、改写与计划补充的格式见 [Issue 格式](../../../standard/system-prompt/references/issue-state.md)。指标配置加载 metrics-refresh，不自动加载 week-planning。开工提示由 `version-cycle/cycle-prompt.ts` 渲染 bundled SYSTEM.md.tmpl 并内嵌对应 Skill 发现 Stub（指南与 references 经 `ORCA skills get` 按需读取）；占位符未解析即抛错，不会把占位符当实际身份递交。

## 会话、任务导航与自动化

计划固定 bw/week-plan，验收固定 bw/week-acceptance，各复用一棵 Orca 登记工作树。项目未设置基址时先写入项目级 .bw/worktrees 并提示，用户已有设置保留；原生创建与默认分支规则不变。入口准备工作区后切到 terminal；进屏不触发任何 Git 动作。「更新代码」经 workbench.trunk.update 走三指令：解析基线（钉值 worktreeBaseRef 或主检出当前分支，不猜名）、fetch 书签、双向 rev-list 对比、merge --ff-only；本地宿主在 owner runtime 执行，快进复用原生工作树操作锁与 Git 读缓存失效。更新状态按项目、宿主、流程与固定树隔离，同树在途请求去重；执行中材料只读、计划自动保存暂停，完成后经现有读写接口重读材料与候选（无论快进成败都重读），脏草稿仍由 CAS 控制器保留并提示冲突。完成回调只刷新材料，不重选工作区或会话。快进不了（分叉、主检出有本地改动、分支失配、远端不可达）保持原样不换数据源，统一中文提示交会话处理；固定树纯草稿状态（有未合入提交、主干没前进）不是异常、不提示；远程 SSH 树暂不自动同步，属只读中继边界。看板与会话始终使用同一工作树的文件。切树离开即卸下对应业务板，不持续纠正原生选择。材料身份按项目、宿主、流程和固定树解析。版本仍由人明确选择，不跟会话标题或日期联动，进屏不自动选版、不自动开轮。

计划与验收完整复用 Orca 原生会话工作区：顶部新建会话和 Agent 控件、标签/分屏、资源管理器、智能体历史及可收起的工具侧栏均由 Orca 拥有。左侧保留 BW 导航，其下与其他页一样显示项目列表。BW 只在右侧业务板首行放置“新建计划”或“新建验收”，分支与“配置自动化”入口显示在右板页头（一次性配置不占每周主操作区）；移除原生标签栏的 BW 扩展，不另建聊天、历史或会话绑定。

“新建计划／验收”调用对应已登记自动化的原生手动运行，使用用户当前保存的提示、工具和模型，并自动打开、聚焦本次原生会话；定时运行仍在后台。普通原生新建会话不自动注入 BW Skill。首次登记默认关闭定时、使用固定工作区且 reuseSession=false，按 creationKey 去重；已有条目按当前 BW 版本覆盖同步 BW 所有的提示词（updateAutomationForOwner 只发 prompt 字段），用户所有的设置保留，同步失败经 notice 如实提示且不阻断；后续运行尊重用户保存的会话复用配置。“配置自动化”打开原生编辑器，历史恢复和运行打开完全沿用 Orca。

自动化运行与历史恢复继续打开原生 terminal；识别当前固定树后自然显示右板，不再保存 BW run/session 恢复映射。native-session 只读取当前聚焦的结构化会话或终端叶子，并在插入业务草稿前复核宿主、工作树和焦点；不创建布局、选择历史或恢复聊天。

旧格式或损坏材料在首行协作卡片内紧凑提示，点明实际版本与计划/验收数据文件；“新建计划／验收”手动运行已登记自动化，把当前明确选版、具体文件和读取问题作为一次性上下文（automation.runNow 的可选 oneShotPrompt，`automation.run-now-one-shot-prompt.v1` capability 门控），由派发端与已保存的 SYSTEM/Skill 提示合并为单次递交，不临时改写自动化记录，也不新建第二条会话通道。首次没有会话仍可使用，其他版本异常不阻塞当前有效版本。不保留额外的“在会话中处理”启动按钮。模型先说明旅程，再把旧字段收成新计划，对不上的目标问人，经用户确认后执行，不留旧文件副本，也不把点击按钮当成同意改数据。页面不保留专用迁移预览/确认弹窗或额外的旧结果入口；迁移工具及安全约束仍由材料服务和 Skill reference 承担。

执行呈现只有原生会话与 BW 双栏两类：指标配置和普通任务执行用原生会话；版本计划/验收用原生会话加对应业务 UI。总览是查看、刷新和进入上述工作的汇总入口，不另立第三条执行流程。配置指标是手动原生任务，细节见指标设计。

TaskOrigin 携带项目、页面、版本、目标筛选、滚动和草稿引用。利用原导航历史返回，正文保存仍走原生权限与 mutation/cache；状态刷新不触发完成。项目切换和任务里进一步跳转后仍按有效来源恢复，来源已失效时给明确返回入口，不悄悄落回错误版本。

## 阶段状态、归档与灯色

会议纪要为评审后填写纪要时使用的纯派生输出；PL 与 Builder 在评审会上直接修改目标原件。预览和复制不设置任务拆解或 PR 合入前置，不确认计划，打开弹窗不写批准。人的评审决定在会话中明确表达后由模型记录 `workflow.stage=review`；页面不设评审控件，不从打开纪要推定。

旅程灯唯一数据源是材料里的 `workflow.stage`（模型经 CLI 每完成一阶段写入）：灯位不超过 stage 为绿，否则灰，推导是 shared/version-workflow 的位置比较纯函数，没有内容启发式、计数判断或 provider 探测。stage 是进度信号不是完成权威；材料改动不使灯变色，内容实质调整由模型在会话中回退 stage。

归档在会话中发起：模型写 `stage=archive` → 按项目门禁提 PR → 把 provider/repository/number 写入 `workflow.archivePr`。归档卡片是只读状态行：按 archivePr 经 `workbench.archive.prStatus` 薄读取合入状态（merged/open/closed，一次 `pulls/{n}` 读取；非 GitHub 或读不到保持 unknown），进屏、材料刷新、手动刷新与窗口聚焦（节流）触发重读。原字节级合入证明、按分支名探测 PR、changed/unknown 状态机与贴草稿按钮通道（归档/拆解/未达跟进及等待框）已整体删除，不留双路径。

## 总览中的版本记录

计划和验收各提供材料到纪要及摘要的纯派生函数，不能分别维护总结副本；共享 VersionHistoryPort 按 version-records 的 cycleId/提交身份读取多周、同周修订及草稿。集成层在 OverviewPage 沿 main 保留版本页签与双栏内容区（use-version-minutes.ts：归档 history.read 优先、当前选版回落 live 材料）：切换版本即回填计划摘要和验收摘要；同版本多周在原处选择，全文页内展开，可打开只读来源或返回相应屏，不再用历史弹窗。缺记录保持空，旧进展/提交不代替验收，旧材料不推造日期和认可。v0.5 不新增里程碑模型或扩改总览其余区域。源码候选、材料归档提交和运行周期是不同身份。

## 验证与实现代价

核心 TDD：目标到纪要、修订冲突、来源隔离、内容改变后旧归档失效、运行键/自动化去重、返回上下文。集成复用原生 Tasks 与 Automations 用例，不复制它们全套测试。spec 的 P01–P10 和 PJ01/PJ02 在实现时登记目标平台 E2E，结果进 STATUS。

主要代价曾是旧 schema/CLI/提示/页面的原子切换，本轮已同次完成退役；普通项目的技能分发经产品内置投影覆盖，不依赖项目自带 standard/。执行顺序与并行文件所有权在仓外计划；先冻结共享契约再分三条特性线，不让各线分别造存储和会话适配。


## G2 版本运作树实施设计（定稿）

此节服务 [G2 高保真修订 7](version-workspace-prototype.html?rev=7) 的落地，设计于 2026-10-20 评审定稿；上文描述当前接线。源码核对基线为 main 的 2be8d77649797cb0ac740edaa7defa49deb3ffd5，其后 PR #386 合入 main f5ac309b226a456b157b57ceee65204f101a4a09，计划快照来源仍可追溯至其 head 331c04f。行为判据见 [spec](spec.md#g2-版本运作设计定稿)。

| 当前源码证据 | 可复用部分与必要适配 |
|---|---|
| [WorktreeLineage](../../../src/shared/worktree/lineage-types.ts)、[runtime controller](../../../src/main/runtime/runtime-worktree-lineage-controller.ts)、[parent picker](../../../src/renderer/src/components/sidebar/WorktreeParentPickerPopover.tsx) | 单父级、避免自环/循环、按仓库/项目/宿主边界校验；复用父级选择与原生树形。父子关系不是目录嵌套或 Git 合并关系。 |
| [原生行构建](../../../src/renderer/src/components/sidebar/worktree-list/grouping/row-builders.ts)、[WorktreeCardAgents](../../../src/renderer/src/components/sidebar/WorktreeCardAgents.tsx) | 候选复用工作树卡片与会话激活；后者可接预过滤 agents，但当前活动/保留行不等于全部持久历史。不能只筛当前标签就宣称完整回看；工作树卡片、父子缩进及 agent 行本身也应复用，不另画一套生产组件。 |
| [创建参数](../../../src/shared/worktree/create-types.ts)、[创建执行](../../../src/renderer/src/hooks/composer-state/full-creation-execution.ts)、[父级处理](../../../src/renderer/src/store/slices/worktrees/create/worktree-create-parent-pick.ts) | 同一原生创建路径已有 baseBranch、parentWorkspace、linkedWorkItem、sparseCheckout。基线与父级分开确定；父关系不携带父树的未提交修改，也不决定合入路线。 |
| [稀疏创建](../../../src/main/git/worktree-sparse-add.ts)、[高级创建选项](../../../src/renderer/src/components/new-workspace/NewWorkspaceComposerAdvancedSection.tsx) | 已有 no-checkout + cone sparse-checkout 及目录预设。计划/验收可考虑只检出必要资产，但需验证配置、Skill、材料、采集脚本及其依赖可读，不能默认所有仓库适用。 |
| [AiVaultPanel](../../../src/renderer/src/components/right-sidebar/AiVaultPanel.tsx)、[会话记录](../../../src/shared/agent-session-record.ts)、[BW 会话身份](../../../src/renderer/src/workbench/version-cycle/native-session.ts) | 复用原生历史与继续行为。持久会话位置、宿主、原生会话标识保持原协议；终端 pane 与 provider 历史标识不能假定同一。按版本跨工作树聚合仍需适配与重启验证。 |
| [versionSelection](../../../src/main/workbench/version-selection.ts)、[CycleWorkspaceProvider](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceProvider.tsx)、[自动化启动](../../../src/renderer/src/workbench/version-cycle/start-cycle-automation.ts) | 当前按固定分支定位，选版保存在工作树 metadata，自动化要求 existing workspace 匹配。只改侧栏筛选不足以实现两个版本独立运行；必须把运行归属与正在浏览的版本拆开。 |
| [WorktreeMeta.isArchived](../../../src/shared/worktree/meta-types.ts)、[worktree.set](../../../src/main/runtime/rpc/methods/worktree.ts)、[侧栏过滤](../../../src/renderer/src/components/sidebar/visible-worktrees.ts)、[清理 facet](../../../src/renderer/src/components/workspace-cleanup/workspace-cleanup-facets.ts) | 原生工作树归档：isArchived 持久化并经 mergeWorktree 投影，原生列表隐藏、父级与任务匹配排除、清理浏览按 Archived 回看、可取消归档恢复。版本归档以此作每宿主运行投影，跨机器正本为版本材料可选归档记录（归档时间与确认人，CAS 同规则写入）；不另建归档存储或归档分区。 |

复用必须覆盖 UI 和调用链：

- 计划/验收继续沿 [CycleWorkspaceShell](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceShell.tsx) 挂载现有板，左侧为 [AppWorkspaceShell](../../../src/renderer/src/app-shell/AppWorkspaceShell.tsx) 的完整 Terminal；本轮不改计划/验收业务板及其内部布局。G2 高保真将这套组合标为一个既有整屏，避免分别画两个占位区而误示新增屏幕。
- [TaskPage](../../../src/renderer/src/components/task-page/TaskPage.tsx) 没有通用的版本筛选 props，模型包含来源、全局缓存与分页。必须从计划的完整任务引用构建范围，通过原生数据路径读回并驱动同一列表；不能只过滤全局列表当前页，否则遗漏任务、计数不实。
- [原生 Issue 行](../../../src/renderer/src/components/task-page/github/Rows.tsx) 已有未关联时 Start、已关联时 Open；[执行动作](../../../src/renderer/src/components/use-task-page-workspace-actions.ts) 走原生创建器与激活路径。其 [关联查找](../../../src/renderer/src/lib/github-work-item-workspace-attachment.ts) 目前按 repoId、Issue 类型和编号取首个未归档树，不含版本/目标。薄适配须显式解析业务绑定，避免同 Issue 跨版时打开错误工作区。已有原生创建器可由目标入口预填上下文，但当前输入没有初始父级，完成回调也不返回工作区身份，需在创建链路取得真实结果后绑定。当前路径见 [nativeTaskPort](../../../src/renderer/src/workbench/native-task-port.ts)，不另建 Issue 数据正本。
- 计划里的 Issue 继续进共用原生详情；本原型移除独立开工/继续，与 #385 的计划直接开工诉求留作 G3 对齐。如保留快捷入口，只调用同一个原生动作。
- [OverviewPage](../../../src/renderer/src/workbench/OverviewPage.tsx) 保持现状。项目总览仅标明沿用入口，不嵌入或复刻已有原型；新增版本总览服务本版承诺、事实与验收总结，不代替项目总览。

布局将版本与目标作为逻辑目录；新建版本准备计划和验收两棵独立固定树，入口与流程树合并为一行。目标工作树按需创建，Issue 使用同一原生创建器；合适父级是可修改建议，不强制嵌套。创建交给原生执行核，BW 负责导航和明确的业务归属；不重建终端、会话租约、历史存储或另一套任务完成状态。实际薄挂载能否满足全部接缝还需验证；如必须改变 Orca 核心、协议或宿主路由，先提交具体取舍给人决定。

空间成本不能只看 Git 对象共享。此基线 git ls-tree -r -l HEAD 的 24,608 个文件 blob 合计 192,575,617 字节（183.7 MiB）；这是受控内容体积，不是实际磁盘占用，不含依赖、构建产物、LFS 内容或文件系统开销。4 个目标、10 个 Issue 加计划/验收，若全部预建是 16 棵；版本根与计划另分则是 17 棵。原型按需创建，未开展的目标不建树。Git 对象共享和工作区独立的机制见 [Git worktree](https://git-scm.com/docs/git-worktree)，稀疏范围与限制见 [Git sparse-checkout](https://git-scm.com/docs/git-sparse-checkout)。未测真实大仓耗时、磁盘占用或跨宿主稀疏运行。

落地前必须明确的边界：

- 分支/材料：计划、验收、目标与 Issue 的起点、同步与合入规则；计划和验收材料的读写位置及 CAS 修订；分支命名不是稳定身份，不能靠字符串解析建立版本归属。
- 自动化：定时运行如何选择已明确版本、首次登记如何避免跨版本重用、如何保留人的模型/时间/复用设置。不能拿 UI 上次查看版本当执行参数。
- 会话回看：各版本并列，不做专门历史会话入口或归档分区；已归档版本留在原位置带标识回看。旧共享树不整体改父级；保留原生入口，人核对后再建立业务关联。历史读回须覆盖已退出会话、不同工具/provider 与重启。
- 删除、归档与跨版引用：版本归档＝版本材料归档记录＋原生工作树 isArchived 投影（判据见 spec「版本归档」），是收尾动作不是删除动作；其他宿主的原生投影在下次访问该版本时对账，只处理树、不动会话与自动化。删除沿用原生子树预检和动作，不把删除工作树等同删除版本，也不以 Git 材料可读承诺会话可恢复。一个 Issue 可被多版引用，一个原生子树只有一个父级；引用不复制完成记录，跨版工作区绑定由绑定契约明确。
- 发布总结：版本总览按计划与验收派生，不新增手填报告正本；沿现有材料的固定提交/修订与发布证据回看，不新增冻结操作或报告副本，不能用当前 Issue 状态冒充当时验收。

原型构建：node docs/05-features/version-planning/prototype/build-g2.cjs；加 --check 校验源码与生成物一致。独立 JSX/CSS 与真实计划快照在该特性的 prototype/ 下；复用现有 vendor.js 与设计系统资源，不修改已确认的旧原型。

接线要求：材料读写层 version-material-workspace 和选版层 version-selection 都校验旧固定分支；必须一起适配，不能只改侧栏。原生 worktree.set RPC 当前不含 BW 版本绑定字段，且旧宿主可能丢弃未知字段，新增绑定与归档记录必须经授权的宿主契约与能力检测读回验证。TaskPage 的范围要覆盖完整引用与分页，自动化 creationKey 也需含已明确版本，不能以最后浏览版本改变执行对象。历史只读入口必须避开现有进屏自动准备工作树的 hook；已归档版本的回看同样走只读来源，不触发准备树。以上接线要求的生产验证缺口见 STATUS。
