# 版本计划 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为主干 main（原 bw-orca，2026-09-30 扶正）的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

用户已确认本轮高保真并要求提交特性资产：计划与验收统一在右板首行提供协作卡片、“配置自动化”与启动按钮，原生标签栏不增加 BW 按钮；分支名移至页头，异常文件随同一启动入口带入会话。原型说明、首次/异常场景选择集中到页面末尾并明确不进入最终界面。该入口迁移已在 PR #279 实施：CycleStartCard 落地两屏首行，tab-bar-surface 的 CycleStartButton 薄挂载与 startMaterialRequest 独立通道已退役删除；数据问题上下文经 automation.runNow 的可选 oneShotPrompt 随保存提示单次合并递交（capability 门控）。组件/契约测试与静态检查通过，真壳未运行，不能视为真壳验证通过。

2026-09-30 PR #283 返工批（用户在返工会话逐项拍板）：①「配置自动化」从卡片首行移至右板页头分支名旁（一次性配置不占每周主操作区），卡片只留启动入口；②登记语义改为覆盖同步——已有条目按当前 BW 版本刷新 BW 所有的提示词，用户所有设置（开关/时间/模型/复用）保留，同步失败如实提示不阻断；③手动启动保持 runNow 直接递交（曾一度被 #283 改为新会话草稿递交，经用户核对属无依据变更，已恢复）；④两屏进屏先把采用分支最新拉进固定分支（workbench.cycle.syncTrunk），失败/冲突如实提示、不阻断、不换数据源；⑤计划屏顶部指标报错面板与归档旁评审状态文本移除（#283 体验修复，经用户确认保留；归档灯与逐指标未知态仍在）。

