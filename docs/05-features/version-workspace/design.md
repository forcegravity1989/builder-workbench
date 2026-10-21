# 版本工作区实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管本次设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：设计于 2026-10-20 评审定稿；接线要求的生产验证缺口见 STATUS。架构定位：§2 ①事实、执行、③规范、⑤壳，§3 Orca 执行核与 BW 叠层。


此节服务 [G2 高保真修订 8](version-workspace-prototype.html?rev=8) 的落地，设计于 2026-10-20 评审定稿；上文描述当前接线。源码核对基线为 main 的 2be8d77649797cb0ac740edaa7defa49deb3ffd5，其后 PR #386 合入 main f5ac309b226a456b157b57ceee65204f101a4a09，计划快照来源仍可追溯至其 head 331c04f。行为判据见 [spec](spec.md#g2-版本运作设计定稿)。

| 当前源码证据 | 可复用部分与必要适配 |
|---|---|
| [WorktreeLineage](../../../src/shared/worktree/lineage-types.ts)、[runtime controller](../../../src/main/runtime/runtime-worktree-lineage-controller.ts)、[parent picker](../../../src/renderer/src/components/sidebar/WorktreeParentPickerPopover.tsx) | 单父级、避免自环/循环、按仓库/项目/宿主边界校验；复用父级选择与原生树形。父子关系不是目录嵌套或 Git 合并关系。 |
| [原生行构建](../../../src/renderer/src/components/sidebar/worktree-list/grouping/row-builders.ts)、[WorktreeCardAgents](../../../src/renderer/src/components/sidebar/WorktreeCardAgents.tsx) | 候选复用工作树卡片与会话激活；后者可接预过滤 agents，但当前活动/保留行不等于全部持久历史。不能只筛当前标签就宣称完整回看；工作树卡片、父子缩进及 agent 行本身也应复用，不另画一套生产组件。 |
| [创建参数](../../../src/shared/worktree/create-types.ts)、[创建执行](../../../src/renderer/src/hooks/composer-state/full-creation-execution.ts)、[父级处理](../../../src/renderer/src/store/slices/worktrees/create/worktree-create-parent-pick.ts) | 同一原生创建路径已有 baseBranch、parentWorkspace、linkedWorkItem、sparseCheckout。基线与父级分开确定；父关系不携带父树的未提交修改，也不决定合入路线。 |
| [稀疏创建](../../../src/main/git/worktree-sparse-add.ts)、[高级创建选项](../../../src/renderer/src/components/new-workspace/NewWorkspaceComposerAdvancedSection.tsx) | 已有 no-checkout + cone sparse-checkout 及目录预设。计划/验收可考虑只检出必要资产，但需验证配置、Skill、材料、采集脚本及其依赖可读，不能默认所有仓库适用。 |
| [AiVaultPanel](../../../src/renderer/src/components/right-sidebar/AiVaultPanel.tsx)、[会话记录](../../../src/shared/agent-session-record.ts)、[BW 会话身份](../../../src/renderer/src/workbench/version-cycle/native-session.ts) | 复用原生历史与继续行为。持久会话位置、宿主、原生会话标识保持原协议；终端 pane 与 provider 历史标识不能假定同一。按版本跨工作树聚合仍需适配与重启验证。 |
| [versionSelection](../../../src/main/workbench/version-selection.ts)、[CycleWorkspaceProvider](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceProvider.tsx)、[自动化启动](../../../src/renderer/src/workbench/version-cycle/start-cycle-automation.ts) | 当前按固定分支定位，选版保存在工作树 metadata，自动化要求 existing workspace 匹配。只改侧栏筛选不足以实现两个版本独立运行；必须把运行归属与正在浏览的版本拆开。 |
| [单树删除链](../../../src/renderer/src/components/sidebar/run-worktree-delete-with-toast.ts)、[删除预检与执行](../../../src/main/ipc/worktrees/removal/execute-worktree-removal.ts)、[工作区清理对话框](../../../src/renderer/src/components/workspace-cleanup/WorkspaceCleanupDialog.tsx) | 版本级清理复用与右击单树删除、状态栏清理对话框同一条删除链：预检（未提交修改/子树/归档 hook）、权限复核与失败提示全沿原生；BW 只加版本粒度的确认单聚合与 owner 标注。绑定挂在登记上、随删树消失，不另造删除路径或归档隐藏层。 |

