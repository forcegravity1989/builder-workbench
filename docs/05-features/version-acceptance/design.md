# 版本验收实现设计

> 给实现与技术评审者动代码前读；本文管对象、数据边界、模块归属和异常语义。用户行为以 [spec](spec.md) 为准，价值见 [intent](intent.md)，证据与缺口见 [STATUS](STATUS.md)。落地后同步 06-module。本文只描述当前有效方案，不保留被替代的形态或过程记录。
>
> 状态：v10（周五验收会议四步屏）实现设计，规格与意图已于 2026-10-22 经负责人确认。基线为 main（含计划屏 G3 生产实现 #399）。

## 设计边界

AcceptancePage 是 Workbench 业务页，复用 Orca 原生项目、工作树、会话、任务详情、文件打开、Automations 与指标执行能力。BW 只保存版本材料与人工输入，不复制 Issue、PR、指标或会议转写的正本。验收固定在 `bw/week-acceptance`，计划固定在 `bw/week-plan`；运行身份由 projectId、repoId、hostId、workflow、runId 和 cycleId 组成，版本由人明确选择，页内不按标题、日期或上次打开项推断。

不修改 Orca 核心：对象级动作经共用包装件 `workbench/plan-send-menu.tsx` 递交——它把动作按钮包进 Radix DropdownMenu，内容是**原生** `ReviewNotesSendMenuContent`（「发送至」运行中会话列表 +「新建智能体」快捷启动），同时开 `useAppStore.openAgentSendPopoverTargetMode` 让侧边栏 agent 行成为第二个发送面。`source` 沿用 `'browser-annotations'`、`launchSource` 沿用 `'notes_send'`，不扩 Orca 的 source union（扩它属于改原生协议，登记为上游接缝候选，不在本特性内做）。

**只开 target mode 不渲染弹窗本体等于点击无后续**：store 里没有任何组件会因 target mode 自己挂浮层，它只把侧边栏已在渲染的 agent 行改造成点击目标；该工作树无可发会话时连高亮都不触发，是纯静默 no-op。验收屏早期那份 `use-acceptance-action-send.ts` 就栽在这里（与计划屏被 #407 删掉的 `use-object-action-send.ts` 逐字同构），已删除并改接共用包装件。

## 模块归属：验收屏自带一套，不与计划屏共用文件

**决定（2026-10-22 负责人）**：计划屏目录下的板面逻辑**拷贝**到验收屏目录，两屏各自独立演进，不做提层重构、不新建共用抽象。代价是同类逻辑存在两份、后续会各自漂移；收益是验收屏的改动完全不触碰刚合入 main 的计划屏代码（#399），也不让任一屏的形态调整被另一屏拖累。

**拷贝（源 → 落点，均在 `src/renderer/src/workbench/`）**：

