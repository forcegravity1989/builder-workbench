# 版本工作区实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管实现设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：设计已评审定稿；接线要求的生产验证缺口见 STATUS。架构定位：事实与执行由 Orca 承担，规范与壳由 BW 叠层适配。

本文维护有效的版本工作区机制；侧栏布局以[当前高保真](prototype.html)为准。行为判据见 [spec](spec.md)，实施与验证证据只在 [STATUS](STATUS.md)及关联 PR 维护。

## 侧栏布局与原生复用（#475 / #500）

Rail 承载全局导航；对象上下文挂载原生可缩放 Sidebar。侧栏开关只控制第二列；收起时标题栏仍沿原生浮动布局，内容区只为伸出 Rail 的标题栏部分预留空间。当前项目标题和原生 SidebarHeader 工具栏同一行固定在顶部。已固定、版本目录和全部项目工作区共用原生虚拟列表的滚动容器；版本目录是一条持续挂载的内容行，尺寸进入虚拟行测量，目录边界中断前一原生组的吸顶上下文。

版本目录与原生分区共用虚拟列表的行间距。紧跟内容行末尾的项目区标题或同层项目标题时，原生列表直接使用行间距。版本与项目箭头共用 Orca 的图形和槽位。前三条以外的收起状态独立于各版本子目录展开态，仅影响渲染；工作树去重仍从完整目录推导。从其他入口激活余量版本后，版本目录先展开再用同一滚动容器定位。

原生 buildRows 继续构建固定栏与自然分组；buildWorkbenchSectionRows 只移动完整段：固定栏跟随当前项目（保留该项目各可见主机的固定树），当前项目完整顶层分组优先，自然分组继续交给宿主包装。快捷键的侧栏顺序回放复用同一投影。useVisibleSidebarWorktrees 提供同一份过滤输入，原生列表和版本目录候选均调用 computeVisibleWorktrees，不另写 BW 筛选规则。版本候选包含检测到但未进入会话投影的树；完整候选先过滤再按宿主限定身份投影到各目录，保留原生跨目录父子关系例外，不改变原绑定集合或流程存在性判断。实体行沿用原生排序，固定后的单位置或重复显示沿用 profile 的 showPinnedWorktreesInGroups 设置，默认只显示一处。

从全局模块返回「版本工作区」仅切回原生 terminal 内容，不调用 artifacts 准备链；已在版本对象上下文时保留当前页面，并恢复工作区目录视图。版本展开集合以 repoId 分隔，默认展开不持久化为用户选择，新建成功回调展开新版本；项目墙触发的一次性定位由共享请求消费，重挂载不重放。原生列表的 Enter 处理只接管容器自身焦点，保留目录按钮的默认激活。工具栏、菜单和固定策略均沿原生实现，不提供 BW 专用默认或重复列表。Rail 任务入口挂载 SidebarTaskNavButton 的图标变体，预选和预取仍由原组件承担，离开项目页面由 BW 导航回调处理。

全局页面通过 Sidebar 的 panelVisible 仅移除目录面板，原生对话框、工作区看板和 Agent Dashboard 抽屉继续由同一个 Sidebar 承载，确保任务创建与自动化的 hook 信任确认仍能完成。工作区多候选选择器与版本绑定对话框挂载在 AppWorkspaceShell；普通任务等全页入口仍能复用这些对话框。

## 现行局部适配要求

这些要求修正既有能力，不新增特性。行为边界见 [spec](spec.md)，验证状态见 [STATUS](STATUS.md)。

