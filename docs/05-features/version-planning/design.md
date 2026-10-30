# 版本计划实现设计

> 给实现与技术评审者在动代码、拆并行边界前读取；本文管本次设计与共享契约，不写执行步骤。行为见 [spec](spec.md)，当前实现以源码及 [architecture](../../architecture.md) 为准。实现取舍变化时更新，落地后把稳定模块心智回写 06-module。
>
> 状态：已授权实施；详细设计未逐项细审，未决项须人工确认。已实现范围及证据见 STATUS，正文按当前接线回写；未标注落点的接口仍为设计。架构定位：§1 项目版本，§2 ①事实、②执行、③规范、⑤壳，§3 Orca 执行核与 BW 叠层。


## G3 计划屏实现边界(2026-10-21 落地)

[计划旅程高保真](planning-journey-prototype.html)（`prototype/g3-*` 源码与生成物）沿用已认可的 G3 布局。#439 的短启动卡、紧邻前版回顾和纪要处理已同步到现行行为与源码；独立静态检视已完成，CI 补验结果见 [PR #441 验证报告](https://github.com/forcegravity1989/builder-workbench/pull/441)，真实用户旅程仍待验证，已接入三屏 Issue 共用读取、固定回顾复用和建版等待收窄；性能增量目前仅作静态检视，实际耗时仍待测。原型仅为设计资产，历史证据与未验边界见 [STATUS](STATUS.md)。

会议纪要沿既有 `minutes` 正本与 Issue 引用，计划侧取消逐项闭环控件，整份人工确认与冻结保留；归档前每条已落实或关联真实跟进 Issue，由助手核对、PR 人审，Issue 未关闭不阻止归档，不加界面硬门禁。旧 `closed` 兼容读回并按原值保留，不自动迁移历史正文，不新增逐项状态协议。固定来源回顾仍是讨论参考，不自动转成下版任务或承诺。

兼容边界：材料身份、固定来源引用与人工结论协议不变，显示排序不重排持久化任务。计划旧 `minutes.followups[].closed` 为可选历史字段，原值读写；历史纪要不因新去向规则强制迁移或重置确认。打开、保存、重启与固定修订读回仍需真壳复验。

