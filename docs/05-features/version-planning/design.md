# 版本计划实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管本次设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：已授权实施；详细设计未逐项细审，未决项须人工确认。已实现范围及证据见 STATUS，本篇其余接口仍为设计。架构定位：§1 项目版本，§2 ①事实、②执行、③规范、⑤壳，§3 Orca 执行核与 BW 叠层。

## 现状与复用

| 已有落点 | 采用方式 / 必须改变之处 |
|---|---|
| workbench/PlanJourneyShell、PlanCurrentPane、PlanGoalList | 改原入口为单页；拆除旧三屏编排，不维护新旧两套业务页 |
| plan-week-document、use-plan-week-document、plan-week-fs | 保留读取位置和草稿恢复经验；当前 renderer 直接 writeFile 不是跨进程 CAS，必须统一写入 |
| PlanWeekPlanChat、plan-week-plan-session、plan-week-plan-anchor | 复用原生会话呈现和工作树定位；替换每项目单锚点策略，不创建 BW 聊天存储 |
| TaskPageContent → GitHubItemDialog → ConversationTabDescription / GitHubMarkdownComposer | 直接复用页面、正文编辑及 runWorkItemBodyUpdate；BW 不复制详情组件 |
| use-task-page-detail-routing 的 worktreeNavHistory / goBackWorktree | 在原导航历史中携带 BW 来源；只补缺失的来源类型，不另造全局返回栈 |
| shared/automations-types | 已有 existing 工作区、reuseSession、creationKey、runContext；复用原生登记和运行记录 |

## 共享边界

BW 业务放在 renderer/workbench 下的 version-cycle、version-planning、version-acceptance、metrics 子域。Orca 组件只接收通用导航来源或调用回调；计划、验收、指标相互通过数据契约协作，不跨屏导入页面组件。

| 所有者 | 责任 | 不拥有 |
|---|---|---|
| BW version-cycle 共享层 | 项目/版本上下文、版本材料读写、目标卡骨架、会话/任务/归档适配 | 调度器、聊天日志、Issue 正文和状态正本 |
| 计划 | 版本目标、总结、任务引用、派生纪要 | 验收结论、指标采集实现 |
| 验收 | 固定计划引用、实际交付、人的结论和后续 | 改写原承诺、自动完成 Issue |
| 指标 | 定义、窗口、采集和读数；详见 [指标设计](../overview-metrics/design.md) | 版本目标值和验收结论 |
| Orca | Tasks、工作树、会话、Automations、项目/宿主身份、通用文件与命令权限 | BW 的业务规则 |

共享接口按职责冻结：VersionHistoryPort.list/read（按固定 Git 提交发现及读取多周记录）、MetricSetupPort.start/resume（原生项目配置任务，具体提示由指标模块提供）、VersionDocumentPort.read/save(expectedRevision)、TaskPort.listVersion/openDetail(origin)/refresh、CycleSessionPort.list/start/continue、ArchivePort.readStatus、MetricsPort.list/read/refresh（指标端定义）。这些是拟实现的 BW 适配接口名称，底层仍调用原生能力，不宣称已有同名 API。

## 版本材料与写入

保留 .bw/planning/<version>/data.json，目标 schema_version=3；原结构里的 plan.goals 演进为稳定 goalId 对应的结果承诺、可选交付说明/验收说明、可选 metricRef 与版本目标。风险和进展保持 summary 语义，进展标明所述版本，不把上版结果冒称本版成绩。版本周期不由自然周推断。计划入口初态为待选择版本，列举候选不写盘；用户在 UI 或会话明确选择后才加载可编辑材料，明确新建后才创建。禁用 mtime 推断当前版本与自动 init default；加载失败不能新建替代物。

任务只保存 provider/repo/number 与 goalId 的引用，展示状态从 Orca provider 读回；缓存有读取时间，离线不是空任务。三段纪要从目标纯函数生成，不再存 live_notes、transcript、独立可编辑 minutes。协议细节的唯一模型参考是 [version-records](../../../standard/system-prompt/references/version-records.md)。

UI 与模型共用在文件所属宿主执行的版本材料写入核心；模型入口是由宿主下发的、实际存在的 CLI/工具薄入口。写入含受信任项目根、版本路径校验、expectedRevision、跨进程互斥和原子替换；重读修订后再提交，锁范围只含本文件事务，不锁住模型对话。CLI 与 UI 不各自实现一次校验。现有 planning.py / 旧模板在消费方切换的同一交付内退役，不能让旧 confirm 或 submit-confirmed 继续控制新流程；接线前不提前删除正在被源码调用的脚本。

材料事务核心位于 src/main/workbench/version-document-store.ts，共同身份与 read/save 类型位于 src/shared/workbench/version-document.ts。它只接受明确版本，读取不存在材料无副作用，修订按原始字节计算；复用 proper-lockfile 和 Orca durable-file-write。计划/验收结构由 shared/workbench/version-material.ts 校验，共同层验证 schema/version/cycleId。schema2 只报告需显式迁移；不做自动升级。

材料服务通过 BW 的 main/workbench/version-material-runtime 组合适配，使用 Orca 原生 runtime RPC、项目/工作树解析及 SSH relay。页面 nativeVersionMaterialPort 按原生 worktree 的 hostId 和 runtimeOwnerEnvironmentId 路由，配对客户端与执行宿主分开处理；CLI 沿用选中的 runtime，不因 isRemote 禁用。workbench.materials.list/read/save 与 orca bw materials 共用校验；请求只传身份，文件根由原生登记解析。文件所属宿主运行同一材料事务，核对 Git common directory 与实际固定分支，并在文档锁内重查。WSL 元数据路径复用原生转换。list 无写入副作用，不默认选版本；VersionHistoryPort 仍由特性实施。