- 项目墙进入保留项目总览，BW 侧栏定位最新在制版；复用原生激活时关闭原生区域 reveal，不改全局筛选。
- 原生项目列表只调整展示投影：当前合并项目所有宿主成员置首，按宿主限定身份排除已挂到有效版本入口的树，避免侧栏重复；未归版或缺版本目录的树仍从原生区可达；缺目标但版本有效的树由版本未分组区承接，解绑后回到此处。仅作展示投影，隐藏父级下的可见子树不改真实 parentWorkspace。其他项目保留原生折叠记忆；沿用原生行、全局工具栏和项目菜单，不造新项目分组。
- 版本树复用原生 WorktreeCard 与原生 row builder，主机标识、菜单、会话及子树不再由 BW 简化行重画。Issue 树名称统一自动名称判据与显示路径，复用已存 linkedWorkItem.title；显式手工命名优先，分支与目录不变。
- 版本任务入口使用完整原生查询，预选可取消的版本标签。目标入口按该目标的完整 Issue 引用打开，首次不继承其他视图的筛选；进入后沿用原生筛选、分页、详情与开工。目标 PR 不作推导。CodeHub 标签查询必须先核实实际 CLI 契约，不能猜参数或把有上限的结果过滤冒充完整范围。
- 目标开工删掉 buildGoalStartNote 及仅用于它的计划预读，保留原生备注、Issue 链接、宿主与绑定/父级规则。公共计划读取与 #449 缓存保留。

以下机制是当前实现设计。任务页范围、原生控件和创建器备注遵循 spec 的现行边界。

| 初始复用调查来源                                                                                                                                                                                                                                                                           | 可复用部分与必要适配                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [WorktreeLineage](../../../src/shared/worktree/lineage-types.ts)、[runtime controller](../../../src/main/runtime/runtime-worktree-lineage-controller.ts)、[parent picker](../../../src/renderer/src/components/sidebar/WorktreeParentPickerPopover.tsx)                                    | 单父级、避免自环/循环、按仓库/项目/宿主边界校验；复用父级选择与原生树形。父子关系不是目录嵌套或 Git 合并关系。                                                                                                                |
| [原生行构建](../../../src/renderer/src/components/sidebar/worktree-list/grouping/row-builders.ts)、[WorktreeCardAgents](../../../src/renderer/src/components/sidebar/WorktreeCardAgents.tsx)                                                                                               | 候选复用工作树卡片与会话激活；后者可接预过滤 agents，但当前活动/保留行不等于全部持久历史。不能只筛当前标签就宣称完整回看；工作树卡片、父子缩进及 agent 行本身也应复用，不另画一套生产组件。                                   |
| [创建参数](../../../src/shared/worktree/create-types.ts)、[创建执行](../../../src/renderer/src/hooks/composer-state/full-creation-execution.ts)、[父级处理](../../../src/renderer/src/store/slices/worktrees/create/worktree-create-parent-pick.ts)                                        | 同一原生创建路径已有 baseBranch、parentWorkspace、linkedWorkItem、sparseCheckout。基线与父级分开确定；父关系不携带父树的未提交修改，也不决定合入路线。                                                                        |
| [稀疏创建](../../../src/main/git/worktree-sparse-add.ts)、[高级创建选项](../../../src/renderer/src/components/new-workspace/NewWorkspaceComposerAdvancedSection.tsx)                                                                                                                       | 已有 no-checkout + cone sparse-checkout 及目录预设。计划/验收可考虑只检出必要资产，但需验证配置、Skill、材料、采集脚本及其依赖可读，不能默认所有仓库适用。                                                                    |
| [AiVaultPanel](../../../src/renderer/src/components/right-sidebar/AiVaultPanel.tsx)、[会话记录](../../../src/shared/agent-session-record.ts)、[BW 会话身份](../../../src/renderer/src/workbench/version-cycle/native-session.ts)                                                           | 复用原生历史与继续行为。持久会话位置、宿主、原生会话标识保持原协议；终端 pane 与 provider 历史标识不能假定同一。按版本跨工作树聚合仍需适配与重启验证。                                                                        |
| [versionSelection](../../../src/main/workbench/version-selection.ts)、[CycleWorkspaceProvider](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceProvider.tsx)、[手动会话启动](../../../src/renderer/src/workbench/version-cycle/start-cycle-session.ts)                     | 手动入口在当前流程树打开可编辑草稿；选版保存在工作树 metadata，定时自动化仍要求 existing workspace 匹配。只改侧栏筛选不足以实现两个版本独立运行；必须把运行归属与正在浏览的版本拆开。                                         |
| [单树删除链](../../../src/renderer/src/components/sidebar/run-worktree-delete-with-toast.ts)、[删除预检与执行](../../../src/main/ipc/worktrees/removal/execute-worktree-removal.ts)、[工作区清理对话框](../../../src/renderer/src/components/workspace-cleanup/WorkspaceCleanupDialog.tsx) | 版本级清理复用与右击单树删除、状态栏清理对话框同一条删除链：预检（未提交修改/子树/归档 hook）、权限复核与失败提示全沿原生；BW 只加版本粒度的确认单聚合与 owner 标注。绑定挂在登记上、随删树消失，不另造删除路径或归档隐藏层。 |