| 计划屏来源 | 验收屏落点 | 拷贝时的改动 |
|---|---|---|
| `version-planning/use-journey-spy.ts` | `version-acceptance/use-acceptance-journey-spy.ts` | 区段 id 改 `prepare/showcase/minutes/archive`，贴底判定指向 `archive` |
| `version-planning/PlanningSections.tsx`（Header + JourneyNav） | `version-acceptance/AcceptanceSections.tsx` | 标题改「版本验收」、`aria-label` 改「验收旅程」、四区文案按 spec、选版 `aria-label` 改「验收版本」 |
| `version-planning/PlanningMinutesSection.tsx`（含内部 MinutesCard） | `version-acceptance/AcceptanceMinutesSection.tsx` | 删遗留条目的闭环位与「基于纪要调整目标」动作（验收目标只读、无闭环消费方）；助手文案改「让验收助手整理纪要（可提供会议 ID）」；脚注改验收口径。注入 prompt 与计划屏同一瘦身原则（只承载触发意图，SOP 归 Skill），正源常量 `minutesRequestPrompt` 在组件内、验收口径（「整理本次验收会的会议纪要…」），设计正本 `prototype/acceptance-model.js` 同名导出；`document` 收必填——空板在 `AcceptanceBoard` 早退渲染 `AcceptanceEmptyBoard`，本组件的无材料分支是死代码已删 |
| `version-planning/PlanningArchiveCard.tsx` | `version-acceptance/AcceptanceArchiveCard.tsx` | 文案改验收归档；发布按钮并入本区（见「发布」节）。打开原生 PR 页不拷贝——两屏都 import 共用 `version-cycle/open-archive-pr.ts`（已从计划屏目录移到共用层） |
| `version-planning/version-planning.css` 中验收需要的板面壳/分区/纪要样式 | `version-acceptance/acceptance.css` | 只拷验收实际用到的选择器，类名前缀改 `acc-`，不整表复制；计划屏特有样式（上版回顾、目标卡编辑态、指标承诺）不拷。**批注与板面基础件的样式不在这里**——它们随共用组件走 `annotations/annotations.css` 与 `board-ui.css`，由组件自己 import，两屏自动同源 |
| `version-planning/PlanningGoals.tsx` 中目标行只读裁剪形态 | `version-acceptance/AcceptanceGoalRows.tsx` | 只读回显目标句/负责人/验收标准，删行内编辑、整卡删除、指标承诺区；行尾加达成/不达成，Issue 行加备注与遗留标记 |

**直接 import，不拷贝**（这些不在计划屏目录下，是 #399 建在共用层、注释明写供两屏使用的模块，或 v9.5 起就是两屏共用的壳层）：

- `workbench/annotations/`：`types.ts`（`AnnotationKind`/`AnnotationRef`/`annotationAttributes`/`annotationRefFromElement`）、`use-board-annotations.ts`（模块级会话 store，按 boardId 键控，两屏各传自己的板面身份）、`AnnotationPanel.tsx`、`AnnotationPopover.tsx`、`annotation-markdown.ts`、`annotation-markers.tsx`、`annotations.css`
- `workbench/board-ui.tsx`（+ `board-ui.css`）：`BoardIconButton`、`BoardActionButton`、`BoardLines`
- `workbench/plan-send-menu.tsx`：`PlanSendMenu`、`usePlanSendAction`、`SendActionWrap`——对象级动作与批注发送的原生发送弹窗包装件，#407 建在共用层。两屏共用同一件，`assistant` 参数只改用户可见文案里的 AI 角色名（验收屏传「验收助手」）
- `workbench/plan-column-resize.ts`、`workbench/use-plan-chat-collapsed.ts`：会话栏收折壳（名字带 plan 但已是两屏共用壳，v9.5 起验收屏就在用）
- `workbench/version-cycle/`：`ports.ts`、`cycle-context.ts`、`CycleWorkspaceProvider`、`use-material-autosave.ts`、`use-archive-pr-status.ts`、`AutomationConfigureButton.tsx`、`open-acceptance-source.ts`、`open-archive-pr.ts`、`trunk-update-port.ts`

发送弹窗的触发件用纯 button（`BoardActionButton`，2026-10-23 起发送触发件全部统一为图标+短动词格式），**不用 `BoardIconButton`**：后者内部已是 Radix `TooltipTrigger`，再套 `DropdownMenuTrigger asChild` 会让 tooltip 与 dropdown 的 `data-state` 与 aria 属性互相覆盖。计划屏同一做法。

批注可标注对象按 spec 用 `goal`、`acceptance`（验收标准块，#426 v0.7 验收会决议起挂载，与计划屏对齐）、`issue`、`board` 四种 kind；`AnnotationKind` 里的 `metrics` 在验收屏不挂 `data-annotate-*`（本屏无指标区），因此不可批注——这是屏级取舍，不改共用类型。

## 材料对象与协议变更

验收材料继续 `schema_version=3`，不升版：新增字段全部 `optional()`，退役字段按「剥离读回」处理（见下节），旧材料不迁移、不改写。

**新增**：