这些入口已提供给新消费方接线；旧 Plan 页面和开工提示尚未调用它们。材料校验只证明结构及写入一致性，不能证明引用的脚本读数真实、计划已合入或记录中的人已认可；对应特性必须从真实来源读回后推导状态。外部 Git 操作不受材料锁控制，提交前的分支复核不等同于锁住所有 Git checkout。

schema2 通过一次显式迁移转为新计划；原文件/提交保留来源，旧 results 导入验收草稿并记录其实际归属版本，旧 confirmation 只作历史证据，不生成新认可。所有消费者与写入者一起切换；不做永久双写或遇错静默退回旧界面。迁移失败保留原件并报告。

通用 SYSTEM 同时服务有关联 Issue 与无 Issue 的原生项目任务；宿主仅为真实引用渲染 Issue 上下文、注入 issue-state 和允许相应标签副作用。指标配置加载 metrics-refresh，不自动加载 week-planning。旧提示构造器必须在切换时同步，未解析占位符不能当实际身份。

## 会话、任务导航与自动化

计划固定 bw/week-plan，验收固定 bw/week-acceptance，分别使用 .bw/worktrees/week-plan 与 week-acceptance 原生登记工作树，沿用 Orca 项目、宿主、工作区身份；不按路径字符串或标题猜项目归属。运行身份由项目、宿主、流程（plan / acceptance）与 Orca runId 定位，周期作为上下文；版本是选定后附加的材料关联，不是启动或去重的前提。自动触发可以先创建未关联版本的会话，Skill 列候选并与人确认；选版本不再开会话，恢复已确认的同次运行沿用真实关联。手动继续引用已有原生运行或会话。每次新的周期运行用 existing 工作区且 reuseSession=false，同次重试遵循原生运行身份，不换新树、不重开一条无人可找的会话。

原生历史列表是会话正本，BW 仅保存业务关联；关联缺失时仍可选择真实会话，不伪造标题。计划与验收各登记一条 Orca 自动化，以 creationKey 防重复，首次设置复用原生配置界面，保留用户的启停和时间；技能正文与 SYSTEM 指针从实际产品资产解析，覆盖没有 standard/ 的普通项目，不能只在 BW 自己仓里成功。

自动化是触发方式，页面是呈现方式，两者不绑定成两套工作。当前 Orca 的 automation-dispatch-handler 在后台启动，automation-run-workspace-action 打开原生运行工作区/终端；保留其不抢焦点和原生打开行为。从 BW 计划/验收入口进入时，以原生项目、宿主、流程和周期关联定位同一 run/session，在左侧回显该会话，右侧读取同份材料，不因换入口另建一次运行。尚无关联或已有多个未消歧运行时先选择，不能按最新标题猜。跨入口恢复由 CycleSessionPort 承接，本期不修改所有 Orca 自动化的导航目的地。

执行呈现只有原生会话与 BW 双栏两类：指标配置和普通任务执行用原生会话；版本计划/验收用原生会话加对应业务 UI。总览是查看、刷新和进入上述工作的汇总入口，不另立第三条执行流程。配置指标是手动原生任务，细节见指标设计。

TaskOrigin 携带项目、页面、版本、目标筛选、滚动和草稿引用。利用原导航历史返回，正文保存仍走原生权限与 mutation/cache；状态刷新不触发完成。项目切换和任务里进一步跳转后仍按有效来源恢复，来源已失效时给明确返回入口，不悄悄落回错误版本。

## 评审、归档与灯色

评审纪要为纯派生输出；复制不确认计划，打开弹窗不写批准。人的决定绑定内容修订；保存、评审、PR 待审、PR 合入分别判断。归档按钮向现有 composer 写入可编辑请求，由用户发送；没有会话先引导选择/开启，不私下创建 PR。

PR 关联存 provider/repo/number 和对应文档修订，实际 state/check/review 从原生 provider 读取。合入后的内容与当前草稿修订不同，则提示待归档变化，不能沿用旧绿灯。颜色规则来自 spec，按数据纯函数推导。

## 总览中的版本记录

计划和验收各提供材料到纪要及摘要的纯派生函数，不能分别维护总结副本；共享 VersionHistoryPort 按 version-records 的 cycleId/提交身份读取多周、同周修订及草稿。集成层在 OverviewPage 沿 main 保留版本页签与双栏内容区：切换版本即回填计划摘要和验收摘要；同版本多周在原处选择，全文页内展开，可打开只读来源或返回相应屏，不再用历史弹窗。缺记录保持空，旧进展/提交不代替验收，旧材料不推造日期和认可。v0.5 不新增里程碑模型或扩改总览其余区域。源码候选、材料归档提交和运行周期是不同身份。

## 验证与实现代价

核心 TDD：目标到纪要、修订冲突、来源隔离、内容改变后旧归档失效、运行键/自动化去重、返回上下文。集成复用原生 Tasks 与 Automations 用例，不复制它们全套测试。spec 的 P01–P10 和 PJ01/PJ02 在实现时登记目标平台 E2E，结果进 STATUS。

主要代价是旧 schema/CLI/提示/页面需要原子切换，以及普通项目的技能分发尚缺覆盖。执行顺序与并行文件所有权在仓外计划；先冻结共享契约再分三条特性线，不让各线分别造存储和会话适配。