复用必须覆盖 UI 和调用链：

- 计划/验收继续沿 [CycleWorkspaceShell](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceShell.tsx) 挂载现有板，左侧为 [AppWorkspaceShell](../../../src/renderer/src/app-shell/AppWorkspaceShell.tsx) 的完整 Terminal；本特性不改计划/验收业务板及其内部布局。G2 高保真将这套组合标为一个既有整屏，避免分别画两个占位区而误示新增屏幕。
- [TaskPage](../../../src/renderer/src/components/task-page/TaskPage.tsx) 没有通用的版本筛选 props，模型包含来源、全局缓存与分页。必须从版本成员查询结果和计划目标构建完整范围，通过原生数据路径读回并驱动同一列表；不能只过滤全局列表当前页，否则遗漏任务、计数不实。
- [原生 Issue 行](../../../src/renderer/src/components/task-page/github/Rows.tsx) 已有未关联时 Start、已关联时 Open；[执行动作](../../../src/renderer/src/components/use-task-page-workspace-actions.ts) 走原生创建器与激活路径。其 [关联查找](../../../src/renderer/src/lib/github-work-item-workspace-attachment.ts) 目前按 repoId、Issue 类型和编号取首个未归档树，不含版本/目标。薄适配须显式解析业务绑定，避免同 Issue 跨版时打开错误工作区。已有原生创建器可由目标入口预填上下文，但当前输入没有初始父级，完成回调也不返回工作区身份，需在创建链路取得真实结果后绑定。当前路径见 [nativeTaskPort](../../../src/renderer/src/workbench/native-task-port.ts)，不另建 Issue 数据正本。
- 计划里的 Issue 继续进共用原生详情；本原型移除独立开工/继续，与 #385 的计划直接开工诉求留作 G3 对齐。如保留快捷入口，只调用同一个原生动作。
- [OverviewPage](../../../src/renderer/src/workbench/OverviewPage.tsx) 保持现状。项目总览仅标明沿用入口，不嵌入或复刻已有原型；版本总览由独立特性维护，本特性只导航到既有界面。

布局将版本与目标作为逻辑目录；新建版本准备计划和验收两棵独立固定树，保留流程入口，实际树使用同一套 Orca 原生卡片独立呈现。目标工作树按需创建，Issue 使用同一原生创建器；合适父级是可修改建议，不强制嵌套。创建交给原生执行核，BW 负责导航和明确的业务归属；不重建终端、会话租约、历史存储或另一套任务完成状态。实际薄挂载能否满足全部接缝还需验证；如必须改变 Orca 核心、协议或宿主路由，先提交具体取舍给人决定。

## 共享边界与不可越过的约束