- `minutes?: AcceptanceMeetingMinutes` —— 与计划侧 `PlanMeetingMinutes` 同形但**不含闭环位**：`consensus: string[]`、`followups: Array<{ id: string; text: string }>`、`confirmed: boolean`、`confirmedAt?`、`sources?`、`updatedAt?`。followup 的 `id` 用 `crypto.randomUUID()` 稳定身份，人工增删不让既有编号漂移；板面按数组序显示 M1…Mn。不给验收材料留恒假的 `closed` 字段。
- `demoEnv?: { kind: 'url'; label?: string; url: string } | { kind: 'launched'; detail: string }` —— 演示环境两形态。web 服务类写 `kind:'url'`，可附一句系统名 `label`：板面「演示环境」行显示系统名、缺省回退 URL，点击经内置 Orca 浏览器打开；桌面应用类写 `kind:'launched'`，板面渲染状态文字，不伪造链接。缺失即未部署，如实显示未部署与下一步。
- 版本级交付件不再按目标记录：`results[].deliveries` 退役，版本级交付件与演示环境由 `demoEnv` 与制品登记承载。

**不新增** `workflow.release`：发布读数的正本在 Git 标签与 provider Release 页，抄进材料即造第二正本；板面不呈现发布状态，总览也不显示「已发布」。`AcceptanceWorkflowStateSchema` 维持 `stage/updatedAt/archivePr`，`stage` 枚举维持 `preparation/showcase/archive` 三值（界面四步与材料三阶段不同名、不映射，界面不渲染灯）。

**验收证据报告登记**：复用既有 `preparedArtifacts` 与 `Artifact.kind='verification'`（枚举与总览的「验证报告」渲染早已存在），不另立顶层字段。`Artifact.candidateRef` 必填，因此报告必须在候选固定之后生成——与技能 SOP 的顺序一致（固定候选 → 出包 → 部署 → 采集证据生成报告）。报告文件落 `.bw/planning/<版本>/`，`location` 存相对路径，截图落同目录 `shots/`。

**沿用**：`candidateRef`、`preparedArtifacts`（`kind=package`，含 checksum/location/实际命令）、`taskSnapshot`、`results[].decision`、`results[].note`、`results[].nextStep`、`results[].issueNotes`、`results[].issueMarks.carry`、`planRef`、`workflow`。

**`HumanDecision.reason` 必填的处理**：行尾两个动作不采集原因文本，沿用现生产映射 `reason: result.note`（`note` 为必填字符串，可为空）。不达成的原因与安排的正本是纪要、`nextStep` 与 Issue 备注，结论字段不重复承载；不改 schema、不为两按钮新增输入框。

## 退役字段与旧格式宽容读回

材料是 `strictObject`，多一个不认识的字段整份解析失败。所以退役字段**不能直接从 schema 删掉**——含轮次记录的存量材料会变成「材料损坏」，那是把真实的人工记录丢掉，不是退役。

**做法：字段留在 schema 里作为旧格式可选字段，读回宽容、界面只读。** v10 的任何界面与模型通道都不写它们；`AcceptanceMaterialSchema.parse` 对旧材料原样通过，主进程两个读取点（live 材料 decode、Git 历史 decode）都不需要预处理。板面末尾一个标注「旧格式记录（v10 前）」的只读折叠区呈现这些内容，由 `acceptance-legacy.ts` 的纯投影函数驱动，组件是 `AcceptanceLegacyRecords.tsx`：

| 旧字段 | 只读呈现 |
|---|---|
| `results[].progress` | 进展原文 |
| `results[].deliveries[]` | 目标级交付件，标题可点，经 `openAcceptanceMaterial` 打开 |
| `results[].materials[]` | 目标级材料链接，同上 |
| `results[].meetingDirectives[]` | 正文 + 处置标签 + 确认状态 + 来源（含 sourceRef），中文化呈现 |
| `results[].rounds[]` | 周次 + 轮次类型 + 封存时间 |
| `issueMarks[].risk` | 只列出被标记的 Issue 键，注明风险能力已整体去掉 |