复用必须覆盖 UI 和调用链：

- 计划/验收继续沿 [CycleWorkspaceShell](../../../src/renderer/src/workbench/version-cycle/CycleWorkspaceShell.tsx) 挂载现有板，左侧为 [AppWorkspaceShell](../../../src/renderer/src/app-shell/AppWorkspaceShell.tsx) 的完整 Terminal；本轮不改计划/验收业务板及其内部布局。G2 高保真将这套组合标为一个既有整屏，避免分别画两个占位区而误示新增屏幕。
- [TaskPage](../../../src/renderer/src/components/task-page/TaskPage.tsx) 没有通用的版本筛选 props，模型包含来源、全局缓存与分页。必须从计划的完整任务引用构建范围，通过原生数据路径读回并驱动同一列表；不能只过滤全局列表当前页，否则遗漏任务、计数不实。
- [原生 Issue 行](../../../src/renderer/src/components/task-page/github/Rows.tsx) 已有未关联时 Start、已关联时 Open；[执行动作](../../../src/renderer/src/components/use-task-page-workspace-actions.ts) 走原生创建器与激活路径。其 [关联查找](../../../src/renderer/src/lib/github-work-item-workspace-attachment.ts) 目前按 repoId、Issue 类型和编号取首个未归档树，不含版本/目标。薄适配须显式解析业务绑定，避免同 Issue 跨版时打开错误工作区。已有原生创建器可由目标入口预填上下文，但当前输入没有初始父级，完成回调也不返回工作区身份，需在创建链路取得真实结果后绑定。当前路径见 [nativeTaskPort](../../../src/renderer/src/workbench/native-task-port.ts)，不另建 Issue 数据正本。
- 计划里的 Issue 继续进共用原生详情；本原型移除独立开工/继续，与 #385 的计划直接开工诉求留作 G3 对齐。如保留快捷入口，只调用同一个原生动作。
- [OverviewPage](../../../src/renderer/src/workbench/OverviewPage.tsx) 保持现状。项目总览仅标明沿用入口，不嵌入或复刻已有原型；新增版本总览服务本版承诺、事实与验收总结，不代替项目总览。

布局将版本与目标作为逻辑目录；新建版本准备计划和验收两棵独立固定树，入口与流程树合并为一行。目标工作树按需创建，Issue 使用同一原生创建器；合适父级是可修改建议，不强制嵌套。创建交给原生执行核，BW 负责导航和明确的业务归属；不重建终端、会话租约、历史存储或另一套任务完成状态。实际薄挂载能否满足全部接缝还需验证；如必须改变 Orca 核心、协议或宿主路由，先提交具体取舍给人决定。