- 分支/材料：计划、验收、目标与 Issue 的起点、同步与合入规则；计划和验收材料的读写位置及 CAS 修订；分支命名不是稳定身份，不能靠字符串解析建立版本归属。两棵流程树的分支和材料初始化遵循版本准备机制；目标与 Issue 树遵循任务范围和创建器约束。
- 自动化：定时运行如何选择已明确版本、首次登记如何避免跨版本重用、如何保留人的模型/时间/复用设置。不能拿 UI 上次查看版本当执行参数。
- 会话回看：各版本并列，不做专门历史会话入口或归档分区；已归档版本留在原位置带标识回看。旧共享树不整体改父级；保留原生入口，人核对后再建立业务关联。历史读回须覆盖已退出会话、不同工具/provider 与重启。
- 删除与跨版引用：版本级清理＝人确认的批量删除（默认本机 owned，他宿主实例列而不勾、显式勾选才经共享通道删），复用原生预检与权限链；绑定挂在登记上、随删树消失，任何删除路径不得残留悬空引用。不把删除工作树等同删除版本（材料与目录保留），不以 Git 材料可读承诺会话可恢复。一个 Issue 可被多版引用，一个原生子树只有一个父级；引用不复制完成记录，跨版工作区绑定由绑定契约明确。
- 发布总结：版本总览按计划与验收派生，不新增手填报告正本；沿现有材料的固定提交/修订与发布证据回看，不新增冻结操作或报告副本，不能用当前 Issue 状态冒充当时验收。

### 绑定契约与版本目录

- **绑定契约**：`src/shared/workbench/version-binding.ts`（schema 1，workflow 与 goalId/taskSource 一致性 refine）；读回规范化把脏数据一律收敛为未绑定，不猜归属。绑定是版本归属唯一正本——不从分支字符串、会话标题或日期反推。
- **原生挂载**：`WorktreeMeta.workbenchVersionBinding`（undefined 保留 / null 清除）、`worktree.set` 白名单、`mergeWorktree` 投影规范化、runtime capability `workbench.version-binding.v1`（无能力对端不下发、双方向门控）。BW 薄 helper `workbench.versionBinding.read/set`：原生身份定位、owner 验证、identity 选择器写入、读回确认才返回，不接受客户端路径。
- **版本目录**：`src/shared/workbench/version-catalog.ts` + 装载器——已提交材料 ∪ 存活绑定，去重保留材料来源，已清理版本条目保留（retired 收起回看）；绑定从登记现算，删树无悬空；草稿与目标从已保存计划派生，缓存按 owner/项目/仓库/版本/修订分隔。
- **版本排序**：目录把合入状态、工作区活跃状态和展示时间分开计算。主干当前材料证明已合入；同仓各主机的未归档计划绑定证明进入在研，主干没有该版计划材料时归入未合入组。未合入组取所有可见主机计划树中最早的 `createdAt`，已合入组沿材料基线读取实际新增 `data.json` 的提交时间；读取进入时间时排除 merge 提交，避免侧分支新增被归到合并时刻。已合入版本有计划工作树时仍留在已合入组，只沿 `draft` 事实显示草稿标记。跨主机读取沿每棵树 owner 路由，某台主机暂不可用保留 Unknown 证据，不把缺读转换为空目录或另一种合入状态。项目墙和侧栏共用同一比较器；未合入版本已经可确定时，墙卡不等待已合入版本的 Git 时间读取。

项目墙与侧栏用同一项目版本目录，按 Git 身份收集可访问的精确登记，逐登记复用 `useVersionCatalogForRepo` 独立读取。先合并版本存在证据与工作区，再对各版按本机优先和已确认的对端来源选材料。选树身份包含仓库、执行宿主、传输 owner、工作树及实例。

读取顺序为原生 `fetchWorktrees` 的宿主限定权威发现 → 可见与检测到的工作树合并 → `nativeWorkspaceScope` 解析归属 → `loadVersionCatalog` 读取主干材料与计划树。原生发现承担配对、去重与登记合并；BW 不另建跨机同步和持久化目录。工作树身份、绑定、分支和 HEAD 构成材料失效依据，刷新与连接恢复触发重新发现。来源或发现失败不转换为空目录；共用目录按来源保留进程内上一读数，跨页后失败仍按材料来源与版本精确保留，成功空读会清除旧数据。快照不保存加载状态，也不阻止重新读取。