区块内明写「不参与任何结论、纪要与遗留回显」。投影为空时整块不渲染。**把文件真正转换到当前格式属于迁移，走会话路径**：模型说明方案、经人确认、不留旧文件副本，与 schema2→3 的既有先例一致；读回永不改写存量文件。

**人工守卫**：`acceptance-human-guard.ts` 把这六个旧字段列为只读历史——模型通道任何改动（包括「顺手清理」）一律拒绝，因为清理属于迁移、归会话路径。

**退役清单（无 v10 消费方）**：`results[].rounds`、`meetingDirectives`、`issueMarks.risk`、`deliveries`、`materials`、`progress`。`issueMarks` 保留 `carry`（延期遗留仍是人工字段）。

**随退役删除的生产代码**：`AcceptanceRoundPicker.tsx`、`AcceptanceDirectives.tsx`、`AcceptanceMetrics.tsx`、`HistoricalRoundCards.tsx`、`AcceptanceGoalCards.tsx`、`AcceptanceGoalResult.tsx`、`AcceptanceDeliveryDetails.tsx`、`AcceptanceJourney.tsx`（灯）、`AcceptanceReportDialog.tsx`、`AcceptanceSources.tsx`、`acceptance-report.ts`（派生预览纪要）、`use-acceptance-history.ts`（按轮次呈现的历史 hook）、`shared/workbench/acceptance-rounds.ts`、`main/workbench/material-round-guard.ts`、`acceptance-decision.ts` 的 `decisionFreshness`（自动重核无消费方）。同一交付内删净，不留兼容层、回退或双路径。

**保留的能力**：读回历史材料的链路本身——`version-history-port` 的 list/read/readPlan 与 `version-cycle/open-acceptance-source.ts`。轮次 UI 与 `use-acceptance-history.ts` 退役，但计划屏「上版回顾」经 progressSource 寻址（仅 version 的来源在主分支推导最新已合入记录，存量四元组按固定提交寻址；身份不符即抛错不改读）依赖这条链路，不得一并删除。

## 人工字段守卫

`material-human-guard` 的验收侧扩展照 `plan-human-guard.ts` 的模式，保护：`results[].decision`、`results[].note`、`results[].nextStep`、`results[].issueNotes`、`results[].issueMarks.carry`，以及新增的 `minutes`。

`minutes` 的规则与计划侧同构、少一条闭环往返：模型通道只能在 `confirmed` 为假时起草与改写正文（`consensus`/`followups` 文本、`sources`）；`confirmed`/`confirmedAt` 是人工标记，模型通道拒写；`confirmed` 为真时整节冻结，模型通道任何改写都拒绝。**确认可以撤销**，撤销是人在界面上的动作、走人工通道，撤销后 `confirmed` 置假且 `confirmedAt` 清除，模型可重新整理。验收侧 followups 无 `closed`，因此不需要计划侧那段按 id 往返闭环的校验。

**`acceptanceMinutesChanges` 与 `planMinutesChanges` 的重复是有意保留的，不要抽共用骨架。** 两者同在 `src/main/workbench/`，不属「板面拷贝」那条授权的字面范围，所以在这里明写理由：可抽的公共部分约 20 行（深比较早退、已确认节拒写、confirmed/confirmedAt 归属判定），但计划侧另有一整块验收侧没有的 followup 闭环守卫（按 id 建 Map、新增条目不得预闭环、被删条目若已闭环要报），根因在类型层——`AcceptanceMeetingMinutes.followups` 是 `{id,text}` 无 `closed`，`PlanMeetingMinutes.followups` 带 `closed`。抽骨架要把这段差异做成回调或后置步骤注入，两个调用方各只剩 3–5 行，净收益接近零，代价是把一条**安全守卫**拆成跨文件的两半、读一处看不出拒写边界。同理 `material-human-guard.ts` 里 plan / acceptance 两个分支同形（差异只有 schema 常量、diff 函数与中文错误文案），也保持就地可读不做表驱动。

