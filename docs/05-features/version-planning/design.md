# 版本计划实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管本次设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：已授权实施；详细设计未逐项细审，未决项须人工确认。已实现范围及证据见 STATUS，正文按当前接线回写；未标注落点的接口仍为设计。架构定位：§1 项目版本，§2 ①事实、②执行、③规范、⑤壳，§3 Orca 执行核与 BW 叠层。

## 现状与复用

本轮已完成入口切换：旧三屏链条（PlanJourneyShell / PlanWeekBoard / PlanWeekPlanChat / plan-week-* / workbench-plan.css）已退役删除，以下为当前接线。

| 落点 | 采用方式 |
|---|---|
| AppWorkspaceShell → CycleWorkspaceProvider / CycleWorkspaceShell | artifacts 只作固定树准备入口；ensureCycleWorktree 后正式选择并切到 terminal，paired 宿主先激活。terminal 当前树为 bw/week-plan 或 bw/week-acceptance 时，在唯一原生 Terminal 旁挂右板；不扩 TopLevelView |
| 原生 Terminal / TabBar / RightSidebar | 完整复用会话、标签/分屏、资源管理器与历史；TabBar 薄挂 CycleStartButton，隐藏固定树工作区的原生项目列表。移除 CycleChat、历史嵌入、portal 重发布和 sessionStorage 会话绑定 |
| main/workbench/version-document-store + `workbench.materials.*` RPC / `ORCA bw materials` CLI | 跨进程 CAS 统一写入；renderer 直接 writeFile 的旧链路已删除 |
| TaskPageContent → GitHubItemDialog → ConversationTabDescription / GitHubMarkdownComposer | 直接复用页面、正文编辑及 runWorkItemBodyUpdate；BW 不复制详情组件 |
| use-task-page-detail-routing 的 worktreeNavHistory / goBackWorktree | 导航历史携带 BW 来源；openTaskPage 新增 returnToPreviousView（跳过 tasks 哨兵，返回 BW 来源视图），BW 子视图与屏内上下文由 cycle-view-state 和 use-planning-view-memory 恢复。计划屏 goalFilter+滚动存 sessionStorage（use-planning-view-memory） |
| shared/automations-types | 复用原生登记和运行记录；「配置自动化」按钮预填原生自动化编辑器：host 按工作树宿主身份，existing 固定树、reuseSession=false、prompt 不含 cycleId，启用/时间由人确认 |

## 共享边界

BW 业务放在 renderer/workbench 下的 version-cycle、version-planning、version-acceptance、metrics 子域。Orca 组件只接收通用导航来源或调用回调；计划、验收、指标相互通过数据契约协作，不跨屏导入页面组件。

| 所有者 | 责任 | 不拥有 |
|---|---|---|
| BW version-cycle 共享层 | 项目/版本上下文、版本材料读写、目标卡骨架、会话/任务/归档适配 | 调度器、聊天日志、Issue 正文和状态正本 |
| 计划 | 版本目标、总结、任务引用、派生纪要 | 验收结论、指标采集实现 |
| 验收 | 固定计划引用、实际交付、人的结论和后续 | 改写原承诺、自动完成 Issue |
| 指标 | 定义、窗口、采集和读数；详见 [指标设计](../overview-metrics/design.md) | 版本目标值和验收结论 |
| Orca | Tasks、工作树、会话、Automations、项目/宿主身份、通用文件与命令权限 | BW 的业务规则 |

共享接口已按职责落地为 renderer 端口 + 原生 RPC：VersionHistoryPort.list/read/readPlan（version-history-port，按固定 Git 提交发现及读取多周记录）、「配置指标」经 CycleWorkspaceProvider 直接进入 bw/metrics-refresh 固定维护树原生会话（提示由指标模块提供；不设端口抽象，原死契约 MetricSetupPort 已随收尾代码批删除）、VersionDocumentPort.read/save(expectedRevision)（version-material-port）、TaskPort.listVersion/openDetail(origin)/refresh（task-port，github.workItem / codehub.viewTask 复用原生读取层，单条失败 kind:'unavailable'）、CycleSessionPort.prepareRequest（version-cycle/ports + native-session，仅识别当前原生焦点并插入未发送草稿）、ArchivePort.readStatus（archive-port）、MetricsPort.list/read/refresh（metrics-port，指标端定义）。底层仍调用原生能力，不另建存储。

## 版本材料与写入