墙卡从共用目录按显示排序取首版，额外读取进度与任务事实；不再独立装载版本目录或跨主机拼接材料。同来源的展示快照沿现有 `snapshot-cache` 保留，返回墙时先回显再读取，不作为跳过目录发现的依据。已处理的强制刷新编号随来源快照保留，普通回墙不重复绕过 provider 缓存。配对主机转接 SSH 时，沿原生宿主解析从 `pairedRegistration.hostId` 取得目标；缺少该登记时兼容 `connectionId`，显式本地登记不当作 SSH。监听所属主机和对应 SSH 目标的状态及连接代际，任一恢复均触发重读。版本入口沿卡片所读版本与主机，项目名称及项目总览仍沿项目默认来源。材料接口按实际工作树 owner 路由，只接收绑定版本树。

### 新建版本与两棵流程树

- **分支与命名**：流程树分支 `bw/<version>/plan`、`bw/<version>/acceptance`（沿 bw/ 命名空间）；树名 `plan-<version>` / `acceptance-<version>`。版本名过 MaterialVersion 目录规则后还须能组成合法分支名（Git ref 规则），不合法拒绝创建并如实报因。分支名只是 Git 起点与入口提示；版本归属始终由登记上的绑定决定，不从分支字符串反推。
- **编排在归属 runtime**：`workbench.versionWorkspace.prepare` 保留版本绑定和材料编排；同版同用途已有绑定活树优先复用，即使其分支已改名。无绑定树时调用与 project、指标、版本流程共用的 `workbench.fixedWorkspace.ensure`。该服务以独立 Git 扫描和原生登记确认占用，本地分支优先；本地缺失时查真实远端 head，唯一来源定向 fetch，缺少跟踪映射时仅补该分支的原生同名前缀窄 fetch 映射并保留既有条目，再无覆盖恢复同名本地分支；显式排除/异目标映射拒绝覆盖。远端均不存在才从原生项目基线新建。远端失败或多来源明确报错，不依赖 PR/MR 或缓存 ref 断言不存在。创建和登记仍走原生能力；已有未绑定/异版树不自动认领，归档树不自动恢复。材料初始化仍为 create-only。
- **去重**：固定工作区服务按宿主、仓库、分支合并在途请求，并按仓库串行准备，避免原生外部树登记列表相互覆盖；版本准备另将绑定和材料初始化包含在同一次在途操作中。完成或失败即清除在途项，重试重新核对实际 Git 与登记，不把带期限的创建结果缓存当成幂等依据。跨进程以 Git 无覆盖创建和创建后独立读回识别赢者。
- **步骤链非原子**：计划树 → 计划绑定 → 空计划 → 验收树 → 验收绑定；每步即时落盘（原生登记/绑定登记/材料文件）。某步失败保留已成功结果、逐步返回状态与问题，不回滚、不删树；用户离开或超时不销毁宿主进程内的执行；重试=重入同一 prepare，按宿主真实登记补齐缺失步骤。补齐边界如实：「创建成功但绑定未写入」的窗口（实例身份缺失或写绑定失败）不在自动补齐范围——重入时该树按占用且归属不可证如实拒绝（不劫持、不按分支字符串认领），恢复需人工补绑定或清理该树。
- **创建结果核对**：原生返回分支非约定分支（占用触发 uniquify）→ 不绑定、不初始化、不标成功；误建树沿原生删除链默认口径 best-effort 清理（不附 force/豁免、不放宽删除安全规则），清理失败如实提示人工处理；并行对手已建对分支 → 按绑定重新发现并采用（winner adoption，较 ensureNamedWorktree 的分支名口径更严格：归属只认绑定）。
- **绑定写入强制实例围栏**：创建链写绑定必须携带创建结果的 instanceId（此处是天然必填点；身份缺失报错不写）。
- **空计划初始化**：PlanningMaterial schema 3（randomUUID 新 cycleId、空 summary/goals/tasks；可用前版来源由既有目录排序先定位紧邻版本再读取其验收，缺少不回退，已有材料固定来源不替换），走同一材料事务核心（version-document-store：create-only、跨进程互斥、原子替换、写前重新授权）；写前核对树 HEAD 为约定分支且 common-dir 归属本仓库。由工作树所属的本机或 Orca 配对宿主直接写。通过直连 SSH 登记的项目需要连接其 Orca 共享地址后使用版本材料。验收树不初始化材料（依据明确再写）。已存在的材料（含 migration-required）一律不覆盖、如实回报。
- **禁止面**：不启动 agent、不激活视图（activate:false，导航由版本入口决定）、不启用自动化、不预建目标/Issue 树、不 commit/push 材料。
- **J2 判据（创建失败恢复）**：中断第二棵流程树准备再重试 → 第一棵树、绑定与空计划全保留，最终恰两棵、无重复绑定、材料修订不变；双击/两窗口并发 → 宿主端去重使每用途恰一次创建；材料已存在 → 初始化跳过。真壳 J2 归人验证，协议单测先看护编排语义。

