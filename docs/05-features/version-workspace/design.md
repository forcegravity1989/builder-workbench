# 版本工作区实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管本次设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：设计于 2026-10-20 评审定稿；接线要求的生产验证缺口见 STATUS。架构定位：§2 ①事实、执行、③规范、⑤壳，§3 Orca 执行核与 BW 叠层。

此节服务 [G2 高保真修订 9](version-workspace-prototype.html?rev=9) 的落地，并按 #439 已确认的局部行为同步。初始复用调查基线为 2026-10-20 的 main，落地机制以下文为准；原型仅是设计资产，不是生产运行证据。#439 全树原生菜单、绑定树独立可见与断链保留已作生产接线并完成静态检视；CI 补验结果见 [PR #441 验证报告](https://github.com/forcegravity1989/builder-workbench/pull/441)，真实用户与双主机验收仍待验证，已接入三屏 Issue 共用读取、固定回顾复用和建版等待收窄；性能增量目前仅作静态检视，实际耗时仍待测。行为判据见 [spec](spec.md)，证据见 [STATUS](STATUS.md)。

## #439 真机反馈局部纠偏（2026-10-27，用户已确认）

这轮修正既有能力，不新增特性。方案与边界见 [spec](spec.md)；[候选原型](version-workspace-prototype.html?rev=439-feedback) 演示已确认的局部变化，生产接线与检查结果见 STATUS。

- 项目墙进入保留项目总览，BW 侧栏定位最新在制版；复用原生激活时关闭原生区域 reveal，不改全局筛选。
- 原生项目列表只调整展示投影：当前合并项目所有宿主成员置首，按宿主限定身份排除已挂到有效版本入口的树，避免侧栏重复；未归版或缺版本目录的树仍从原生区可达；缺目标但版本有效的树由版本未分组区承接，解绑后回到此处。仅作展示投影，隐藏父级下的可见子树不改真实 parentWorkspace。其他项目默认收起且可展开；沿用原生行、全局工具栏和项目菜单，不造新项目分组。
- 版本树复用原生 WorktreeCard 与原生 row builder，主机标识、菜单、会话及子树不再由 BW 简化行重画。Issue 树名称统一自动名称判据与显示路径，复用已存 linkedWorkItem.title；显式手工命名优先，分支与目录不变。
- 版本任务入口改为完整原生任务查询加可取消的版本标签初始条件；目标入口额外投影现有 goalId。保留全部原生控件、分页、详情与开工，不再锁定计划引用集；当前引用只有 Issue，目标 PR 不作推导。CodeHub 标签查询必须先核实实际 CLI 契约，不能猜参数或把有上限的结果过滤冒充完整范围。
- 目标开工删掉 buildGoalStartNote 及仅用于它的计划预读，保留原生备注、Issue 链接、宿主与绑定/父级规则。公共计划读取与 #449 缓存保留。

下文保留有效的 P1–P6 机制；任务页锁定整版引用、隐藏原生控件及自动目标备注已由本轮方案替换，不能作为实现依据。