指标窗口确认的历史脚本限制、每次配置新建会话和“对话气泡＋”图标已同步本屏原型与规格；生产指标接线已随 [PR #278](https://github.com/forcegravity1989/builder-workbench/pull/278) 合入，本线不重复实施。原型配置会话仍为内存演示，不作为采集或模型注入通过的证据。

已明确的旅程：Builder 制定目标后与 PL 评审并现场修改目标，纪要预览/复制服务评审后的填写整理，通常在任务拆解与 PR 合入后，也允许在拆解前；复制不代表评审通过。对应 intent/spec/design 与 week-planning 已同步。生产计划板已采用进展/风险共卡片、目标直接编辑、可选多指标；该轮的任务标题栏拆解按钮与一行归档入口已于 2026-10-13 收敛批随贴草稿通道退役（见该轮记录），归档卡片改为只读状态行；上版验收在进展卡片内，预览纪要在目标标题旁。未选版本保留同一布局，各区为空且不写材料；下拉明确选版，旅程轴只滚动定位。目标补充弹窗及常规保存栏已移除，计划样式限定本屏。整体结构已接线，实际视觉密度、键盘/缩放和原生双栏效果仍待真壳验证。

（2026-09 批轮次记录；进屏后台同步已被 2026-10-14 #355 批废止，见下方该轮记录）进入计划／验收工作区已改为先回显、后台调用原有主干同步；同步期间材料只读，计划自动保存暂停，结束后重读材料与候选。复用在途请求并隔离宿主，完成不重选会话。用户已确认本次使用方式；未新增测试用例，提交证据随伴飞修复分支，真实进屏速度及同步失败体验由用户回验。

直接编辑已接自动保存，复用原材料控制器与 CAS；连续写入串行处理，切版先等待当前修改落盘。冲突和写入错误停止自动写入并保留输入，明确处理后才继续；归档不锁定编辑，两屏共用自动保存、任务列表和归档状态行；旅程灯只读 workflow.stage（2026-10-13 收敛批起，原请求等待框与合入证明驱动已随按钮退役）。相关自动保存与冲突接线的检查结果见各轮交付 PR，历史烟测不能替代新路径的重启与模型并发证据。

版本进展已增加可选固定验收来源；PlanningProgressSource 提供明确选源、固定修订纪要和原始材料只读查看，不覆盖已有进展。schema 兼容、明确选择、修订失配和跨项目异步隔离的 4 项组件/契约测试通过；真实归档来源读取与模型整理进展仍待真壳及会话验证。原型快照、模拟 DOM 与静态检查只证明相应制品，不替代真人浏览器验看和真壳证据。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。2026-09-25 用户调整为优先提交各线 PR，允许难协调的接线遗留。本轮统一收尾已把计划业务接入生产入口并退役旧三屏链条，基础 Electron E2E 仍未全部完成，不代表后两环已齐。

当前会话边界按用户确认改为完整原生工作区复用，原型同步表达复用范围和紧凑数据问题提示。CycleChat、专用历史嵌入、sessionStorage 会话绑定及迁移弹窗已移除；新建计划/验收走现有自动化，数据问题当时经独立新建会话自动递交（该通道后由 #279 的 oneShotPrompt 单次递交替代），归档把未发送请求贴进左半屏当前显示的终端会话。计划右板已按认可结构调整，最终视觉与交互仍需结合实际数据逐项验看。上述为此前 [PR #275](https://github.com/forcegravity1989/builder-workbench/pull/275) 的会话复用实施，验证范围与资源限制见该 PR；历史烟测及类型检查不能作为本轮新入口通过的证据。

2026-10-13 Issue #333 收敛批（用户在对齐会话逐项拍板，台账见交付 PR）：旅程灯改为只读材料 `workflow.stage`——模型每完成一阶段经 CLI 写入（准备/目标/评审/拆解/归档），灯为灰/绿两态位置比较（shared/version-workflow），恢复会话时由模型校准 stage。旧推导整体删除：评审灯写死、内容计数灯、归档字节证明链（version-archive、archive-evidence*、archive-current-material、archive-source-gap、version-history-archive-check、use-material-archive、archive-port）与按分支名猜 PR。归档/拆解按钮删除，贴草稿通道整体退役（CycleSessionPort、native-session 贴草稿链、use-cycle-request 等待框）；归档卡片改只读状态行，按模型写入的 `workflow.archivePr` 经新 RPC `workbench.archive.prStatus` 薄读取 PR 合入状态（进屏/材料刷新/手动刷新/聚焦节流重读，读不到保持未知）。进展区在有 progressSource 时内联回显派生只读纪要（use-progress-minutes，读取失败如实提示不回退）；「上版验收」按钮保留。`summary.risks` 纳入人工守卫（模型通道写入被拒），UI 标明风险仅由用户填写。schema2 兼容报错中文化、启动卡补迁移行动路径。历史服务全量 list 改为按版本/流程/cycleId 各列最新一条，取消 draft 过滤与 archive-unverified（选源读取时仍按固定修订核对身份）。week-planning / version-acceptance SKILL 与 version-records 契约同步重写（阶段写入纪律、archivePr、risks 守卫、文本周整、评审后同步 Issue 标题标记与标签），bundled guides 与 RPC catalog 已重新生成。证据：workbench vitest 41 文件 229 例全绿（ratchet 基线 257→229 收紧）、typecheck 0 错、bundled-skill-guides / skill-bundle-manifest / rpc-params-catalog verify 绿；真壳未运行——两屏灯、状态行、进展回显与守卫的真实模型旅程待用户实机验证，模型是否按 SKILL 稳定写 stage 待真实会话取证。

2026-10-13 真壳验证反馈批（同日第二批，用户实机验证后逐项提出）：①「上版验收」按钮从选源弹窗改为直接跳转验收屏（PlanningProgressSource 组件删除；更丰富视图在验收屏，改源归会话由模型写 progressSource），进展区保持内联回显派生纪要，来源行不再显示提交哈希。②验收纪要（deriveAcceptanceReport）与总览验收摘要改为人话正文——周期、材料修订、固定提交、定义指纹、采集元数据等技术标识全部移出纪要（留材料与 Git 追溯），验收 spec A08 判据同步。③存量材料补写 workflow：v0.4/v0.5/v0.6 计划与 v0.5 验收补 stage=archive；archivePr 仅填可查证者——v0.6 计划 #335（归档提交语明示）、v0.5 计划 #294、v0.5 验收 #326（承载当前字节进 main 的首个合并 PR，ancestry-path 查证），v0.4 无干净 PR 证据只补 stage 不编造。④week-planning references/data-and-runtime.md 新增「补写阶段状态（存量材料升级）」节：会话进入或恢复时发现材料缺 workflow 节即按实际进度补写，被管项目存量灯自愈，不需逐文件手工修。⑤CycleArchive 已归档但无 PR 记录的文案改「已归档；PR 链接未记录」。证据：workbench vitest 41 文件 229 例全绿、typecheck 0 错、bundled guides/manifest 重生成并通过 verify；真壳复验待用户执行。

2026-10-14 Issue #355 同步统一批（用户在对齐会话逐项拍板，正本文案见 #355 plan §0）：进屏自动 gitPull 废止——计划/验收屏进屏零 Git 动作、不挂同步提示；页头按钮改「更新代码」并成为唯一同步入口，经新 RPC `workbench.trunk.update`：基线解析（钉值 `worktreeBaseRef` 或主检出当前分支，不再猜 main/master）→ fetch 书签 → 双向 rev-list 对比 → `merge --ff-only`。快进不了（分叉、主检出有本地改动、分支失配、远端不可达）保持原样，统一一句话提示请会话模型处理该分支的代码更新，材料仍照常重读并保留未保存输入；纯草稿状态（树有未合入提交、主干没前进）不是异常、不提示。旧机制同批删除：`trunkPullTarget`、BW 对 `gitPull` 的消费、`resolveAdoptedBaseline` 名字探针、cycle-sync-runtime/port 与旧 syncTrunk 契约。week-planning references 与 version-records 的「刷新数据」协议句改写为「更新代码」新语义。证据：workbench vitest 全绿 226 例（ratchet 基线 228→226：删 trunkPullTarget 4 例、旧基线解析 3 例、configuration-not-adopted 1 例，增基线解析 3 例、同步决策 3 例，指标采用 fetch 1 例原位改写为无 fetch 语义）、typecheck 0 错、rpc-catalog / bundled-skill-guides / skill-bundle-manifest verify 绿；真壳未运行（用户明示本轮不做启动验证）——按钮快进、拒绝提示与「验收合入后计划屏一次更新可见」跨屏场景待用户实机验证。

2026-10-18 目标卡骨架统一批（已确认，主体在验收特性，本特性无生产代码改动）：计划屏与验收屏统一为同一套目标卡语言——整卡收缩（收起=结论行：状态灯、目标句、关联 Issue 完成数；展开=目标句/交付件/验收标准/指标承诺/计划完成与负责人/关联 Issue 分组子块与「在会话中拆解」入口）；计划完成与负责人写入计划材料既有 deadline/owner 字段，验收屏只读展示；拆解创建或更新的 Issue 逐条打 bug/feature 分类标签（已立项，随实施批落地）；页面级全部展开/收起，页面不再另设全量任务区；会话栏收折为窄轨两屏共用。条款正本见本篇 spec「右侧只有一页」段与[验收规格](../version-acceptance/spec.md)；形态经用户四轮浏览器走查于 2026-10-18 确认（认可来源明细见[验收 STATUS](../version-acceptance/STATUS.md) 同日批次记录）。生产未实施：共用目标卡组件抽取、字段接线与全量任务区退役随实施批。验证：build.cjs --check 三屏启动通过、runtime 与源码一致。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| intent | ● 已确认 | 沿用三特性边界，用户确认本轮计划/验收共用协作入口与资产同步 |
| spec | ● 实施输入 | 已确认行为是实施输入（新入口已按该高保真实施，组件/契约测试为上限，真壳未验）；目标卡骨架统一 2026-10-18 经用户确认，生产未实施 |
| 实现设计 | ◐ 部分 | 设计主体已按当前接线落地，取舍差异回写 design；详细设计仍未逐项细审，未决项必须人工确认 |
| TDD | ◐ 部分 | 以下为 PR #272 前历史证据，不含当前会话复用接线：单测/组件测试全绿：渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项，另有 store、launch/settings/hooks 等；三套 tsc 0 错；RPC catalog/投影/manifest 校验绿。覆盖材料事务、CAS 读写、显式迁移、草稿冲突和恢复、派生纪要、流程选版与会话绑定。真实 Git 工作树与文件在测试内创建；SSH/会话/provider 端口使用测试替身，不能视为真实远端与 Electron 旅程。本轮（#279）新增证据：协作卡片入口、one-shot 转发/门控/派发载荷与既有 8 项计划板测试全绿；tsc 因本机内存限制未能运行，缺口如实记入 PR。2026-09-30 返工批证据：ensure 覆盖同步 3 例、trunkPullTarget 解析 3 例、历史服务（自有分支 treePlans/归档信号化/白名单扩展）真实 Git 仓测试全绿、开轮门控 3 例；受触测试文件 vitest 全过；tsc 仍因本机内存未能运行，如实记录 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts`（固定树创建→选版→保存→磁盘读回→重载恢复→验收树→总览）已编写，执行结果见 PR；P01–P10 完整验收点尚未逐项运行 |
| 用户旅程 E2E | ○ 缺 | PJ01/PJ02 已定义；真实模型会话、provider 归档全链、自动化到点与重启独立读回未运行 |

[第八版交互原型](prototype.html) 是本特性的独立入口，源自 v8，当前会话边界随规格更新；三屏界面源码各归所属特性，共用资源仅保留一份；来源、离线使用与[原始评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip) 的区别见 [spec](spec.md)。原型与包内浏览器检查只证明交互演示，未接远端写回/真实采集/自动化，不表示能力已交付。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

当前入口：artifacts 只准备固定树；正式选择后转到 terminal，在原生会话工作区旁挂 PlanningBoard。旧三屏计划链与 planning.py、version-plan.html、data-template.json 已退役删除；历史评论修复协议保留。

进入计划屏确保 bw/week-plan；原生会话、历史和工具直接复用。流程选版仍存 workbenchSelectedVersion，UI 与材料 CLI 共享；会话切换不改变选版。Tasks 返回依赖原生工作区历史，目标筛选和滚动由 view-memory 保留。

未验证项如实保留：真壳烟测已编写，执行结果见 PR；SSH/WSL、配对宿主、真实到点自动化、真实 provider 归档全链未验证。旅程灯只读材料 workflow.stage（模型写入，灰/绿两态）；归档 PR 合入状态按材料记录的 archivePr 经 workbench.archive.prStatus 薄读取，只作提醒信号，不阻塞开轮与历史读取。CodeHub 现已复用 codehub-cli 读回 MR 状态并做远端身份校验，异常仍保持未知；真实 CodeHub 项目和界面旅程待验证。远程 SSH 工作树暂不自动同步主干（只读中继边界），记债待专项。跨周有限场景按 spec：同版本计划/验收各只一轮活动材料，下一轮不被未归档阻塞，唯一开轮门是当前轮未保存修改。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

原始 v8 设计曾经过独立 subagent 初审与复审；[历史设计评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。该固定提交记录不覆盖本轮资产；本轮验证见本次 PR，不替代实施后的独立代码/行为 Review 或真实旅程。

## 验收点与旅程矩阵

> 本节是上方六环表环 5/环 6 的逐点明细，不替代六环表。口径：✅ = 已实现且有自动化/真壳证据（单测/组件测试/真壳 Playwright 烟测）；◐ = 主行为已实现，关键路径待真人体验或需远端环境（SSH/真实 PR/真实 provider）；○ = 未实现（如实标注，不冒充）。本表自仓外过程稿 feature-matrix-20260926.md 并入仓内落为正文明细，此后改动随引发它的 PR 同批提交，不记流水；特性级总览见 [../README.md](../README.md)。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| P01 计划单页、完整 SOP、一屏核心、无独立旅程滚动 | ◐ | PlanningBoard 同构空态、目标直编、标题栏动作与 PlanningJourneyNav 页内定位 | 结构与样式已按认可原型接线；常用分辨率、长文本及原生双栏未做真壳检查 |
| P02 场外要求进目标、三情形交流引导、不强制填齐 | ◐ | Skill references（goal-guidance）+ 计划单页可选字段 | 模型会话交互待人体验 |
| P03 指标与总览同定义/窗口/来源；刷新/失败/未知/旧值区分 | ◐ | use-plan-metrics + metrics runtime + PlanGoalMetrics 可选多指标与依据展开 | 既有采集/证据单测与 runtime 测试；新目标行及真实脚本全链待真壳/环境 |
| P04 纪要三段模板派生、复制一致、不补造事实 | ✅ | derivePlanMinutes + PlanningMinutes 复制 | plan-summary 测试 |
| P05 Issue 创建/复用真实回显；详情编辑返回保留上下文 | ◐ | task-port + 原生 returnToPreviousView 跳过哨兵（528dce0f8） | ui-page-navigation 测试；真实 provider 往返待人 |
| P06 分树、全部原生会话复用、专用新建与数据处理入口 | ◐ | CycleWorkspaceProvider + CycleStartCard（首行协作卡片）+ 原生 Terminal/RightSidebar；数据问题随 runNow oneShotPrompt 单次递交 | cycle-start-request 契约测试与 one-shot 转发/登记协议测试通过（2026-09-30 环 4 盘点：CycleStartCard 的 UI 渲染/交互用例已删，卡片行为归验收点 E2E 与真壳）；多标签/分屏/历史与真实手动运行仍待真壳验证 |
| P07 自动化登记去重、BW 提示覆盖同步、用户设置保留、真实到点可追溯 | ◐ | 默认关闭态注册（ensure-cycle-automation：creationKey 去重、已有条目覆盖同步提示词、用户设置保留、人启用才到点）+ 页头「配置自动化」预填/编辑入口 | 去重/覆盖同步/同步失败放行单测；真实到点与跨重启去重待人启用后验证 |
| P08 并发保存冲突处理；重启/切项目/切版本读回一致 | ◐ | useMaterialAutosave + MaterialDraftController CAS + PlanningPersistenceNotice + view-memory | 本轮自动保存检查见 PR；既有控制器测试/烟测不能替代新路径的真实并发及重启读回 |
| P09 归档在会话中发起；旅程灯只读 workflow.stage；状态行按 archivePr 显示真实合入状态 | ◐ | stage 序号比较（shared/version-workflow）+ CycleArchive 只读状态行 + archive-pr-port → workbench.archive.prStatus（薄读取，读不到保持未知）；原 prepareRequest 贴草稿通道与字节证明链已于 2026-10-13 退役删除 | version-workflow 单测；UI 呈现交验收点 E2E 与真壳 Review；模型按 SKILL 写 stage 与真实 PR 状态读取仍待真实会话及 provider 验证 |
| P10 总览按主干基线（主检出）版本目录读摘要；往返保草稿；坏历史不伪造 | ◐ | use-version-minutes+OverviewPage 双栏+problems 列表 | 组件级+烟测总览；多周真实归档回看待人 |

| 旅程 | 状态 | 覆盖 |
|---|---|---|
| PJ01 计划周流程（开会话→明确版本→目标→人评审修改→拆解→归档→纪要输出） | ◐ | 另允许评审后、拆解前复制纪要；历史烟测覆盖保存/读回/重载，新布局、会话模型与真实归档待人 |
| PJ02 周中执行与返回（Tasks 详情往返、筛选滚动保留） | ◐ | 导航/恢复单测；真人往返待人 |