保留 .bw/planning/<version>/data.json，目标 schema_version=3；原结构里的 plan.goals 演进为稳定 goalId 对应的结果承诺、可选交付说明/验收说明、可选 metricRef 与版本目标。风险和进展保持 summary 语义，进展标明所述版本，不把上版结果冒称本版成绩。版本周期不由自然周推断。计划入口初态为待选择版本，列举候选不写盘；用户在 UI 或会话明确选择后才加载可编辑材料，明确新建后才创建。禁用 mtime 推断当前版本与自动 init default；加载失败不能新建替代物。

任务只保存 provider/repo/number 与 goalId 的引用，展示状态从 Orca provider 读回；缓存有读取时间，离线不是空任务。三段纪要从目标纯函数生成，不再存 live_notes、transcript、独立可编辑 minutes。协议细节的唯一模型参考是 [version-records](../../../standard/system-prompt/references/version-records.md)。

UI 与模型共用在文件所属宿主执行的版本材料写入核心；模型入口是宿主下发的 `ORCA bw materials` CLI 薄入口。写入含受信任项目根、版本路径校验、expectedRevision、跨进程互斥和原子替换；重读修订后再提交，锁范围只含本文件事务，不锁住模型对话。CLI 与 UI 不各自实现一次校验。planning.py、version-plan.html 模板与 data-template.json 已在消费方切换的同一交付内退役删除，旧 confirm / submit-confirmed 不再控制任何流程；check-week-comment.py 与 week-plan-comment.md 保留作历史评论修复协议。

材料事务核心位于 src/main/workbench/version-document-store.ts，共同身份与 read/save 类型位于 src/shared/workbench/version-document.ts。它只接受明确版本，读取不存在材料无副作用，修订按原始字节计算；复用 proper-lockfile 和 Orca durable-file-write。计划/验收结构由 shared/workbench/version-material.ts 校验，共同层验证 schema/version/cycleId。schema2 只报告需显式迁移；不做自动升级。

材料服务通过 BW 的 main/workbench/version-material-runtime 组合适配，使用 Orca 原生 runtime RPC、项目/工作树解析及 SSH relay。页面 nativeVersionMaterialPort 按原生 worktree 的 hostId 和 runtimeOwnerEnvironmentId 路由，配对客户端与执行宿主分开处理；CLI 沿用选中的 runtime，不因 isRemote 禁用。workbench.materials.list/read/save 与 orca bw materials 共用校验；请求只传身份，文件根由原生登记解析。文件所属宿主运行同一材料事务，核对 Git common directory 与实际固定分支，并在文档锁内重查。WSL 元数据路径复用原生转换。list 无写入副作用，不默认选版本。

流程选版是原生 worktree 偏好 `workbenchSelectedVersion`（main/workbench/version-selection.ts）：context 只读、select 只写偏好，CLI `ORCA bw materials context/select` 与 UI 共享同一偏好；无 session→version 永久映射，历史会话切换只换左侧聊天，不自动切右侧材料。跨周有限场景：同版本计划/验收各只一轮活动材料，归档后由人明确开下一轮。

计划/验收屏与 CLI 均已消费这些入口，旧 Plan 页面和旧开工提示已删除。材料校验只证明结构及写入一致性，不能证明引用的脚本读数真实、计划已合入或记录中的人已认可；对应特性必须从真实来源读回后推导状态。外部 Git 操作不受材料锁控制，提交前的分支复核不等同于锁住所有 Git checkout。

schema2 通过一次显式迁移转为新计划；原文件/提交保留来源，旧 results 导入验收草稿并记录其实际归属版本，旧 confirmation 只作历史证据，不生成新认可。所有消费者与写入者一起切换；不做永久双写或遇错静默退回旧界面。迁移失败保留原件并报告。

通用 SYSTEM 同时服务有关联 Issue 与无 Issue 的原生项目任务；宿主仅为真实引用渲染 Issue 上下文、注入 issue-state 和允许相应标签副作用。指标配置加载 metrics-refresh，不自动加载 week-planning。开工提示由 `version-cycle/cycle-prompt.ts` 渲染 bundled SYSTEM.md.tmpl 并内嵌对应 Skill 发现 Stub（指南与 references 经 `ORCA skills get` 按需读取）；占位符未解析即抛错，不会把占位符当实际身份递交。

## 会话、任务导航与自动化

计划固定 bw/week-plan，验收固定 bw/week-acceptance，各复用一棵 Orca 登记工作树。项目未设置基址时先写入项目级 .bw/worktrees 并提示，用户已有设置保留；原生创建与默认分支规则不变。入口仅准备一次工作区并切到 terminal；切树离开即卸下对应业务板，不持续纠正原生选择。材料身份按项目、宿主、流程和固定树解析。版本仍由人明确选择，不跟会话标题或日期联动。