| 初始复用调查来源                                                                                                                                                                                                                                                                           | 可复用部分与必要适配                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [WorktreeLineage](../../../src/shared/worktree/lineage-types.ts)、[runtime controller](../../../src/main/runtime/runtime-worktree-lineage-controller.ts)、[parent picker](../../../src/renderer/src/components/sidebar/WorktreeParentPickerPopover.tsx)                                    | 单父级、避免自环/循环、按仓库/项目/宿主边界校验；复用父级选择与原生树形。父子关系不是目录嵌套或 Git 合并关系。                                                                                                                |
| [原生行构建](../../../src/renderer/src/components/sidebar/worktree-list/grouping/row-builders.ts)、[WorktreeCardAgents](../../../src/renderer/src/components/sidebar/WorktreeCardAgents.tsx)                                                                                               | 候选复用工作树卡片与会话激活；后者可接预过滤 agents，但当前活动/保留行不等于全部持久历史。不能只筛当前标签就宣称完整回看；工作树卡片、父子缩进及 agent 行本身也应复用，不另画一套生产组件。                                   |
| [创建参数](../../../src/shared/worktree/create-types.ts)、[创建执行](../../../src/renderer/src/hooks/composer-state/full-creation-execution.ts)、[父级处理](../../../src/renderer/src/store/slices/worktrees/create/worktree-create-parent-pick.ts)                                        | 同一原生创建路径已有 baseBranch、parentWorkspace、linkedWorkItem、sparseCheckout。基线与父级分开确定；父关系不携带父树的未提交修改，也不决定合入路线。                                                                        |
| [稀疏创建](../../../src/main/git/worktree-sparse-add.ts)、[高级创建选项](../../../src/renderer/src/components/new-workspace/NewWorkspaceComposerAdvancedSection.tsx)                                                                                                                       | 已有 no-checkout + cone sparse-checkout 及目录预设。计划/验收可考虑只检出必要资产，但需验证配置、Skill、材料、采集脚本及其依赖可读，不能默认所有仓库适用。                                                                    |
| [AiVaultPanel](../../../src/renderer/src/components/right-sidebar/AiVaultPanel.tsx)、[会话记录](../../../src/shared/agent-session-record.ts)、[BW 会话身份](../../../src/renderer/src/workbench/version-cycle/native-session.ts)                                                           | 复用原生历史与继续行为。持久会话位置、宿主、原生会话标识保持原协议；终端 pane 与 provider 历史标识不能假定同一。按版本跨工作树聚合仍需适配与重启验证。                                                                        |
| [versionSelection](../../../src/main/workbench/version-selection.ts)、[CycleWorkspaceProvider](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceProvider.tsx)（手动会话启动）、[自动化登记](../../../src/renderer/src/workbench/version-cycle/ensure-cycle-automation.ts)                    | 当前按固定分支定位，选版保存在工作树 metadata，自动化要求 existing workspace 匹配。只改侧栏筛选不足以实现两个版本独立运行；必须把运行归属与正在浏览的版本拆开。                                                               |
| [单树删除链](../../../src/renderer/src/components/sidebar/run-worktree-delete-with-toast.ts)、[删除预检与执行](../../../src/main/ipc/worktrees/removal/execute-worktree-removal.ts)、[工作区清理对话框](../../../src/renderer/src/components/workspace-cleanup/WorkspaceCleanupDialog.tsx) | 版本级清理复用与右击单树删除、状态栏清理对话框同一条删除链：预检（未提交修改/子树/归档 hook）、权限复核与失败提示全沿原生；BW 只加版本粒度的确认单聚合与 owner 标注。绑定挂在登记上、随删树消失，不另造删除路径或归档隐藏层。 |

复用必须覆盖 UI 和调用链：

- 计划/验收继续沿 [CycleWorkspaceShell](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceShell.tsx) 挂载现有板，左侧为 [AppWorkspaceShell](../../../src/renderer/src/app-shell/AppWorkspaceShell.tsx) 的完整 Terminal；本轮不改计划/验收业务板及其内部布局。G2 高保真将这套组合标为一个既有整屏，避免分别画两个占位区而误示新增屏幕。
- [TaskPage](../../../src/renderer/src/components/task-page/TaskPage.tsx) 没有通用的版本筛选 props，模型包含来源、全局缓存与分页。必须从计划的完整任务引用构建范围，通过原生数据路径读回并驱动同一列表；不能只过滤全局列表当前页，否则遗漏任务、计数不实。
- [原生 Issue 行](../../../src/renderer/src/components/task-page/github/Rows.tsx) 已有未关联时 Start、已关联时 Open；[执行动作](../../../src/renderer/src/components/use-task-page-workspace-actions.ts) 走原生创建器与激活路径。其 [关联查找](../../../src/renderer/src/lib/github-work-item-workspace-attachment.ts) 目前按 repoId、Issue 类型和编号取首个未归档树，不含版本/目标。薄适配须显式解析业务绑定，避免同 Issue 跨版时打开错误工作区。已有原生创建器可由目标入口预填上下文，但当前输入没有初始父级，完成回调也不返回工作区身份，需在创建链路取得真实结果后绑定。当前路径见 [nativeTaskPort](../../../src/renderer/src/workbench/native-task-port.ts)，不另建 Issue 数据正本。
- 计划里的 Issue 继续进共用原生详情；本原型移除独立开工/继续，与 #385 的计划直接开工诉求留作 G3 对齐。如保留快捷入口，只调用同一个原生动作。
- [OverviewPage](../../../src/renderer/src/workbench/OverviewPage.tsx) 保持现状。项目总览仅标明沿用入口，不嵌入或复刻已有原型；新增版本总览服务本版承诺、事实与验收总结，不代替项目总览。