### 任务范围、开工链与版本化导航

- **任务屏范围契约**：版本入口保留本次版本上下文，预选可取消的版本标签，沿原生查询与分页；只有目标条件使用完整材料引用点读后筛选分页。Issue/PR、预设、仓库、搜索与原生过滤均保留；现有材料只有 Issue，保留目标时 PR 为空，取消目标后沿原生 PR 查询。去版本同时清目标，移除后的条件不再参与 Start/Open 绑定。入口条件不写全局 resume 查询，不改任务正本。
- **统一 Start/Open 解析**：归属只认绑定+原生 linked 字段（shared/version-workspace-match.ts 纯函数核，协议单测看护）：Issue 树=绑定 (version, issue, taskSource) ∧ linked (type=issue, number, provider)；唯一→直开、多候选→BW 选择器（模块 store+Radix Dialog，挂载于应用壳，任务屏、详情弹窗与侧栏入口共用，不依赖侧栏是否显示）、无→原生创建器；PR 行与无范围路径保持原生「首个未归档树」语义。三处分发壳（板面开工箭头 issue-start-action、任务屏行、详情弹窗）共用 `dispatchScopedWorktrees`（唯一直开/多候选选择器/无返 'none' 回落；埋点与回落文案留调用方）。目标树/流程树同一绑定口径；父级建议仅唯一同项目同宿主目标树时给出（不建议不预建，原生选择器与创建期校验仍是权威）。
- **开工与创建结果绑定**：目标/Issue 开工复用同一原生创建器，BW 只带入 initialParentWorktreeId 建议与 workbenchCreation 归属；原生备注由用户填写，不自动生成目标长备注或仅为备注预读计划；绑定在提交时按创建器**最终**仓库+最终任务来源解析（改仓库即失效），写入发生在**真实创建结果处**（result.worktree，早于取消/激活分支——树既建成归属即应记录），instanceId 必填围栏、读回确认、失败保留树+「重试写绑定」不重复建树；取消（未创建）零绑定。quick/background 链经 `WorktreeCreationRequest.workbenchVersionBinding`（纯可序列化，Retry 原样重放）；full 链镜像。
- **材料所属宿主的授权**：无对应流程绑定或跨版操作均拒绝，初始化同样核对绑定和分支。context 返回绑定版，select 仅接受同版。common-dir、写前再授权与 CAS 事务保留；主干历史独立读取。
- **侧栏与进屏**：目录合并材料与绑定；流程多实例交原生卡片与现有选择器，无树进入只读回看。初始化依选定登记中准备状态判断，不用其他宿主替代。未选中多个草稿中的任一个时不派生任意草稿目标。

### 流程入口、绑定、清理与自动化