## 计划屏连带

验收侧退役会议指导后，计划屏上版回顾的「会议遗留」行改由纪要承载。`version-planning/use-prior-carryovers.ts` 的 `derivePriorCarryovers` 现行读法：

- **延期遗留**取 `issueMarks.carry` 并 join `taskSnapshot`。
- **会议遗留**优先取**已人工确认**纪要的 `followups`，按数组序标 M1…Mn、描述取 `text`；未确认的草稿不流入下版。
- **旧格式回退**：材料没有纪要节时（v10 之前写下），继续取已确认且 `tag==='next-week-plan'` 的 `meetingDirectives`，使旧版本的两行回显不因退役而变空。

延期遗留的呈现另受 #407 的三态口径约束（有标记无 carry = 上版无延期 Issue；完全未记录 = Unknown，另起一行经 TaskPort 同源读回上版快照 Issue 的当前 open 状态作事实参考，并声明这不构成人工延期结论）。两件事叠在同一行区域，改任一侧都要一起看。

## 总览连带

`overview-version-minutes.tsx` 的 `acceptanceText()` 已不再读目标级交付件（`results[].deliveries` 退役）；版本级交付件与演示环境由 `demoEnv` 与制品登记承载，`preparedArtifacts` 的 `verification` 渲染沿用既有「验证报告」。`readings` 保留（报告需要读数，板面不渲染不等于材料不存）。纪要读 `minutes` 的共识与遗留两块，替代已退役的派生预览纪要。总览不呈现发布状态。

## 板面结构与异常

四区单页 + 顶部定位导航（序号+标题+副题，滚动侦测高亮，点击 `scrollIntoView`）。滚动侦测：导航点击后抑制侦测直到用户活动（focus/wheel/pointerdown/touchstart/翻页与方向键）清除；贴底（距底 <2px）强制高亮 `archive`；否则取「区顶 ≤ 容器顶 +60px」的最后一个区。会话栏收折后 reanchor 当前区，不因回流跳高亮。空板态不渲染导航。

批注捕获层：板面元素挂 `data-annotate-kind/goal/issue/label`，`onClickCapture` 在批注模式下拦截整板点击，最内层命中者弹出对象小窗；`#minutes` 区内点击直接放行（人工确认是会中必须能做的铁律动作）；已存在的角标保留自己的点击（重开面板）。Esc 分层由 `useBoardAnnotations` 内部处理：先关小窗、再退模式与面板。批注为内存态：会话 store 按板面身份（scope + 版本）键控（`useBoardAnnotations(boardId)`，`Map<boardId, session>`，2026-10-23 对齐轮），切版=换 key 天然空会话，两屏不再有命令式 identity-`clearAll` effect（旧实现是单一全局会话+挂载即清，切屏瞬间互删未发送批注、同 goalId 串角标）；发送成功门控内 `clearAll` 清已递交批注（与计划屏同一 A 案），模型侧删对象经 `pruneMissing` 清孤儿。批注模式入口在页头右上角（#426 v0.7 验收会决议自 Showcase 区块标题行移回，与计划屏同位：页头不随内容滚动，会中随时进出、未发送角标常驻可见）——`AcceptanceHeader` 的可选 `annotateEntry` prop，`AcceptanceBoard` 仅在计划已读时传入 `BoardActionButton`（文字标签 + `.acc-annotate-count` 未发送角标），空板态不渲染；区块头槽位与旧页头 `extraActions` 槽位均已删除。验收标准块（`.acc-acceptance`）挂 `kind='acceptance'` 捕获属性、h3 挂合并角标（与计划屏同款对象语义）；行尾「下一步」textarea 维持排除（人工输入件，非评审对象）。

