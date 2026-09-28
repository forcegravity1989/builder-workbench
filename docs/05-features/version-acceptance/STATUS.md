# 版本验收 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为 bw-orca 的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。窗口须交接已测/未测、运行入口与候选提交；基础验证不代表后两环已齐。

当前会话边界按用户确认改为完整原生工作区复用，原型同步表达复用范围和紧凑数据问题提示。CycleChat、专用历史嵌入、sessionStorage 会话绑定及迁移弹窗已移除；新建计划/验收走现有自动化，数据问题新建会话并自动递交，归档只插入当前原生 composer 草稿。右侧业务板其余样式/布局仍待逐项对照原型。本次按用户要求先做代码与静态验证，未启动 Electron；此前烟测及类型检查不能作为新接线通过的证据，最新结果与资源限制见交付 PR。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| intent | ● 已确认 | 设计 PR #264 已合入，用户授权按三特性边界实施 |
| spec | ● 实施输入 | v8 高保真与规格已合入；新增或拿不准的行为仍逐项找用户确认 |
| 实现设计 | ◐ 部分 | 设计主体已按当前接线落地，取舍差异回写 design；详细设计仍未逐项细审，未决项必须人工确认 |
| TDD | ◐ 部分 | 以下为 PR #272 前历史证据，不含当前会话复用接线：单测/组件测试全绿（渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项；三套 tsc 0 错）。验收业务覆盖目标证据、同源码换候选包、候选来源边界、Issue 快照报告及交互、切版本保留新输入、报告保留真实计划读取时间、计划来源失败与三阶段分别推导信号、指标日期边界及读回证据优先于旧缓存；归档判定覆盖脏草稿不绕过已确认归档、provider 合入提交树内字节核对（FF/rebase 多提交不漏记）。候选 RPC 为替身，页面交互为 DOM 环境，不能代表真实宿主、provider 或 Electron 旅程 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 含验收树创建与总览读回，已编写，执行结果见 PR；A01–A10 完整验收点尚未逐项运行 |
| 用户旅程 E2E | ○ 缺 | AJ01/AJ02 已定义；真实出包/验证、模型会话、provider 归档全链、自动化到点与重启核对未运行 |

[第八版交互原型](prototype.html) 是本特性的独立入口；来源与离线使用见[版本计划规格](../version-planning/spec.md)，完整历史附件保留在[原始评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip)。原型与包内浏览器检查只证明交互演示，未接远端写回/真实采集/自动化，不表示能力已交付。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

验收进入时准备固定 bw/week-acceptance 后切到原生 terminal；唯一原生会话工作区旁挂 AcceptancePage，标签/分屏、历史与资源工具复用 Orca。归档状态按材料身份（workflow/version/cycleId/revision）自动读取：首读未决短暂禁编辑，失败如实 Unknown 不锁死；archived 判定不受 dirty 影响，脏草稿不能绕过已确认归档，界面提供「放弃本地修改，重读宿主材料」。归档证明为 provider 真实合入提交在采用基线上且合入提交树内材料字节等于修订；CodeHub 无真实合入证据一律 Unknown，正文编辑延期。目标卡交付件可直接打开（URL 走系统浏览器、路径走原生打开、凭据链接拒绝）；Issue 摘要为真实状态分布加快照时间，未知不显示 0/0。旧 results/confirmation 只能作为带来源的历史输入，不能自动升级为新验收认可。

未验证项如实保留：真壳烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 已编写（含验收树与总览读回），执行结果见 PR；真实出包/验证入口、CodeHub Issue 正文编辑及返回验收版本、SSH/WSL 与配对宿主、真实到点自动化、真实 provider 归档全链均未运行。仓外组件示例不计为 E2E，完整旅程后续统一调度。

2026-09-25 已完成实际组件的仓外示例数据视觉核对：按 v8 对齐紧凑目标卡，在约 920px 右栏宽度下展示三项目标与 Issue 汇总。该检查没有连接 Electron、原生会话、采集脚本或真实 provider，不能计为验收点 E2E。完整旅程与真实到点触发仍按本轮分工留待后续协调验证。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

本轮设计/文档及仓外计划经过独立 subagent 初审与复审，发现项已修正；[任务评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。这是静态制品评审，不替代实施后的独立代码/行为 Review，不替代尚未逐项确认的详细设计决定。

## 验收点与旅程矩阵

> 本节是上方六环表环 5/环 6 的逐点明细，不替代六环表。口径：✅ = 已实现且有自动化/真壳证据（单测/组件测试/真壳 Playwright 烟测）；◐ = 主行为已实现，关键路径待真人体验或需远端环境（SSH/真实 PR/真实 provider）；○ = 未实现（如实标注，不冒充）。本表自仓外过程稿 feature-matrix-20260926.md 并入仓内落为正文明细，此后改动随引发它的 PR 同批提交，不记流水；特性级总览见 [../README.md](../README.md)。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| A01 独立树、完整原生工作区、单页三阶段 | ◐ | CycleWorkspaceProvider + AcceptanceBoard | 新接线未跑真壳；三阶段信息密度和侧栏开合待伴飞 |
| A02 固定计划修订正确、承诺只读；跨树/草案不混淆 | ✅ | planRef 固定+readPlan+useFixedAcceptancePlan 测试 | acceptance 测试 |
| A03 真实入口准备交付；材料可打开绑候选；失败可见不假报 | ◐ | AcceptancePreparation+candidate-port+交付件打开（528dce0f8） | 真实出包旅程待人 |
| A04 脚本实测不可手填、同源；历史/当前区分 | ✅ | metrics runtime+窗口语义+baseline 落盘 | runtime/组件测试 |
| A05 Issue 真实状态可刷新、无拆解入口、关闭数≠达成 | ✅ | AcceptanceTasks 快照分布+灯色守卫 | board-state/acceptance 测试 |
| A06 原生详情编辑后按来源返回、保留版本/会话/草稿 | ◐ | returnToPreviousView+view-memory 与原生工作区恢复 | 导航测试；真实 CodeHub/GitHub 往返待人 |
| A07 同一候选展示、人逐目标判断、未达可保存带入会话 | ✅ | AcceptanceGoalResult decision 流+prepare 文本 | acceptance-interaction 测试；CLI save 通道人工字段守卫代码批在补，此前仅提示级（模型可经 CLI 直写人工字段，无代码拦截） |
| A08 纪要可复制含候选/来源/待核/未达；归档后总览回看 | ◐ | deriveAcceptanceReport+总览双栏 | report 测试；真实归档回看待人 |
| A09 跨树隔离/并发/重启/脏树不丢输入；包证不符不沿完成态 | ◐ | draft recovery+candidate 核对失效逻辑 | 恢复测试；脏树真机待人；脏树/未归档提交检查为提示级（会话承担），无代码落点 |
| A10 原生自动化真实到点、新周期新会话、入口不重复 | ◐ | 默认关闭态注册（creationKey 去重、reuseSession=false、只创建不更新） | 新建验收的手动运行、原生恢复和真实到点均待真壳验证 |

| 旅程 | 状态 | 覆盖 |
|---|---|---|
| 验收旅程（准备交付→showcase→核对→归档→回看，AJ01/AJ02） | ◐ | 组件级全链测试；真人+真实 PR 待人 |