- **屏内版本**：流程板回显绑定版本，通过版本侧栏切换。无绑定原生工作区不挂流程板。
- **Issue 开工箭头**：板面 Issue 行箭头接 `issue-start-action.ts`——与任务屏范围行同一解析核（绑定+linked 双重证明；唯一直开/多候选选择器/无则原生创建器预填＋创建结果绑定）。版本未知或 provider 不在开工面（读回仅 github/codehub 就绪）回落原生详情；标题链接进原生详情语义不变，不另造继续逻辑。
- **单树绑定/改绑/解绑**：`WorkbenchVersionBindingMenuItems` 薄挂载到全树原生 `WorktreeContextMenu`，普通项目树、版本流程树、目标/Issue 树与多实例中的具体树入口一致；不保留版本级“绑定已有工作树”按钮或批量绑定。选择器沿 `version-tree-bind-dialog` 与 `version-tree-bind-mode`：流程树（分支为 `bw/<版本>/plan` 或 `bw/<版本>/acceptance`）只提交版本，用途由分支带入，并仍须通过该分支围栏。已关联 GitHub 或 CodeHub Issue 的工作区只提交版本和目标；Issue 身份取工作区上的既有关联（含只有编号的旧 GitHub 关联），保存前按链接里的仓库和编号读回，读回身份对不上就不写，再与任务来源、原生 linkedWorkItem 通过同一次 identity metadata 更新保存并共同读回核验。尚未关联 Issue 的树仍由人选择用途，Issue 用途从真实计划目标的引用中选择后再读回。Issue 绑定在写入前追加 `bw:plan:<版本>`（不删除已有版本标签）并改写标题开头的版本目标段；这一步失败则不写绑定。GitHub 用增量加标签，并写到刚才读回链接里的仓库；CodeHub 用服务端追加写入这一枚计划标签，不回写整组。保留 instanceId 和宿主围栏。旧宿主不支持新增请求字段时整笔拒绝，不先改原生关联。解绑只清该树版本绑定，稳定身份、父子关系、linked task、文件与原生会话均保留，不级联改绑或解绑子树。
- **版本级清理**：确认单=版本语义清单层（本版全部存活绑定实例；本机 owned 默认勾选、他宿主列而不勾＋owner/预检/在跑会话标注；断链宿主不可勾选，执行也复核；显式勾选可达宿主才经共享通道在归属宿主删除）；预检状态与原生确认单同一 hydration 来源；执行交原生 `runWorktreeBatchDelete` 漏斗（Orca 确认单/预检/force/宿主路由全原生，批量必确认）。删除只改执行面，目录现算无悬空绑定；不改写自动化条目——本版已启用的版本化自动化按本机登记探测（creationKey 全键精确匹配）在确认单如实提示，他宿主 runtime 条目不跨机探测（留白）。版本清理对话框沿同一删除链。
- **只读回看**：无绑定树的版本，计划/验收屏挂 `VersionReadonlyMaterialView`——history RPC 按目录固定 sourceCommit/revision 读主干已提交材料，human-guard 字段只呈现状态不提供入口；工作树/会话不可用由登记缺失推导；缺材料/读取失败如实报，浏览不建树。
- **自动化身份**：`creationKey=bw-cycle:<scope>:<workflow>:<version>` 独立登记；提示指向真实分支与绑定版本。旧任务仍保留自身已保存的设置，发布前由负责人核对和切换。
- **版本总览接入**：侧栏每版「总览」行调用 `openVersionOverview`，在 activity 槽通过 `project-page-state` 挂载既有版本总览页面，从设置返回时保留原版本；内容、交互与样式归 [version-overview](../version-overview/spec.md)，本特性不复制其设计或原型。

### 已采纳的接线约束

以下条目是当前接线约束。UI 判据见 spec，本节只记录设计取舍：