2026-10-23 UI 对齐轮（#417，高保真反馈轮 2 后全量对齐）：页头 `.acc-header` 从列布局改为与计划屏同行（标题左、动作右、`flex-wrap` 兜底，度量抄 `vp-header`/`g3-header-actions`）；Showcase 目标卡抄计划屏 `g3-goal` 度量——卡片底色 `var(--card)`、head 顶对齐、标题 600+悬停下划线、meta 独立行 78px 缩进、body 78px 缩进、`acc-task-head` 带 border-top 分隔；Issue 行对齐 `g3-task`（baseline、gap 12、8px 上下节奏、标题悬停才下划线），行尾「打开原生任务详情」按钮保留（高保真同轮补齐）；板面动作按钮统一 `BoardActionButton` 图标+短动词（部署 BrainCircuit、发布 Rocket、出包 Plus、下载 Download），`acc-text-button` 只剩页头文字按钮，`wb-btn` 退出板面动作按钮（冲突/恢复提示区仍沿用，与计划屏提示区同款）；报告入口只在「验收准备」证据报告行，目标行 `hasReport`/`onOpenReport` 链路删除；`demoEnv.kind='url'` 增可选 `label`（系统名），「演示环境」行显示系统名、缺省回退 URL；长 title 与说明文字清到计划屏密度。纪要卡抄 `g3-minutes` 度量（方片状态章、列表无默认符号、foot 按钮输入件皮肤），归档/发布卡抄 `g3-archive`（卡片底色、20px 内距、gap 16），旅程导航抄 `g3-journey`（等分满宽、当前项加粗）。壳层共用改动（两屏同受益）：`.vc-split` 从 1px+外扩热区改为 6px 实体全高热区+居中 1px 线（上游 `tab-group-split-resize-handle` 同款）——旧热区被两侧定位内容（xterm 视口、板面定位容器）盖住，只有顶部 titlebar 一段可拖；titlebar 的验收专用老「收折会话」开关删除，收折/展开统一板面页头 chip 唯一入口；收折态 36px 栏加整栏点击展开覆盖层（带 title 提示），分隔条收折不渲染维持第九轮拍板。

同轮补齐：Showcase 区块头「刷新 Issue」图标按钮（`taskPort.refresh`，在途切版旧读回不覆盖新列表，计划屏同款漏抄；#432 起两屏 Issue 读数经 `version-cycle/use-cycle-task-reads` 渲染进程快照缓存共享——进屏立即回显上次读数并后台静默重读、按钮为强制重读，`taskSnapshot` 仍只随读取落地更新，缓存回显不喂快照）；CAS 冲突处置从「人工核对裸 JSON」改为字段归属静默合并——`acceptance-merge.ts` 纯函数（模型字段取远端；人字段 decision/note/nextStep/issueNotes/issueMarks/minutes 保留本地相对基线的改动；本地独有 result 整条保留），`MaterialDraftController` 增可选 merge 策略与干净基线 base 追踪（计划屏不传策略、行为不变），合并成功只留一行 `notice`（随下次编辑或保存消失），`AcceptanceNotices` 退役裸 JSON 对照区、仅基线缺失（脏草稿恢复后再冲突）时留两按钮人工处置；合并基线随每次合并推进到远端文档，防止连环冲突把已采纳的远端值钉死成「本地人改」（检视轮 B1 修正）。证据报告等 HTML 材料经 `openAcceptanceMaterial` 改走 Orca 原生工作区文件浏览器预览（`openFileInBrowserTab`：本地=内置浏览器页签、SSH/配对=doc-preview、不支持回落编辑器）——报告是渲染件，此前走编辑器只见源码，spec A04「内置浏览器可打开」由真机反馈补正兑现。

2026-10-23 易用性收口轮（#426，v0.7 验收会后决议）：批注入口移回页头右上角（两屏同轮；`AcceptanceHeader`/`PlanningHeader` 增可选 `annotateEntry`，`AcceptanceGoalRows`/`PlanningGoals` 的区块头槽位与 prop 删除，详见「批注捕获层」段）；验收屏验收标准块参与批注（`AcceptanceGoalRow` 的 `.acc-acceptance` 挂 `annotationAttributes({kind:'acceptance'})`、h3 挂 `AcceptanceAnnotationBadge` 合并角标，批注横幅与入口 title 文案随对象清单更新）；计划屏旅程第一步改名「计划准备」为计划侧落地（见计划 design）。spec「入口不在页头」「验收标准区块不参与批注」两条款经会决议改写。