空间成本不能只看 Git 对象共享。此基线 git ls-tree -r -l HEAD 的 24,608 个文件 blob 合计 192,575,617 字节（183.7 MiB）；这是受控内容体积，不是实际磁盘占用，不含依赖、构建产物、LFS 内容或文件系统开销。4 个目标、10 个 Issue 加计划/验收，若全部预建是 16 棵；版本根与计划另分则是 17 棵。原型按需创建，未开展的目标不建树。Git 对象共享和工作区独立的机制见 [Git worktree](https://git-scm.com/docs/git-worktree)，稀疏范围与限制见 [Git sparse-checkout](https://git-scm.com/docs/git-sparse-checkout)。未测真实大仓耗时、磁盘占用或跨宿主稀疏运行。

落地前必须明确的边界：

- 分支/材料：计划、验收、目标与 Issue 的起点、同步与合入规则；计划和验收材料的读写位置及 CAS 修订；分支命名不是稳定身份，不能靠字符串解析建立版本归属。两棵流程树的分支/材料初始化决定已在下节「P2 落地」定稿；目标与 Issue 树随 P4 定。
- 自动化：定时运行如何选择已明确版本、首次登记如何避免跨版本重用、如何保留人的模型/时间/复用设置。不能拿 UI 上次查看版本当执行参数。
- 会话回看：各版本并列，不做专门历史会话入口或归档分区；已归档版本留在原位置带标识回看。旧共享树不整体改父级；保留原生入口，人核对后再建立业务关联。历史读回须覆盖已退出会话、不同工具/provider 与重启。
- 删除与跨版引用：版本级清理＝人确认的批量删除（默认本机 owned，他宿主实例列而不勾、显式勾选才经共享通道删），复用原生预检与权限链；绑定挂在登记上、随删树消失，任何删除路径不得残留悬空引用。不把删除工作树等同删除版本（材料与目录保留），不以 Git 材料可读承诺会话可恢复。一个 Issue 可被多版引用，一个原生子树只有一个父级；引用不复制完成记录，跨版工作区绑定由绑定契约明确。
- 发布总结：版本总览按计划与验收派生，不新增手填报告正本；沿现有材料的固定提交/修订与发布证据回看，不新增冻结操作或报告副本，不能用当前 Issue 状态冒充当时验收。

### P2 落地：新建版本与两棵流程树（2026-10-21 实施定稿）

- **分支与命名**：流程树分支 `bw/<version>/plan`、`bw/<version>/acceptance`（沿 bw/ 命名空间）；树名 `plan-<version>` / `acceptance-<version>`。版本名过 MaterialVersion 目录规则后还须能组成合法分支名（Git ref 规则），不合法拒绝创建并如实报因。分支名只是 Git 起点与入口提示；版本归属始终由登记上的绑定决定，不从分支字符串反推。
- **编排在归属 runtime**：BW 薄服务 `workbench.versionWorkspace.prepare`（main 侧），宿主端预检——登记清单、Git 扫描（detected）、材料目录——不只信 renderer 当前列表。预检矩阵：同版同用途已有绑定活树 → 复用（不重建）；分支被不能证明归属本版的树占用 → 拒绝并报占用者，不劫持、不自动清理；分支存在但无树占用 → 作为创建起点交原生复用同名分支（归属仍由新写绑定决定，即「核对来源再采用」：不能证明的来源只当 Git 起点、不当本版流程树）；版本已有材料 → 不重复建版、不覆盖（空计划初始化 create-only）。
- **去重**：每棵创建经原生 `dedupeWorktreeCreate`（clientMutationId 由 version+用途确定性派生）：同宿主 in-flight 的双击/多窗口/共享端重试返回同一创建；失败重试重新发起（原生语义）。
- **步骤链非原子**：计划树 → 计划绑定 → 空计划 → 验收树 → 验收绑定；每步即时落盘（原生登记/绑定登记/材料文件）。某步失败保留已成功结果、逐步返回状态与问题，不回滚、不删树；用户离开或超时不销毁宿主进程内的执行；重试=重入同一 prepare，按宿主真实登记补齐缺失步骤。补齐边界如实：「创建成功但绑定未写入」的窗口（实例身份缺失或写绑定失败）不在自动补齐范围——重入时该树按占用且归属不可证如实拒绝（不劫持、不按分支字符串认领），恢复需人工补绑定（P3 提供入口）或清理该树。
- **创建结果核对**：原生返回分支非约定分支（占用触发 uniquify）→ 不绑定、不初始化、不标成功；误建树沿原生删除链默认口径 best-effort 清理（不附 force/豁免、不放宽删除安全规则），清理失败如实提示人工处理；并行对手已建对分支 → 按绑定重新发现并采用（winner adoption，较 ensureNamedWorktree 的分支名口径更严格：归属只认绑定）。
- **绑定写入强制实例围栏**：创建链写绑定必须携带创建结果的 instanceId（此处是天然必填点；身份缺失报错不写）。
- **空计划初始化**：PlanningMaterial schema 3（randomUUID 新 cycleId、空 summary/goals/tasks），走同一材料事务核心（version-document-store：create-only、跨进程互斥、原子替换、写前重新授权）；写前核对树 HEAD 为约定分支且 common-dir 归属本仓库。本地/配对宿主直接写；SSH 宿主经 relay `workbench.materials.execute` 窄执行器新增 initialize 操作。验收树不初始化材料（依据明确再写）。已存在的材料（含 migration-required）一律不覆盖、如实回报。
- **禁止面**：不启动 agent、不激活视图（activate:false，导航由 P3 入口决定）、不启用自动化、不预建目标/Issue 树、不 commit/push 材料。
- **J2 判据（创建失败恢复）**：中断第二棵流程树准备再重试 → 第一棵树、绑定与空计划全保留，最终恰两棵、无重复绑定、材料修订不变；双击/两窗口并发 → 宿主端去重使每用途恰一次创建；材料已存在 → 初始化跳过。真壳 J2 归人验证，协议单测先看护编排语义。

### P4/P3a 落地：任务范围、开工链与版本化导航（2026-10-21 实施定稿）

- **任务屏范围契约**：`TaskPageData.workbenchTaskScope`（shared/workbench/task-scope.ts）=版本+目标+计划材料完整任务引用集；范围不进搜索 query/provider 缓存键/resume 键（防串范围与缓存污染），有范围时跳过无范围取数/持久化/来源自动切换，投影改成员围栏+客户端文本过滤，totalPages=本地物化页数；缺数据引用保留位置/数量/原因；详情往返携带范围。无范围时原生任务页行为逐字不变（上游接缝登记 ref/upstream.md §2.3）。
- **统一 Start/Open 解析**：归属只认绑定+原生 linked 字段（shared/version-workspace-match.ts 纯函数核，协议单测看护）：Issue 树=绑定 (version, issue, taskSource) ∧ linked (type=issue, number, provider)；唯一→直开、多候选→BW 选择器（模块 store+Radix Dialog，列表与详情弹窗共用）、无→原生创建器；PR 行与无范围路径保持原生「首个未归档树」语义。目标树/流程树同一绑定口径；父级建议仅唯一同项目同宿主目标树时给出（不建议不预建，原生选择器与创建期校验仍是权威）。
- **开工与创建结果绑定**：目标/Issue 开工复用同一原生创建器，BW 只加三个可选预填字段（initialNote 可见可改的业务上下文、initialParentWorktreeId 建议、workbenchCreation 上下文）；绑定在提交时按创建器**最终**仓库+最终任务来源解析（改仓库即失效），写入发生在**真实创建结果处**（result.worktree，早于取消/激活分支——树既建成归属即应记录），instanceId 必填围栏、读回确认、失败保留树+「重试写绑定」不重复建树；取消（未创建）零绑定。quick/background 链经 `WorktreeCreationRequest.workbenchVersionBinding`（纯可序列化，Retry 原样重放）；full 链镜像。
- **main 侧版本化**：绑定即版本正本——材料授权（期望分支由绑定派生、跨版读写拒绝 cross-version、用途不混、list 只呈现绑定版）与选版（context 恒回绑定版、select 他版拒绝、不写第二份选版偏好）都在服务层+执行器双围栏；SSH 窄执行器命令带可选 binding（无绑定树不带字段，旧对端不受扰）；无绑定树全部沿旧固定分支语义（旧上下文显式保留）。common-dir/写前再授权/CAS 事务核不变。
- **侧栏与进屏**：版本行=目录现算（材料∪绑定∪已提交目标回看），流程行=业务入口+本树入口合一（原生 agent 行/原生菜单/原生激活链复用）；进屏定位绑定树优先且**不进 ensure 路径**（多实例交选择器、无树如实拒绝，浏览不建树）；旧固定树仅在已存在时作为旧路径；「＋新建版本」与「准备流程工作区」共用 prepare 重入补齐语义。当前浏览版本是 UI 偏好（按项目隔离持久化），不是归属/执行正本。
- **P5 前自动化护栏**：creationKey 尚无版本维度——绑定树跳过旧身份 ensure、start/configure 如实拒绝（防运行落错树、防条目错挂），legacy 树零变化；版本化自动化身份与提示词归 P5，屏内按钮改绑归 P3b。

原型构建：node docs/05-features/version-planning/prototype/build-g2.cjs；加 --check 校验源码与生成物一致。独立 JSX/CSS 与真实计划快照在该特性的 prototype/ 下；复用现有 vendor.js 与设计系统资源，不修改已确认的旧原型。

接线要求：材料读写层 version-material-workspace 和选版层 version-selection 都校验旧固定分支；必须一起适配，不能只改侧栏。原生 worktree.set RPC 当前不含 BW 版本绑定字段，且旧宿主可能丢弃未知字段，新增绑定字段必须经授权的宿主契约与能力检测读回验证；版本级清理复用既有删除 RPC，不新增契约。TaskPage 的范围要覆盖完整引用与分页，自动化 creationKey 也需含已明确版本，不能以最后浏览版本改变执行对象。历史只读入口必须避开现有进屏自动准备工作树的 hook；树已删除的旧版本回看同样走只读来源，不触发准备树。以上接线要求的生产验证缺口见 STATUS。