- **初始化入口**：流程行菜单的「准备流程工作区」删除——入口挪版本行图标按钮（FolderPlus，非三个点），流程树不齐（plan/acceptance 任一缺）才显示、两树齐即消失；点击**直接执行** prepare 无确认单（人裁定：创建类不设确认单，busy 态＋toast 如实回报），执行链住 `version-nav-actions.initializeVersionWorkspace`，准备结果的 `prepareFailed` 判定在 `shared/workbench/version-workspace-prepare.ts`，由新建对话框、直接初始化与主进程协议测试共用；展示摘要由 renderer 的 `version-workspace-prepare-report.ts` 生成；归档版本不加拦截提醒（归档版继续干活是合理旅程）。NewVersionDialog 只剩 create 模式（prepare 模式失去调用方同交付删除）。只读回看指路文案对齐。
- **准备工作区的 setup 策略**：创建参数 `setupDecision:'inherit'→'skip'`（原生既有开关，automations headless 同口径）——不开 Setup 终端、不装依赖、建树跳过 setup 脚本；流程树上会话 agent 需要依赖时自己装（材料读写与 CLI 注入不需要）。legacy 固定树 ensure（native-workspace.ts）显式不动。
- **树行与原生会话**：版本树由登记和绑定现算可见，不以有无已恢复会话为条件；会话行和历史继续复用 Orca 机制。各具体树整行右击复用同一原生菜单；流程多实例直接展示具体实例，不用三点菜单代替树本身。业务目录动作与单树维护分开，单树改绑不改父子或其他树归属。宿主断链只显示原生连接图标，不追加 BW 离线标签或 toast，点击保留当前内容；绑定/清理执行仍校验宿主可达性。侧栏复用原生滚动，不给数据目录引入第二套滚动。
- **计划/验收初态**：prepare 的空计划不表示流程已开始。两屏未开始显示短卡，只有原生运行会话实际打开后才展开四区；无目标保持空列表。启动视图按流程/版本/scope/owner/工作树在渲染进程内保留，切屏不重现开始卡；已有有效材料独立恢复，不从普通 shell 推断。显式“初始化工作区”继续沿 prepare 补齐，不因浏览或断链激活自动建树。
- **版本查询与目标身份**：CodeHub 版本标签经已有 listTasks → service → IPC/RPC → CLI 下推 AND 查询；沿原生每仓 250 条，CLI 自动翻页并以 limit+1 推导 hasMore，界面明确还有更多，目标引用点读仍完整。目标 @me 按每条任务实际 repo 的来源、runtime/WSL 与托管站点调用只读 viewer，GitHub 不借用全局本机账号；只在需要身份时查询、刷新重新读，失败显示未知，不持久化账号或凭据。
- **三屏 Issue 读取**：任务页只有目标条件使用完整引用投影，版本入口走原生标签查询；task-reference-reader 与 native-task-port 统一计划、验收、任务屏及上版实时 Issue 的同源缓存与在途合并。GitHub 坐标归一后按现有支持域每 20 号调用 gh:workItemsBatch，成功片保留，失败/缺项补单读；environment runtime 不跨机代读；fork、非 origin 登记远端、显式 upstream 偏好与带端口 GHES 保留原生点读的选源语义。CodeHub 保留 issue/MR 读回和全局 6 并发上限。缓存只回显旧读数，后台读回整批发布；手动刷新等旧请求结束后再查源头。创建版本仍准备两树，但只等待目标主机登记读回，其他主机刷新不阻塞打开。
- **Issue 工作树名称**：原生意图种子保留编号；自动预填在快捷/完整创建和分支重名去重后仍保持自动管理，显式人工名优先。两处侧栏均复用原生卡片标题规则及已保存的 linkedWorkItem.title，稳定展示 `#编号 完整标题`；分支保留在悬停与详情。已有 fixed 名称即使恰等于标题或分支也不替换，改绑不修改 pinned；旧宿主缺命名模式时仅保留原生空名/分支名回退，不按文本猜测非空名称的来源。
- **开工预热**：开工入口 openModal 前 fire-and-forget `prefetchWorktreeCreateBase`（命令面板同款）＋`repos.getGitUsername` 既有 IPC（触发 gh 用户名探测的进程级缓存，创建时分支前缀解析直接命中）；零新增原生 API、不改创建参数；超时重试窗口语义是原生的，不动。
- 其他接线约束：清理确认单文案保持简洁；补绑定按工作树收起已确定项——流程树只选版本，已关联 Issue 的工作区只选版本和所属目标，其余树仍选择用途，尚未关联时 Issue 仍从计划引用选择；全局任务入口保持显示，两个入口使用不同 tooltip。