出包区块沿用既有 `AcceptancePackage` 与 `workbench.package.*` 协议（按远端身份分派 CodeHub cloudbuild CLI / CloudDragon 会话 / gh CLI，SSH 宿主拒绝出包），可收缩、默认收起为一行最新包摘要；受理后每分钟静默刷新、`launchInFlight` 互斥不重复启动；无流水线/无权限/远端认不出/非本机宿主如实报错。包重出不自动刷新板面已填内容，是否重核由模型在会话中提醒、人决定；板面不做主动失效或待重核呈现。

材料打开沿用 `openAcceptanceMaterial`：HTTP(S) 经 `openHttpLink` 打开选定工作区原生浏览器，`.bw` 相对路径以该工作树为根经 `activateMarkdownLink` 在所属宿主原生编辑器打开；先校验工作树身份，拒绝含凭据 URL、不支持协议与远端树外路径；发起后展开 BW 会话栏。报告未生成时对应入口 `disabled` 并如实说明，不静默失败。

保存与冲突沿用材料事务核心：`expectedRevision`、原子替换、跨进程互斥、工作树身份校验；保存冲突保留用户输入。「更新代码」是唯一同步入口，执行期间材料只读，快进不了保持原样并统一提示交会话处理。

## 发布

板面发布区只有一个「发布」按钮。点击弹出共用发送弹窗（`plan-send-menu.tsx`）：只读指令预览 +「发送至」运行中会话列表 +「新建智能体」快捷启动，由人选定会话后把一句话发布请求递交到验收会话（与人在会话里直说等价）。预检呈现、发布提交与验收包一致性核对、知情授权、按项目自有发布入口执行、发布后独立读回，全部在会话中由模型按技能 SOP 完成，结果在会话中报告。板面不设预检弹窗、不设发布状态读回行，材料不存发布记录。未经人明确授权不创建 Release、不打标签。

同一通道承载本屏全部注入动作：部署、整理纪要、发起归档、发布、板面批注发送。递交成功后板面给一条 notice（`onPromptDelivered` 回调），失败与无可发会话由原生菜单自己如实呈现，板面不另造状态。

## 验证边界与测试取舍

协议纯函数与数据契约用 Vitest 覆盖，只立两类看护：新增的纪要守卫（模型通道拒写已确认节、撤销走人工通道）、演示环境两形态与报告登记的解析、退役字段剥离读回、`derivePriorCarryovers` 改读纪要后的推导。界面渲染、布局、文案、交互序列与 hook 装配不立单测，交真壳与验收点 E2E。叠层单测受执行例数 ratchet 约束（基线见 `config/vitest-count-baseline.txt`），退役的 `acceptance-model.test.ts`/`acceptance-task-evidence.test.ts`/`acceptance-version-choices.test.ts` 中失效用例同批删除以对冲新增。

行为正确性靠真壳：`pnpm run dev:workbench` 起独立 profile，验四区导航与滚动高亮、批注模式全流程（含纪要区排除与 Esc 分层）、行尾人判互斥与取消、纪要编辑态与确认/撤销、部署两形态读回、报告打开、归档原生 PR 页、发布注入、杀进程重启读回一致。交付附验证报告，本次新增或修改的判据内嵌真壳截图四件套，截图推永不合入的 `shots/<分支名>` 并钉 SHA。v10 不沿用 v9.5 那轮「不运行真壳」的豁免口径。

技能资产（`standard/skills/version-acceptance/`）改动须连同 `skills/` 镜像、`resources/skills/` manifest 与 registry、`src/cli/bundled-skill-guides.ts` 一并再生，并过 `verify:skill-bundle-manifest` 与 `verify:bundled-skill-guides` 字节门禁。