计划与验收完整复用 Orca 原生会话工作区：顶部新建会话和 Agent 控件、标签/分屏、资源管理器、智能体历史及可收起的工具侧栏均由 Orca 拥有。隐藏原生左侧项目/工作树列表，保留 BW 导航。BW 只在右侧提供业务板，在原生标签栏增加“新建计划”或“新建验收”；不另建聊天、历史或会话绑定。

“新建计划／验收”调用对应已登记自动化的原生手动运行，使用用户当前保存的提示、工具和模型，并自动打开、聚焦本次原生会话；定时运行仍在后台。普通原生新建会话不自动注入 BW Skill。首次登记默认关闭定时，按 creationKey 去重，已有条目不覆盖；“配置自动化”打开原生编辑器。每次新运行使用固定工作区、reuseSession=false，历史恢复和运行打开完全沿用 Orca。

自动化运行与历史恢复继续打开原生 terminal；识别当前固定树后自然显示右板，不再保存 BW run/session 恢复映射。native-session 只读取当前聚焦的结构化会话或终端叶子，并在插入业务草稿前复核宿主、工作树和焦点；不创建布局、选择历史或恢复聊天。

旧格式或损坏材料只在右板顶部显示一行提示，点明实际版本与计划/验收数据文件，并附“在会话中处理”。点击新建原生会话，携带 SYSTEM、对应 Skill、具体文件和读取问题，沿原生就绪后发送通道自动递交；即使当前没有会话也可使用。模型先读文件、说明问题与备份/迁移方案，经用户确认后执行，不把点击按钮当成同意改数据。页面不保留专用迁移预览/确认弹窗或额外的旧结果入口；迁移工具及安全约束仍由材料服务和 Skill reference 承担。

执行呈现只有原生会话与 BW 双栏两类：指标配置和普通任务执行用原生会话；版本计划/验收用原生会话加对应业务 UI。总览是查看、刷新和进入上述工作的汇总入口，不另立第三条执行流程。配置指标是手动原生任务，细节见指标设计。

TaskOrigin 携带项目、页面、版本、目标筛选、滚动和草稿引用。利用原导航历史返回，正文保存仍走原生权限与 mutation/cache；状态刷新不触发完成。项目切换和任务里进一步跳转后仍按有效来源恢复，来源已失效时给明确返回入口，不悄悄落回错误版本。

## 评审、归档与灯色

评审纪要为纯派生输出；复制不确认计划，打开弹窗不写批准。人的决定绑定内容修订；保存、评审、PR 待审、PR 合入分别判断。归档按钮向现有 composer 写入可编辑请求，由用户发送；没有可用原生聊天输入框先提示选择/开启，不私下创建 PR。

PR 关联存 provider/repo/number 和对应文档修订，实际 state/check/review 从原生 provider 读取。合入后的内容与当前草稿修订不同，则提示待归档变化，不能沿用旧绿灯。颜色规则来自 spec，按数据纯函数推导。

## 总览中的版本记录

计划和验收各提供材料到纪要及摘要的纯派生函数，不能分别维护总结副本；共享 VersionHistoryPort 按 version-records 的 cycleId/提交身份读取多周、同周修订及草稿。集成层在 OverviewPage 沿 main 保留版本页签与双栏内容区（use-version-minutes.ts：归档 history.read 优先、当前选版回落 live 材料）：切换版本即回填计划摘要和验收摘要；同版本多周在原处选择，全文页内展开，可打开只读来源或返回相应屏，不再用历史弹窗。缺记录保持空，旧进展/提交不代替验收，旧材料不推造日期和认可。v0.5 不新增里程碑模型或扩改总览其余区域。源码候选、材料归档提交和运行周期是不同身份。

## 验证与实现代价

核心 TDD：目标到纪要、修订冲突、来源隔离、内容改变后旧归档失效、运行键/自动化去重、返回上下文。集成复用原生 Tasks 与 Automations 用例，不复制它们全套测试。spec 的 P01–P10 和 PJ01/PJ02 在实现时登记目标平台 E2E，结果进 STATUS。

主要代价曾是旧 schema/CLI/提示/页面的原子切换，本轮已同次完成退役；普通项目的技能分发经产品内置投影覆盖，不依赖项目自带 standard/。执行顺序与并行文件所有权在仓外计划；先冻结共享契约再分三条特性线，不让各线分别造存储和会话适配。