| 屏面 | 落点 |
|---|---|
| 页头(面包屑版本下拉 / 保存状态 / 会话收折 chip / 分支名 / 批注模式 / 更新代码 / 配置自动化) | `version-planning/PlanningSections.tsx` 的 PlanningHeader;chip 经 `plan-column-resize.ts` 的 `togglePlanChat()`+`PLAN_CHAT_TOGGLE_EVENT` window 事件桥与壳 `use-plan-column-resize` 同步(不能用 storage 事件:同窗口写入不触发),收折态订阅在 `use-plan-chat-collapsed.ts`;壳 `AppWorkspaceShell` 的 titlebar 收折开关已整体退役(#417:曾改为仅验收屏保留),两屏 titlebar 均为纯拖拽带,收折/展开统一板面页头 chip 唯一入口;批注模式经 `PlanningHeader` 可选 `annotateEntry` prop 由 `PlanningBoard` 传入(计划已建才渲染,#426 移回页头右上角,见「在线批注」行)；页头功能键复用 `BoardActionButton`，以中性底色与描边按钮归组，分支信息在组外。收起时会话列透明、不可交互并脱离布局，保留正常栏宽；`TerminalWorkbenchContainer` 沿原生机制保留必要浏览器绘制，展开恢复同一会话与栏宽。 |
| 顶部 4 分区导航(无灯) | PlanningSections 的 PlanningJourneyNav;滚动 spy 与导航抑制照原型逻辑放在 `use-journey-spy.ts`(触底→archive,否则 findLast(top ≤ 容器 top+60);焦点/滚轮/指针/翻页键清除抑制)。`workflow.stage` 契约不变(模型仍写,供会话校准与自动化),两屏界面都不渲染灯、不派生完成度,唯一文字消费是归档卡在 stage=archive 且未记录 PR 链接时的「已进入归档阶段」状态行——验收屏灯随 v10 退役;旧竖排灯条与 `workflowStageIndex` 的计划侧消费已删 |
| 上版回顾两行 | `PlanningPriorReview.tsx` + `use-prior-carryovers.ts`;`planning-progress-source.ts` 改为返回固定来源的验收文档与其采用计划(身份核验原样,不再产 buildAcceptanceReport 加工文本)。纯映射 `derivePriorCarryovers`:延期遗留 = `results[].issueMarks` carry 标记按 `acceptance-issue-annotations` 的身份/legacy 裸编号兼容 join 文档顶层 `taskSnapshot`(join 到才给标题与原生详情入口,join 不到只显示编号);会议遗留 = **已人工确认**纪要的 `minutes.followups`(按数组序编号 M1…,未确认草稿不流入);材料没有纪要节时(v10 之前写下)回退 confirmed 且 `tag=next-week-plan` 的 legacy `meetingDirectives`(v10 主源随验收 #394 落地,读取实现 `use-prior-carryovers.ts`)。缺字段→空态,不解析 note、不按 open 推断。**2026-10-22 真机反馈轮**:derive 同时返回 `issueMarksRecorded`(验收是否有任何 issueMarks 记录)——未记录时 UI 显示「上版验收未记录 Issue 延期标记」(Unknown,不断言无延期),并由 `use-prior-live-open.ts`(新)异步读回上版 `taskSnapshot` ready 条目的当前 open 状态(经 taskPort 同源 gh/git 读回、loading/error/retry 三态、失败不冒充),渲染为「实时读回」参考行;有标记无 carry 才显示「上版无延期 Issue」 |
| 目标卡(G3 形态) | `PlanningGoalCard.tsx`(计划专用;原共用 `VersionGoalCard` 已随验收 v10 删除——验收屏改用独立只读勾勾表行 `AcceptanceGoalRow`,计划侧的编辑分支/交付件 textarea/readOnly/onChange 也一并删净)。行内编辑态(铅笔切换,单卡编辑)、就近删除二次确认、整卡删除级联(goals 过滤 + tasks 引用整条移出 + 批注按结构化引用级联,经现有 autosave CAS 保存);开合记忆沿 `cycle-view-state` 的 goalCardViewKey,默认收起(照原型);Issue 行平铺 + `taskKind` 角标(精确 `/^(bug\|缺陷)$/i` → Bug,否则 Feature;未 ready 行无角标、状态未知,Unknown 铁律)+「开工」箭头(永久 hookup = G2 统一 Start/Open 解析器 `openIssueWorkspaceOrStart`,#383 P3b②;解析面之外回落 `taskPort.openDetail` 开原生详情,可访问名按语义双轨:「开工 #N：打开本版绑定工作区，没有则进入原生创建器」/「打开 #N 原生任务详情」,不另写继续逻辑);标题去 `【…】` 前缀渲染 |
| 指标承诺 | `PlanGoalMetrics.tsx` 换装 `g3-metric-*` 形态,行为链沿用(目录选取、按名去重、定义已更新提示、当前读数/目标草案、采集=总览同一能力、证据 details 与基线采用);「配置指标」上移到目标区标题旁;文案按 spec 生产文案清单(「当前 —」「目标草案/目标」「采集」) |
| 会议纪要 | `PlanningMinutesSection.tsx`，材料可选 `minutes` 节；followups 保留稳定 id，正文写清已落实或真实跟进 Issue，不提供 closed 控件。`plan-human-guard.ts` 保留 confirmed/confirmedAt 与历史 closed 的人工归属，确认后整节冻结；模型只可改未确认正文。无 minutes 显示共识/遗留骨架，有计划才可整理；归档前的逐项核对归助手与 PR 人审。总览计划列读存储 minutes，无材料如实显示「纪要未记录」。 |
| 在线批注 | 共享模块 `workbench/annotations/`(types / use-board-annotations / AnnotationPopover / AnnotationPanel / annotation-markers / annotation-markdown),BW 业务屏共用机制,本轮只接计划屏,内存态(重启丢失为设计内)。对象引用结构化 `{kind, goalId?, issueNumber?, label}`,DOM 挂载 `data-annotate-kind/-goal/-issue/-label`;捕获 = 滚动容器 onClickCapture + `closest('[data-annotate-kind]')`,纪要区排除;编号按记录顺序现算,角标与面板同号;Esc 只关小窗(#444 起退出统一走快捷键/页头按钮,2026-10-29 拍板);横幅用清单认可短文案(键位半段随 #444,见 spec)。**2026-10-22 真机反馈轮**:角标 `.g3-annot-marker/.g3-annot-num` 改显式高对比配色 `var(--color-accent, #d97757)` 底 + 白字(claude 皮肤 accent 即赭色;修复 foreground/background 变量对真壳解析失败回落继承色导致的黑底黑字);面板复制改 `window.api.ui.writeClipboardText`(Orca IPC,替换真壳不可靠的 `navigator.clipboard`)+ 按钮「已复制」1.4s 瞬态(对齐原生 Copy All)。**2026-10-22 第八轮**:批注入口从页头右上角移入「本版目标」区块头(用户反馈右上角不显眼;可批注对象全在该区块、纪要区不参与,入口贴着对象),改带文字标签按钮而非纯图标,挂未发送条数角标(面板关掉也可见待发批注),计划未建不渲染;同区块「配置指标」原误用批注图标,改回指标图标。**切屏保留未发送批注(2026-10-22 user feedback)**:同会话内看验收/任务屏再回来不得丢速记,范围超出正本「重启丢失为设计内」;第九轮拍板实现形态为屏路由之上的模块级会话 store、不用本地存储(重启也保留属改既定行为,需人另行拍板),对齐轮升级为按板面身份键控(见本格末)。**发送成功即清空已递交批注(accepted option A)**:对齐 Orca `onPromptDelivered` 成功门控,失败/Esc 不清;面板转「暂无批注」、板面回执明说清了几条。**2026-10-23 第九轮生产接线**：入口从页头 `extraActions` 移入 `PlanningGoals` 区块头 `.g3-title-actions`（`annotateEntry` prop，文字标签 + `.g3-annotate-count` 未发送角标，计划未建不渲染）；发送成功门控清空挂 `PlanningAnnotationOverlays` 的 onSent（`onPromptDelivered` 成功才回调），回执追加清空条数；切屏保留落模块级会话 store（见 spec 第 4 条）。**2026-10-23 验收对齐轮**：会话 store 改按板面身份键控（`useBoardAnnotations(boardId)`，`Map<boardId, session>`，boardId=scope+版本）——单一全局会话被验收屏 #394 遗留的挂载期 `clearAll` effect 击穿（切屏瞬间清空计划屏未发送批注，违反第 4 条），且两屏 goalId 相同会串角标；两屏的命令式 identity-clearAll effect 同批删除，切版=换 key 天然空会话，发送成功清空与重启清空不变。**#426 易用性收口轮（v0.7 验收会决议）**：入口从「本版目标」区块头移回页头右上角——`PlanningHeader` 增可选 `annotateEntry` prop（`PlanningBoard` 在计划已建时传入 `BoardActionButton`，渲染于分支名与「更新代码」之间），`PlanningGoals` 的 `annotateEntry` prop 与区块头槽位删除；依据：页头不随内容滚动，会中随时进出批注模式、未发送角标常驻可见，第八轮「入口贴对象」取舍经会决议废止。同轮旅程导航第一步「上版回顾」改名「计划准备」（`PLANNING_SECTIONS` 与高保真 `g3-model.js stages`，与验收屏「验收准备」口径一致；区块内容、「验收回顾」标题与 aria-label 不变）。 |
| 与 Orca annotate 组件族的关系 | **不复用**原生浏览器捕获链(useGrabMode/viewport-bridge/pending-card 绑 webContents 注入与页面坐标,React 板面用不上);**复用**发送弹窗链路 `openAgentSendPopoverTargetMode`(source 沿用 `'browser-annotations'`,不扩 Orca union;埋点归因混入浏览器批注,要区分走 ref/upstream 接缝候选交人)与 Radix Tooltip(Esc 原生)。面板/小窗按 G3 形态自建:无意图分段与发送行,小窗只新增(× 只关窗),编辑/删除在面板卡片;Markdown 输出 `- [对象] 文本` 自建纯函数 |
| 对象级动作 | `PlanSendMenu.tsx`(2026-10-22 新增,替换已删除的 `use-object-action-send.ts`——它只触发 target mode 高亮、漏掉弹窗本体):拆解 Issue、整理纪要、批注发送三个入口(「与计划助手基于纪要调整目标」按用户决定退役——整理纪要后 Skill SOP 自然引导调整)统一包装为 Radix DropdownMenu 触发器:open 时调 `openAgentSendPopoverTargetMode`(source 沿用 `'browser-annotations'`),菜单内容 = BW 指令预览区(只读一句话指令)+ 原生 `ReviewNotesSendMenuContent`(会话列表 + 快捷启动,不改 Orca 契约);close 时 `closeAgentSendPopoverTargetMode`;动作同时 `revealPlanChat()` 展开会话栏;发送成功经 `onPromptDelivered` 给板面瞬态反馈。动作点为图标 + 短动词文字按钮(`BoardActionButton`,替换纯 IconButton)。卸载时 close。贴草稿通道不恢复；`entry.start`（自动化手动运行）由未开始短卡「开始计划」调用，仅返回 true 后展开四区；对象发送仍沿原生运行会话列表与快捷新建，不另建会话路由。 |
| 归档 PR | `PlanningArchiveCard.tsx`(计划屏专用;验收屏有自己的 `AcceptanceArchiveCard`,两屏独立演进。原共用 `CycleArchive.tsx` 在验收屏 v10 落地后失去最后一个消费方,已删除)+ `version-cycle/open-archive-pr.ts`(共用层,两屏都 import):resolveReferenceRepo → GitHub `lookupGitHubWorkItemForSource(type:'pr')` / CodeHub `viewTask(kind:'mr')` → `openTaskPage(returnToPreviousView)` 落原生 PullRequestPage/MR 详情,不跳外部浏览器;解析失败经 notice 如实提示,不外链兜底。状态读取链(use-archive-pr-status)不变;计划侧「查看评审」外链已删 |
| 样式 | `version-planning.css` 整体换装 g3-planning.css 移植(作用域 .vp-board,fixed 浮层除外;窄板容器查询阈值 780/580/420 照原型);`--radius-lg: 10px` 补进 workbench-tokens.css(设计系统同值);planning-dialogs.css 并入后删除;**批注与板面基础件的样式不在本表**——随共用组件走 `annotations/annotations.css` 与 `board-ui.css`(由组件自己 import,两屏自动同源);planning-fields.css 已删除(其余 vp-metric* 规则随验收 AcceptanceMetrics 删除而失去消费方,唯一在用的 `.vp-metric-evidence` 消费方是计划屏 PlanGoalMetrics,已并回 version-planning.css);原型手写 tooltip 不移植(生产用 Orca Radix Tooltip) |

G3 向 G2 / Orca 提供完整任务引用与返回位置;侧栏、原生创建器、工作区查找及会话执行由 G2 / Orca 承接。「开工」箭头已永久 hookup G2 统一 Start/Open 解析器(随 #383 P3b② 交付;返回位置随任务范围详情往返保留)。归档沿已有原生会话流程。剩余开放项:会议 ID 自动获取(Leader 群组 / WeLink)依赖的用户组旅程。验收屏批注接入已随 v10 交付(共用 `workbench/annotations/` 组件族 + 共用 `plan-send-menu.tsx` 发送包装件),移交项逐条处置见计划 spec「对验收侧的移交项(处置结果)」。批注为屏内内存态、纪要存材料,无业务数据库、快照存储或第二套批准状态。

### 与高保真的有意偏差登记

| # | 偏差 | 理由 |
|---|---|---|
| D1 | 页头保留版本下拉(融入面包屑) | G2(#383/#328/#389)才移除屏内版本选择;本轮必须有选版入口;选版相关 spec 条款原样保留(G2 P3b 范围)。2026-10-22 G2 P3b 已落地:绑定树页头只读回显绑定版本(无下拉),旧无绑定树保留下拉;spec 选版条款已按此改写 |
| D2 | 页头保留「更新代码」描边按钮，归入操作组 | 已认可的唯一同步入口(spec 范围与入口段仍有效);高保真未画 |
| D3 | h1 旁保留保存状态 | 已认可行为「正常状态只在标题旁简短呈现」;高保真为演示脚注替代 |
| D4 | 上版回顾默认紧邻前版，不再要求先手选来源 | 先定位前版再读其验收，缺少不回退；已有固定来源不替换，无前版显示「暂无上版」 |
| D5 | 目标区标题保留「刷新 Issue」IconButton | 任务状态读回刷新为生产必需(读数经 use-cycle-task-reads 快照缓存回显、带读取时间;#432 起进屏先回显上次读数再后台静默重读,按钮为强制重读,在途读取〔含进屏后台重读〕期间按钮显示进行中);高保真未画 |
| D6 | 开工箭头可访问名按语义双轨:解析面「开工 #N：打开本版绑定工作区，没有则进入原生创建器」、回落面「打开 #N 原生任务详情」 | 高保真「开工 #N(G2 衔接)」含内部代号;G2 永久接线(#383 P3b②)后按真实动作命名,不用内部代号 |
| D7 | 批注模式与面板头图标用 `MessageSquarePlus` 单图标 | 高保真两图标组合是原型 vendor 冻结变通;生产 lucide 有原生同形图标,视觉一致 |
| D8 | Issue 行不显示 assignee、标题去 `【…】` 前缀渲染 | 对齐高保真行内元素(编号/标题/角标/状态/批注/开工) |
| D9 | 任务未 ready 行不渲染分类角标 | Unknown 铁律:无 labels 数据不冒充 Feature;高保真 fixture 全部有 labels 未覆盖此态 |
| D10 | 总览历史版本纪要列对无存储纪要的版本显示「纪要未记录」 | 三节派生模板退役(两屏均已交付)的总览侧后果;如实不冒充 |
| D11 | 材料读取问题随开始请求作为一次性上下文递交 | 短卡不堆内部问题详情；请求失败仍如实提示，不假装启动或初始化替代材料 |
| D12 | 批注横幅用清单认可短文案,不用原型长引导语 | spec 原型注释清单(引导语不进界面)与行为段(进入后有横幅提示)冲突,经人拍板 2026-10-21:横幅保留、文案用已认可短句 |
| D13 | 面板提示行仅批注模式显示 | 原型面板提示常驻;退模式后经角标重开面板时该句为陈旧提示,按诚实呈现收敛 |
| D14 | 批注面板 absolute 锚板面体(top:16,页头以下),开启时与顶部导航右段重叠(原型 fixed 视口 top:96 的遮挡效应相同);对象小窗经 createPortal 挂 document.body、fixed 贴被点元素 | 生产板面右侧还有 Orca 资源管理器列、页头为两行高于原型:fixed 视口坐标会遮右栏、板面 top:96 会压页头动作行(均真壳实测);portal 消除任何引擎下 container-type 包含块捕获小窗的风险;导航右段重叠为原型同有的瞬态遮挡,关面板即恢复 |
| D15 | 「配置指标」用 ChartNoAxesCombined 图标 | 原型用 annotate-mode 组合glyph 是 vendor 冻结变通;指标语义图标与旧生产一致且更准确 |
| D16 | 无版本仍显示短卡「计划尚未开始 / 开始计划」 | 原生会话可协助明确版本；成功前不展开四区，不自动建材料 |
| D17 | 清单未覆盖的生产必需状态串四则:上版回顾「正在读取…」、复制反馈(2026-10-22 轮改为按钮内「已复制」瞬态,原 notice「已复制板面批注。」退役)、目标区「Issue 状态未知:{原因}」、指标块「指标未知:{原因}」;未 ready 的 Issue 行与上版回顾 join 失败行仅显示 `#编号`(+状态未知),不另加「标题未读到」(按决策 A 只显示编号) | 运行态如实提示为生产必需,清单只覆盖静态文案;性质同 D4/D16,PR 中请人过目 |
| D18 | 发送成功瞬态反馈不含会话名(「{动作名}已发送给计划助手 · 在会话栏查看进展」),原型演示含会话名 | 原生 `onPromptDelivered` 回调无参数,取会话名需扩 Orca 契约(条款 3 明确不改);2026-10-22 真机反馈轮经 subagent 检视登记 |

## 现状与复用

本轮已完成入口切换：旧三屏链条（PlanJourneyShell / PlanWeekBoard / PlanWeekPlanChat / plan-week-* / workbench-plan.css）已退役删除，以下为当前接线。

两屏以未开始短卡承载「开始计划 / 开始验收」，配置自动化留在页头。手动运行已登记自动化，经 oneShotPrompt 递交明确版本与材料读取问题，启动前用原生更新接口将条目的工具保存为 BW 当前默认智能体，保留提示、模型与会话复用配置。`entry.start` 仅在原生运行会话实际打开后返回 true；板面据此展开四区，并以 `cycleStartedViewKey` 按 workflow、版本、scope/owner、工作树保存渲染进程视图态，版本初读为空时用 boundVersion 稳定身份。普通 shell 不能证明流程已开始，已有有效材料独立恢复。

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
| BW version-cycle 共享层 | 项目/版本上下文、版本材料读写与自动保存、归档 PR 打开链（open-archive-pr，两屏共用）与状态薄读取、任务端口与会话收折桥、自动化登记与提示注入 | 调度器、聊天日志、Issue 正文和状态正本 |
| 计划 | 版本目标、会议纪要（材料 minutes 节）、任务引用 | 验收结论、指标采集实现 |
| 验收 | 固定计划引用、实际交付、人的结论和后续 | 改写原承诺、自动完成 Issue |
| 指标 | 定义、窗口、采集和读数；详见 [指标设计](../overview-metrics/design.md) | 版本目标值和验收结论 |
| Orca | Tasks、工作树、会话、Automations、项目/宿主身份、通用文件与命令权限 | BW 的业务规则 |

共享接口已按职责落地为 renderer 端口 + 原生 RPC：VersionHistoryPort.list/read/readPlan（version-history-port，按固定 Git 提交发现及读取多周记录）、「配置指标」经 CycleWorkspaceProvider 直接进入 bw/metrics-refresh 固定维护树原生会话（提示由指标模块提供；不设端口抽象，原死契约 MetricSetupPort 已随收尾代码批删除）、VersionDocumentPort.read/save(expectedRevision)（version-material-port）、TaskPort.listVersion/openDetail(origin)/refresh（task-port，github.workItem / codehub.viewTask 复用原生读取层，单条失败 kind:'unavailable'）、ArchivePrPort.readStatus（archive-pr-port → workbench.archive.prStatus，按材料记录的 workflow.archivePr 编号薄读取 PR 合入状态，读不到保持 unknown）、MetricsPort.list/read/refresh（metrics-port，指标端定义）。原 CycleSessionPort.prepareRequest 贴草稿通道与 ArchivePort.readStatus 字节证明链已整体退役删除。底层仍调用原生能力，不另建存储。

## 版本材料与写入

PlanningBoard 未开始时只渲染页头和 `PlanningStartCard`。成功打开原生运行会话或已有有效材料后，显示计划准备、本版目标、会议纪要、归档 PR 四区；空材料保持目标为空，不造占位目标。目标卡沿 `PlanningGoalCard` 编辑/删除/Issue 形态，开合视图偏好按 `goalCardViewKey` 保存，不写材料。指标承诺沿 `PlanGoalMetrics`；进展/风险编辑区和预览纪要弹窗维持退役。样式限定于 version-planning.css，不改变总览。

usePlanningMaterial 继续复用 MaterialDraftController 的本地草稿、远端修订与 CAS，不新增材料副本。usePlanningAutosave 对连续编辑去抖并串行写入；写入期间的新编辑继续保留，在显式 flush 时排空到最新修订后才返回。版本切换先 flush，写入前复核当前范围与材料身份。冲突、远端删除或错误暂停自动写入，由 PlanningPersistenceNotice 提供保留双方内容、重读或明确重试；不以自动重试覆盖模型编辑。轮询只发现材料变化(含 minutes 节);两屏界面都不渲染旅程灯(计划屏自 G3、验收屏自 v10 起),`workflow.stage` 只作材料内部进度供会话校准与自动化。组件/控制器检查不替代真壳输入、重启及真实模型并发验证。

保留 `.bw/planning/<version>/data.json`、schema_version=3 与现有目标/任务/workflow/minutes 契约。上版来源先以 `selectPriorVersionSource` 按目录既有排序定位紧邻前版，再查该版验收；已有 `summary.progressSource` 优先，缺验收不回退更早版本，不生成成绩。`planning-progress-source` 经 history.read/readPlan 按 version/cycleId/sourceCommit/revision 核验固定验收与计划，`use-prior-carryovers` 只投影延期/会议遗留；固定读取失败两行留空、不增独立错误或重试界面，实时 Issue 参考的错误/重试保留。「查看验收依据」复用既有只读材料页与 readonlyBrowse，进入同一固定修订整页，返回原计划，不建树、不读当前稿或初始化替代材料。加载失败不新建替代物；版本不由日期、标题或 mtime 推断。

任务只保存 provider/repo/number 与 goalId 引用。三屏共用 task-reference-reader 的原生行结果及在途请求，按 provider、宿主、项目/登记仓、来源身份及编号隔离，复用 snapshot-cache 原语、限于渲染进程；各屏按当前引用投影，挂载先回显再后台更新，按钮强制重读。GitHub 支持域内沿原生 gh:workItemsBatch 每 20 号分片，保留成功片、只补失败或缺失项；environment runtime 保持原生单项路由，CodeHub 复用有界逐项 CLI。use-cycle-task-reads 保留整批发布和新鲜证据回调，缓存回显不写 taskSnapshot；固定回顾核验成功后沿完整来源身份复用，来源变化或手动刷新才重读，实时 Issue 独立更新。会议纪要存材料可选 minutes 节（共识/遗留/人工确认，模型只写未确认正文），不再存 live_notes、transcript，也不由目标派生三节模板。协议细节的唯一模型参考是 [version-records](../../../standard/system-prompt/references/version-records.md)。

UI 与模型共用在文件所属宿主执行的版本材料写入核心；模型入口是宿主下发的 `ORCA bw materials` CLI 薄入口。写入含受信任项目根、版本路径校验、expectedRevision、跨进程互斥和原子替换；重读修订后再提交，锁范围只含本文件事务，不锁住模型对话。CLI 与 UI 不各自实现一次校验。planning.py、version-plan.html 模板与 data-template.json 已在消费方切换的同一交付内退役删除，旧 confirm / submit-confirmed 不再控制任何流程；check-week-comment.py 与 week-plan-comment.md 保留作历史评论修复协议。

材料事务核心位于 src/main/workbench/version-document-store.ts，共同身份与 read/save 类型位于 src/shared/workbench/version-document.ts。它只接受明确版本，读取不存在材料无副作用，修订按原始字节计算；复用 proper-lockfile 和 Orca durable-file-write。计划/验收结构由 shared/workbench/version-material.ts 校验，共同层验证 schema/version/cycleId。schema2 只报告需显式迁移；不做自动升级。

材料服务通过 BW 的 main/workbench/version-material-runtime 组合适配，使用 Orca 原生 runtime RPC、项目/工作树解析及 SSH relay。页面 nativeVersionMaterialPort 按原生 worktree 的 hostId 和 runtimeOwnerEnvironmentId 路由，配对客户端与执行宿主分开处理；CLI 沿用选中的 runtime，不因 isRemote 禁用。workbench.materials.list/read/save 与 orca bw materials 共用校验；请求只传身份，文件根由原生登记解析。文件所属宿主运行同一材料事务，核对 Git common directory 与实际固定分支，并在文档锁内重查。WSL 元数据路径复用原生转换。list 无写入副作用，不默认选版本。

流程选版是原生 worktree 偏好 `workbenchSelectedVersion`（main/workbench/version-selection.ts）：context 只读、select 只写偏好，CLI `ORCA bw materials context/select` 与 UI 共享同一偏好；无 session→version 永久映射，历史会话切换只换左侧聊天，不自动切右侧材料。跨周有限场景：同版本计划/验收各只一轮活动材料，归档后由人明确开下一轮。

计划/验收屏与 CLI 均已消费这些入口，旧 Plan 页面和旧开工提示已删除。材料校验只证明结构及写入一致性，不能证明引用的脚本读数真实、计划已合入或记录中的人已认可；对应特性必须从真实来源读回后推导状态。外部 Git 操作不受材料锁控制，提交前的分支复核不等同于锁住所有 Git checkout。

schema2 通过一次显式迁移转为新计划；原文件/提交保留来源，旧 results 导入验收草稿并记录其实际归属版本，旧 confirmation 只作历史证据，不生成新认可。所有消费者与写入者一起切换；不做永久双写或遇错静默退回旧界面。迁移失败保留原件并报告。

通用 SYSTEM 同时服务有关联 Issue 与无 Issue 的原生项目任务；宿主为真实引用渲染 Issue 上下文；创建、改写与计划补充的格式见 [Issue 格式](../../../standard/system-prompt/references/issue-state.md)。指标配置加载 metrics-refresh，不自动加载 week-planning。开工提示由 `version-cycle/cycle-prompt.ts` 渲染 bundled SYSTEM.md.tmpl 并内嵌对应 Skill 发现 Stub（指南与 references 经 `ORCA skills get` 按需读取）；占位符未解析即抛错，不会把占位符当实际身份递交。

## 会话、任务导航与自动化

计划固定 bw/week-plan，验收固定 bw/week-acceptance，各复用一棵 Orca 登记工作树。项目未设置基址时先写入项目级 .bw/worktrees 并提示，用户已有设置保留；原生创建与默认分支规则不变。入口准备工作区后切到 terminal；进屏不触发任何 Git 动作。「更新代码」经 workbench.trunk.update 走三指令：解析基线（钉值 worktreeBaseRef 或主检出当前分支，不猜名）、fetch 书签、双向 rev-list 对比、merge --ff-only；本地宿主在 owner runtime 执行，快进复用原生工作树操作锁与 Git 读缓存失效。更新状态按项目、宿主、流程与固定树隔离，同树在途请求去重；执行中材料只读、计划自动保存暂停，完成后经现有读写接口重读材料与候选（无论快进成败都重读），脏草稿仍由 CAS 控制器保留并提示冲突。完成回调只刷新材料，不重选工作区或会话。快进不了（分叉、主检出有本地改动、分支失配、远端不可达）保持原样不换数据源，统一中文提示交会话处理；固定树纯草稿状态（有未合入提交、主干没前进）不是异常、不提示；远程 SSH 树暂不自动同步，属只读中继边界。看板与会话始终使用同一工作树的文件。切树离开即卸下对应业务板，不持续纠正原生选择。材料身份按项目、宿主、流程和固定树解析。版本仍由人明确选择，不跟会话标题或日期联动，绑定树直接采用绑定版本，旧无绑定树沿明确选版偏好，不自动开轮。

计划与验收完整复用 Orca 原生会话工作区：顶部新建会话和 Agent 控件、标签/分屏、资源管理器、智能体历史、工具侧栏及原生滚动。BW 的开始按钮仅在未开始短卡；成功后四区共用当前原生会话，不另建聊天、历史或会话绑定。

“开始计划／验收”手动运行对应已登记自动化，启动前将条目的工具保存为 BW 当前默认智能体，再使用用户保存的提示、模型与复用设置；只有实际打开并聚焦原生运行会话才返回成功，失败保留短卡与真实提示。定时运行仍在后台；普通新建会话不自动注入 BW Skill。自动化首次登记与配置沿现有原生链，身份含明确版本，人的设置保留。

自动化运行与历史恢复继续打开原生 terminal；识别当前固定树后自然显示右板，不再保存 BW run/session 恢复映射。native-session 只读取当前聚焦的结构化会话或终端叶子，并在插入业务草稿前复核宿主、工作树和焦点；不创建布局、选择历史或恢复聊天。

旧格式或损坏材料的问题随短卡启动的一次性上下文递交，不额外渲染文件问题列表或迁移入口；助手说明方案，经人确认才转换材料，点击开始不等于同意修改数据。其他版本异常不阻塞当前有效版本。

执行呈现只有原生会话与 BW 双栏两类：指标配置和普通任务执行用原生会话；版本计划/验收用原生会话加对应业务 UI。总览是查看、刷新和进入上述工作的汇总入口，不另立第三条执行流程。配置指标是手动原生任务，细节见指标设计。

TaskOrigin 携带项目、页面、版本、目标筛选、滚动和草稿引用。利用原导航历史返回，正文保存仍走原生权限与 mutation/cache；状态刷新不触发完成。项目切换和任务里进一步跳转后仍按有效来源恢复，来源已失效时给明确返回入口，不悄悄落回错误版本。

## 阶段状态、归档与纪要确认

会议纪要由计划助手基于批注与可选转写整理共识/遗留，只有未确认正文可写；人工确认与撤销沿原机制。归档前遗留逐项已落实或关联真实跟进 Issue，由助手核对、PR 人审，无逐项 closed 控件或界面硬门禁；历史 closed 原值保留。人的评审决定仍在会话中表达，模型再记录 workflow.stage，不从纪要状态推定评审完成。

两屏界面都不渲染旅程灯：`workflow.stage` 仍是模型经 CLI 写入的进度信号，但只供会话校准与自动化消费；计划屏顶部导航与验收屏四区导航都只做同页定位，点击、浏览与批注不标记任何阶段。stage 是进度信号不是完成权威，不代表目标达成或 PR 已合入；内容实质调整由模型在会话中回退 stage。原先「灯位不超过 stage 为绿、否则灰」的序号比较派生已随两屏灯退役删除（`workflowStageIndex` 不再有生产消费方）。

归档在会话中发起：模型写 `stage=archive` → 按项目门禁提 PR → 把 provider/repository/number 写入 `workflow.archivePr`。计划屏归档卡（PlanningArchiveCard）显示 PR 引用与真实合入状态，「打开原生 PR 页」经 open-archive-pr.ts 复用 resolveReferenceRepo → lookupGitHubWorkItemForSource(type:'pr') / CodeHub viewTask(kind:'mr') → openTaskPage(returnToPreviousView) 链；验收屏由自己的 AcceptanceArchiveCard(v10 拷贝独立件,原共用 CycleArchive.tsx 已删除)渲染同形引用与状态行。状态按 archivePr 经 `workbench.archive.prStatus` 薄读取（merged/open/closed，一次 `pulls/{n}` 读取；非 GitHub 或读不到保持 unknown），进屏、材料刷新、手动刷新与窗口聚焦（节流）触发重读。原字节级合入证明、按分支名探测 PR、changed/unknown 状态机与贴草稿按钮通道（归档/拆解/未达跟进及等待框）已整体删除，不留双路径。

## 总览中的版本记录

计划和验收各提供材料到纪要及摘要的读取，不能分别维护总结副本；共享 VersionHistoryPort 按 version-records 的 cycleId/提交身份读取多周、同周修订及草稿。集成层在 OverviewPage 沿 main 保留版本页签与双栏内容区（use-version-minutes.ts：归档 history.read 优先、当前选版回落 live 材料）：切换版本即回填计划摘要和验收摘要；计划列直接渲染材料存储的 minutes 两块（共识/遗留正文与确认态，旧闭环字段只作历史兼容），无存储纪要的历史版本如实显示「纪要未记录」，不再由目标派生模板冒充；验收列仍由固定材料派生（buildAcceptanceReport 链不动）。同版本多周在原处选择，全文页内展开，可打开只读来源或返回相应屏，不再用历史弹窗。缺记录保持空，旧进展/提交不代替验收，旧材料不推造日期和认可。v0.5 不新增里程碑模型或扩改总览其余区域。源码候选、材料归档提交和运行周期是不同身份。

## 验证与实现代价

核心 TDD：目标到纪要、修订冲突、来源隔离、内容改变后旧归档失效、运行键/自动化去重、返回上下文。集成复用原生 Tasks 与 Automations 用例，不复制它们全套测试。spec 的 P01–P10 和 PJ01/PJ02 在实现时登记目标平台 E2E，结果进 STATUS。

主要代价曾是旧 schema/CLI/提示/页面的原子切换，本轮已同次完成退役；普通项目的技能分发经产品内置投影覆盖，不依赖项目自带 standard/。执行顺序与并行文件所有权在仓外计划；先冻结共享契约再分三条特性线，不让各线分别造存储和会话适配。