布局将版本与目标作为逻辑目录；新建版本准备计划和验收两棵独立固定树，保留流程入口，实际树使用同一套 Orca 原生卡片独立呈现。目标工作树按需创建，Issue 使用同一原生创建器；合适父级是可修改建议，不强制嵌套。创建交给原生执行核，BW 负责导航和明确的业务归属；不重建终端、会话租约、历史存储或另一套任务完成状态。实际薄挂载能否满足全部接缝还需验证；如必须改变 Orca 核心、协议或宿主路由，先提交具体取舍给人决定。

空间成本不能只看 Git 对象共享。此基线 git ls-tree -r -l HEAD 的 24,608 个文件 blob 合计 192,575,617 字节（183.7 MiB）；这是受控内容体积，不是实际磁盘占用，不含依赖、构建产物、LFS 内容或文件系统开销。4 个目标、10 个 Issue 加计划/验收，若全部预建是 16 棵；版本根与计划另分则是 17 棵。原型按需创建，未开展的目标不建树。Git 对象共享和工作区独立的机制见 [Git worktree](https://git-scm.com/docs/git-worktree)，稀疏范围与限制见 [Git sparse-checkout](https://git-scm.com/docs/git-sparse-checkout)。未测真实大仓耗时、磁盘占用或跨宿主稀疏运行。

落地前必须明确的边界：

- 分支/材料：计划、验收、目标与 Issue 的起点、同步与合入规则；计划和验收材料的读写位置及 CAS 修订；分支命名不是稳定身份，不能靠字符串解析建立版本归属。两棵流程树的分支/材料初始化决定已在下节「P2 落地」定稿；目标与 Issue 树随 P4 定。
- 自动化：定时运行如何选择已明确版本、首次登记如何避免跨版本重用、如何保留人的模型/时间/复用设置。不能拿 UI 上次查看版本当执行参数。
- 会话回看：各版本并列，不做专门历史会话入口或归档分区；已归档版本留在原位置带标识回看。旧共享树不整体改父级；保留原生入口，人核对后再建立业务关联。历史读回须覆盖已退出会话、不同工具/provider 与重启。
- 删除与跨版引用：版本级清理＝人确认的批量删除（默认本机 owned，他宿主实例列而不勾、显式勾选才经共享通道删），复用原生预检与权限链；绑定挂在登记上、随删树消失，任何删除路径不得残留悬空引用。不把删除工作树等同删除版本（材料与目录保留），不以 Git 材料可读承诺会话可恢复。一个 Issue 可被多版引用，一个原生子树只有一个父级；引用不复制完成记录，跨版工作区绑定由绑定契约明确。
- 发布总结：版本总览按计划与验收派生，不新增手填报告正本；沿现有材料的固定提交/修订与发布证据回看，不新增冻结操作或报告副本，不能用当前 Issue 状态冒充当时验收。

### P1 落地：绑定契约与版本目录（2026-10-21 实施定稿）

- **绑定契约**：`src/shared/workbench/version-binding.ts`（schema 1，workflow 与 goalId/taskSource 一致性 refine）；读回规范化把脏数据一律收敛为未绑定，不猜归属。绑定是版本归属唯一正本——不从分支字符串、会话标题或日期反推。
- **原生挂载**：`WorktreeMeta.workbenchVersionBinding`（undefined 保留 / null 清除）、`worktree.set` 白名单、`mergeWorktree` 投影规范化、runtime capability `workbench.version-binding.v1`（无能力对端不下发、双方向门控）。BW 薄 helper `workbench.versionBinding.read/set`：原生身份定位、owner 验证、identity 选择器写入、读回确认才返回，不接受客户端路径。
- **版本目录**：`src/shared/workbench/version-catalog.ts` + 装载器——已提交材料 ∪ 存活绑定，去重保留材料来源，已清理版本条目保留（retired 收起回看）；绑定从登记现算，删树无悬空；草稿与目标从已保存计划派生，缓存按 owner/项目/仓库/版本/修订分隔。版本排序 `compareMaterialVersions`（点分段、纯数字段按数值）为单一实现：目录条目、项目总览、验收版本候选三处消费方已收敛，不再各持 Intl/裸 sort 口径。

### P2 落地：新建版本与两棵流程树（2026-10-21 实施定稿）

- **分支与命名**：流程树分支 `bw/<version>/plan`、`bw/<version>/acceptance`（沿 bw/ 命名空间）；树名 `plan-<version>` / `acceptance-<version>`。版本名过 MaterialVersion 目录规则后还须能组成合法分支名（Git ref 规则），不合法拒绝创建并如实报因。分支名只是 Git 起点与入口提示；版本归属始终由登记上的绑定决定，不从分支字符串反推。
- **编排在归属 runtime**：BW 薄服务 `workbench.versionWorkspace.prepare`（main 侧），宿主端预检——登记清单、Git 扫描（detected）、材料目录——不只信 renderer 当前列表。预检矩阵：同版同用途已有绑定活树 → 复用（不重建）；分支被不能证明归属本版的树占用 → 拒绝并报占用者，不劫持、不自动清理；分支存在但无树占用 → 作为创建起点交原生复用同名分支（归属仍由新写绑定决定，即「核对来源再采用」：不能证明的来源只当 Git 起点、不当本版流程树）；版本已有材料 → 不重复建版、不覆盖（空计划初始化 create-only）。
- **去重**：每棵创建经原生 `dedupeWorktreeCreate`（clientMutationId 由 version+用途确定性派生）：同宿主 in-flight 的双击/多窗口/共享端重试返回同一创建；失败重试重新发起（原生语义）。
- **步骤链非原子**：计划树 → 计划绑定 → 空计划 → 验收树 → 验收绑定；每步即时落盘（原生登记/绑定登记/材料文件）。某步失败保留已成功结果、逐步返回状态与问题，不回滚、不删树；用户离开或超时不销毁宿主进程内的执行；重试=重入同一 prepare，按宿主真实登记补齐缺失步骤。补齐边界如实：「创建成功但绑定未写入」的窗口（实例身份缺失或写绑定失败）不在自动补齐范围——重入时该树按占用且归属不可证如实拒绝（不劫持、不按分支字符串认领），恢复需人工补绑定（P3 提供入口）或清理该树。
- **创建结果核对**：原生返回分支非约定分支（占用触发 uniquify）→ 不绑定、不初始化、不标成功；误建树沿原生删除链默认口径 best-effort 清理（不附 force/豁免、不放宽删除安全规则），清理失败如实提示人工处理；并行对手已建对分支 → 按绑定重新发现并采用（winner adoption，较 ensureNamedWorktree 的分支名口径更严格：归属只认绑定）。
- **绑定写入强制实例围栏**：创建链写绑定必须携带创建结果的 instanceId（此处是天然必填点；身份缺失报错不写）。
- **空计划初始化**：PlanningMaterial schema 3（randomUUID 新 cycleId、空 summary/goals/tasks；可用前版来源由既有目录排序先定位紧邻版本再读取其验收，缺少不回退，已有材料固定来源不替换），走同一材料事务核心（version-document-store：create-only、跨进程互斥、原子替换、写前重新授权）；写前核对树 HEAD 为约定分支且 common-dir 归属本仓库。本地/配对宿主直接写；SSH 宿主经 relay `workbench.materials.execute` 窄执行器新增 initialize 操作。验收树不初始化材料（依据明确再写）。已存在的材料（含 migration-required）一律不覆盖、如实回报。
- **禁止面**：不启动 agent、不激活视图（activate:false，导航由 P3 入口决定）、不启用自动化、不预建目标/Issue 树、不 commit/push 材料。
- **J2 判据（创建失败恢复）**：中断第二棵流程树准备再重试 → 第一棵树、绑定与空计划全保留，最终恰两棵、无重复绑定、材料修订不变；双击/两窗口并发 → 宿主端去重使每用途恰一次创建；材料已存在 → 初始化跳过。真壳 J2 归人验证，协议单测先看护编排语义。

### P4/P3a 落地：任务范围、开工链与版本化导航（2026-10-21 实施定稿）

- **任务屏范围契约**：版本入口保留本次版本上下文，预选可取消的版本标签，沿原生查询与分页；只有目标条件使用完整材料引用点读后筛选分页。Issue/PR、预设、仓库、搜索与原生过滤均保留；现有材料只有 Issue，保留目标时 PR 为空，取消目标后沿原生 PR 查询。去版本同时清目标，移除后的条件不再参与 Start/Open 绑定。入口条件不写全局 resume 查询，不改任务正本。
- **统一 Start/Open 解析**：归属只认绑定+原生 linked 字段（shared/version-workspace-match.ts 纯函数核，协议单测看护）：Issue 树=绑定 (version, issue, taskSource) ∧ linked (type=issue, number, provider)；唯一→直开、多候选→BW 选择器（模块 store+Radix Dialog，挂载于侧栏层——任务屏、详情弹窗与侧栏入口在任意视图共用）、无→原生创建器；PR 行与无范围路径保持原生「首个未归档树」语义。三处分发壳（板面开工箭头 issue-start-action、任务屏行、详情弹窗）共用 `dispatchScopedWorktrees`（唯一直开/多候选选择器/无返 'none' 回落；埋点与回落文案留调用方）。目标树/流程树同一绑定口径；父级建议仅唯一同项目同宿主目标树时给出（不建议不预建，原生选择器与创建期校验仍是权威）。
- **开工与创建结果绑定**：目标/Issue 开工复用同一原生创建器，BW 只带入 initialParentWorktreeId 建议与 workbenchCreation 归属；原生备注由用户填写，不自动生成目标长备注或仅为备注预读计划；绑定在提交时按创建器**最终**仓库+最终任务来源解析（改仓库即失效），写入发生在**真实创建结果处**（result.worktree，早于取消/激活分支——树既建成归属即应记录），instanceId 必填围栏、读回确认、失败保留树+「重试写绑定」不重复建树；取消（未创建）零绑定。quick/background 链经 `WorktreeCreationRequest.workbenchVersionBinding`（纯可序列化，Retry 原样重放）；full 链镜像。
- **main 侧版本化**：绑定即版本正本——材料授权（期望分支由绑定派生、跨版读写拒绝 cross-version、用途不混、list 只呈现绑定版）与选版（context 恒回绑定版、select 他版拒绝、不写第二份选版偏好）都在服务层+执行器双围栏；SSH 窄执行器命令带可选 binding（无绑定树不带字段，旧对端不受扰）；无绑定树全部沿旧固定分支语义（旧上下文显式保留）。common-dir/写前再授权/CAS 事务核不变。
- **侧栏与进屏**：版本行=目录现算（材料∪绑定∪已提交目标回看），流程行=业务入口+本树入口合一（原生 agent 行/原生菜单/原生激活链复用）；进屏定位绑定树优先且**不进 ensure 路径**（多实例交选择器、无树如实拒绝，浏览不建树）；旧固定树仅在已存在时作为旧路径；「＋新建版本」与版本行「初始化工作区」共用 prepare 重入补齐语义。当前浏览版本是 UI 偏好（按项目隔离持久化），不是归属/执行正本。目录装载：多计划树入口（各版绑定树按自身 owner 路由＋旧固定树 legacyTrees 后置，绑定树排前）、草稿读取失败进 problem 通道、retired 版本目标从已提交计划派生（readPlan 固定来源，只读回看不要求树）、collect 按 projectId 过滤前提。延后项收口：分支 ref 匹配提共享单实现（`reusable-branch-ref.ts`，main/renderer 同口径）；本地 IPC updateMeta 仅绑定字段显式 undefined=保留剥除（其余键沿原生 present-but-undefined 清除线约，H-1 收窄）。
- **历史 P5 前自动化护栏（已由下节取代）**：creationKey 尚无版本维度——绑定树跳过旧身份 ensure、start/configure 如实拒绝（防运行落错树、防条目错挂），legacy 树零变化；版本化自动化身份与提示词归 P5，屏内按钮改绑归 P3b。

### P3b/P5/P6 落地：收尾定稿（2026-10-22，计划屏 #399 合入后）

- **屏内选版移除（P3b①）**：绑定树在计划面包屑与验收页头只读回显绑定版本（计划 `.g3-version-bound`；验收 v10 板面为 `AcceptanceHeader` 的 `boundVersion` 回显 `.acc-version-bound`，满板与空板共用），无屏内切换；旧无绑定固定树保留下拉与 `workbenchSelectedVersion` 偏好（J1 口径不变）。`VersionCycleContext.boundVersion` 由 Provider 从流程树绑定派生；main 侧跨版拒绝仍是唯一围栏权威，UI 移除只消灭死入口。验收屏 v10（#394）合入后回显已重接其页头（v10 原注释预留「until G2」接缝）。version-planning spec 选版条款已回写（其 design D1 标注落地）。
- **Issue 开工箭头永久 hookup（P3b②）**：板面 Issue 行箭头接 `issue-start-action.ts`——与任务屏范围行同一解析核（绑定+linked 双重证明；唯一直开/多候选选择器/无则原生创建器预填＋创建结果绑定）。版本未知或 provider 不在开工面（读回仅 github/codehub 就绪）回落原生详情；标题链接进原生详情语义不变，不另造继续逻辑。
- **单树绑定/改绑/解绑**：`WorkbenchVersionBindingMenuItems` 薄挂载到全树原生 `WorktreeContextMenu`，普通项目树、版本流程树、目标/Issue 树与多实例中的具体树入口一致；不保留版本级“绑定已有工作树”按钮或批量绑定。选择器沿 `version-tree-bind-dialog` 与宿主路由绑定服务，流程用途须符合 `bw/<版本>/<用途>` 分支围栏；Issue 用途先从真实计划目标选引用，再读回 Issue；原生 linkedWorkItem、任务来源与版本绑定通过同一次 identity metadata 更新保存并共同读回核验，保留 instanceId 和宿主围栏。旧宿主不支持新增请求字段时整笔拒绝，不先改原生关联。解绑只清该树版本绑定，稳定身份、父子关系、linked task、文件与原生会话均保留，不级联改绑或解绑子树。
- **版本级清理（P3b④）**：确认单=版本语义清单层（本版全部存活绑定实例；本机 owned 默认勾选、他宿主列而不勾＋owner/预检/在跑会话标注；断链宿主不可勾选，执行也复核；显式勾选可达宿主才经共享通道在归属宿主删除）；预检状态与原生确认单同一 hydration 来源；执行交原生 `runWorktreeBatchDelete` 漏斗（Orca 确认单/预检/force/宿主路由全原生，批量必确认）。删除只改执行面，目录现算无悬空绑定；不改写自动化条目——本版已启用的版本化自动化按本机登记探测（creationKey 全键精确匹配）在确认单如实提示，他宿主 runtime 条目不跨机探测（留白）。P3a 占位对话框同交付删除。
- **只读回看（P3b⑤）**：无绑定树且无旧固定树的版本，计划/验收屏挂 `VersionReadonlyMaterialView`——history RPC 按目录固定 sourceCommit/revision 读主干已提交材料，human-guard 字段只呈现状态不提供入口；工作树/会话不可用由登记缺失推导；缺材料/读取失败如实报，浏览不建树。
- **P5 自动化身份版本化**：creationKey=`bw-cycle:<scope>:<workflow>[:<version>]`（绑定树加版本维度，每版独立登记）；条目名版本在前；提示词钉绑定树真实分支＋绑定版本（context.version=绑定版，「绑定即定、不切版不推断」文案）。计划、验收两侧 start/configure 护栏均已撤除（验收侧随 #394 合入、验收 Skill 正本 v0.7.1 绑定感知同步后放开；`useEnsureCycleAutomation` 的临时 skip 参数同轮删除，不留兼容层）。standard/ 两侧同步：week-planning SKILL 归档步绑定感知（0.6.1，随 #410 合并为 0.7.1）＋version-acceptance SKILL v0.7.1（恢复/归档步：绑定版本树 bw/<版本>/acceptance、旧无绑定树 bw/week-acceptance 逐字保留）＋version-records 命名与 v10 语义合并＋asset-audit 读取处；bundle/manifest/registry/stub 重生成 verify 双检通过。R9 墙读数：`resolvePlanContext`（拆出 `wall-plan-context.ts`）绑定优先——跨注册行恰一个绑定版本为正本；多在制版本如实「版本未定」，不猜不回落旧偏好。
- **P6 版本总览**：高保真修订 9（人确认「最简、表格周报风格」）；侧栏每版「总览」行启用；总览页=activity 槽 `project-page-state` 模块态挂载（与项目墙/名片同机制，activeView 切换即清），一版一页只读派生：事实区（工作区登记现算/归档 PR 记录＋薄读取合入状态/发布证据如实未探测/纪要共识与遗留闭环计数）＋目标周报表（承诺/Issue 引用数与任务屏入口/人工验收结论/遗留下一步）。主干已提交材料固定来源读取；未合入草稿如实标注以计划屏为准；在制与已清理版本同一读路径。

### 伴飞裁定落地（2026-10-25 夜，#436 伴飞汇总 PR #437）

人装机伴飞 v0.7/v0.8 旅程逐条 AskUser 拍板，实现取舍如下（UI 判据见 spec，本节只记设计面）：

- **初始化入口重排（CF-5）**：流程行菜单的「准备流程工作区」删除——入口挪版本行图标按钮（FolderPlus，非三个点），流程树不齐（plan/acceptance 任一缺）才显示、两树齐即消失；点击**直接执行** prepare 无确认单（人裁定：创建类不设确认单，busy 态＋toast 如实回报），执行链住 `version-nav-actions.initializeVersionWorkspace`，准备结果的 `prepareFailed` 判定在 `shared/workbench/version-workspace-prepare.ts`，由新建对话框、直接初始化与主进程协议测试共用；展示摘要由 renderer 的 `version-workspace-prepare-report.ts` 生成；归档版本不加拦截提醒（归档版继续干活是合理旅程）。NewVersionDialog 只剩 create 模式（prepare 模式失去调用方同交付删除）。只读回看指路文案对齐。
- **prepare 建树 setup skip（CF-5）**：创建参数 `setupDecision:'inherit'→'skip'`（原生既有开关，automations headless 同口径）——不开 Setup 终端、不装依赖、建树跳过 setup 脚本；流程树上会话 agent 需要依赖时自己装（材料读写与 CLI 注入不需要）。legacy 固定树 ensure（native-workspace.ts）显式不动。
- **树行与原生会话**：版本树由登记和绑定现算可见，不以有无已恢复会话为条件；会话行和历史继续复用 Orca 机制。各具体树整行右击复用同一原生菜单；流程多实例直接展示具体实例，不用三点菜单代替树本身。业务目录动作与单树维护分开，单树改绑不改父子或其他树归属。宿主断链只显示原生连接图标，不追加 BW 离线标签或 toast，点击保留当前内容；绑定/清理执行仍校验宿主可达性。侧栏复用原生滚动，不给数据目录引入第二套滚动。
- **计划/验收初态**：prepare 的空计划不表示流程已开始。两屏未开始显示短卡，只有原生运行会话实际打开后才展开四区；无目标保持空列表。启动视图按流程/版本/scope/owner/工作树在渲染进程内保留，切屏不重现开始卡；已有有效材料独立恢复，不从普通 shell 推断。显式“初始化工作区”继续沿 prepare 补齐，不因浏览或断链激活自动建树。
- **版本查询与目标身份**：CodeHub 版本标签经已有 listTasks → service → IPC/RPC → CLI 下推 AND 查询；沿原生每仓 250 条，CLI 自动翻页并以 limit+1 推导 hasMore，界面明确还有更多，目标引用点读仍完整。目标 @me 按每条任务实际 repo 的来源、runtime/WSL 与托管站点调用只读 viewer，GitHub 不借用全局本机账号；只在需要身份时查询、刷新重新读，失败显示未知，不持久化账号或凭据。
- **三屏 Issue 读取**：任务页只有目标条件使用完整引用投影，版本入口走原生标签查询；task-reference-reader 与 native-task-port 统一计划、验收、任务屏及上版实时 Issue 的同源缓存与在途合并。GitHub 坐标归一后按现有支持域每 20 号调用 gh:workItemsBatch，成功片保留，失败/缺项补单读；environment runtime 不跨机代读；fork、非 origin 登记远端、显式 upstream 偏好与带端口 GHES 保留原生点读的选源语义。CodeHub 保留 issue/MR 读回和全局 6 并发上限。缓存只回显旧读数，后台读回整批发布；手动刷新等旧请求结束后再查源头。创建版本仍准备两树，但只等待目标主机登记读回，其他主机刷新不阻塞打开。
- **Issue 工作树名称**：原生意图种子保留编号；自动预填在快捷/完整创建和分支重名去重后仍保持自动管理，显式人工名优先。两处侧栏均复用原生卡片标题规则及已保存的 linkedWorkItem.title，稳定展示 `#编号 完整标题`；分支保留在悬停与详情。已有 fixed 名称即使恰等于标题或分支也不替换，改绑不修改 pinned；旧宿主缺命名模式时仅保留原生空名/分支名回退，不按文本猜测非空名称的来源。
- **开工预热（CF-6c）**：开工入口 openModal 前 fire-and-forget `prefetchWorktreeCreateBase`（命令面板同款）＋`repos.getGitUsername` 既有 IPC（触发 gh 用户名探测的进程级缓存，创建时分支前缀解析直接命中）；零新增原生 API、不改创建参数；超时重试窗口语义是原生的，不动。
- 同 PR 早轮已落：版本排序显示层在制优先＋降序（CF-2，目录契约仍升序）、清理确认单文案精简（CF-7）、补绑定改「把工作区纳入版本」四步选择＋Issue 用途双标记（CF-4）、全局任务入口恢复显示（CF-1 再裁定）＋两入口 tooltip 区分。

原型构建：node docs/05-features/version-workspace/prototype/build-g2.cjs；加 --check 校验源码与生成物一致。独立 JSX/CSS 与真实计划快照在该特性的 prototype/ 下；复用现有 vendor.js 与设计系统资源，不修改已确认的旧原型。

接线要求：材料读写层 version-material-workspace 和选版层 version-selection 都校验旧固定分支；必须一起适配，不能只改侧栏。原生 worktree.set RPC 当前不含 BW 版本绑定字段，且旧宿主可能丢弃未知字段，新增绑定字段必须经授权的宿主契约与能力检测读回验证；版本级清理复用既有删除 RPC，不新增契约。TaskPage 的范围要覆盖完整引用与分页，自动化 creationKey 也需含已明确版本，不能以最后浏览版本改变执行对象。历史只读入口必须避开现有进屏自动准备工作树的 hook；树已删除的旧版本回看同样走只读来源，不触发准备树。以上接线要求的生产验证缺口见 STATUS。
