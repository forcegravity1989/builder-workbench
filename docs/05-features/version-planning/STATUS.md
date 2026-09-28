# 版本计划 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为 bw-orca 的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。2026-09-25 用户调整为优先提交各线 PR，允许难协调的接线遗留。本轮统一收尾已把计划业务接入生产入口并退役旧三屏链条，基础 Electron E2E 仍未全部完成，不代表后两环已齐。

当前会话边界按用户确认改为完整原生工作区复用，原型同步表达复用范围和紧凑数据问题提示。CycleChat、专用历史嵌入、sessionStorage 会话绑定及迁移弹窗已移除；新建计划/验收走现有自动化，数据问题新建会话并自动递交，归档只插入当前原生 composer 草稿。右侧业务板其余样式/布局仍待逐项对照原型。本次按用户要求先做代码与静态验证，未启动 Electron；此前烟测及类型检查不能作为新接线通过的证据，最新结果与资源限制见交付 PR。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| intent | ● 已确认 | 设计 PR #264 已合入，用户授权按三特性边界实施 |
| spec | ● 实施输入 | v8 高保真与规格已合入；新增或拿不准的行为仍逐项找用户确认 |
| 实现设计 | ◐ 部分 | 设计主体已按当前接线落地，取舍差异回写 design；详细设计仍未逐项细审，未决项必须人工确认 |
| TDD | ◐ 部分 | 以下为 PR #272 前历史证据，不含当前会话复用接线：单测/组件测试全绿：渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项，另有 store、launch/settings/hooks 等；三套 tsc 0 错；RPC catalog/投影/manifest 校验绿。覆盖材料事务、CAS 读写、显式迁移、草稿冲突和恢复、派生纪要、流程选版与会话绑定。真实 Git 工作树与文件在测试内创建；SSH/会话/provider 端口使用测试替身，不能视为真实远端与 Electron 旅程 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts`（固定树创建→选版→保存→磁盘读回→重载恢复→验收树→总览）已编写，执行结果见 PR；P01–P10 完整验收点尚未逐项运行 |
| 用户旅程 E2E | ○ 缺 | PJ01/PJ02 已定义；真实模型会话、provider 归档全链、自动化到点与重启独立读回未运行 |

[第八版交互原型](prototype.html) 是本特性的独立入口，源自 v8，当前会话边界随规格更新；三屏界面源码各归所属特性，共用资源仅保留一份；来源、离线使用与[原始评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip) 的区别见 [spec](spec.md)。原型与包内浏览器检查只证明交互演示，未接远端写回/真实采集/自动化，不表示能力已交付。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

当前入口：artifacts 只准备固定树；正式选择后转到 terminal，在原生会话工作区旁挂 PlanningBoard。旧三屏计划链与 planning.py、version-plan.html、data-template.json 已退役删除；历史评论修复协议保留。

进入计划屏确保 bw/week-plan；原生会话、历史和工具直接复用。流程选版仍存 workbenchSelectedVersion，UI 与材料 CLI 共享；会话切换不改变选版。Tasks 返回依赖原生工作区历史，目标筛选和滚动由 view-memory 保留。

未验证项如实保留：真壳烟测已编写，执行结果见 PR；SSH/WSL、配对宿主、真实到点自动化、真实 provider 归档全链未验证。归档状态按材料身份自动读取，归档证明要求 provider 真实合入提交在采用基线上且合入提交树内材料字节与修订一致；CodeHub 无真实合入证据一律 Unknown，正文编辑延期。跨周有限场景按 spec：同版本计划/验收各只一轮活动材料，归档后由人明确开下一轮。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

本轮设计/文档及仓外计划经过独立 subagent 初审与复审，发现项已修正；[任务评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。这是静态制品评审，不替代实施后的独立代码/行为 Review，不替代尚未逐项确认的详细设计决定。

## 验收点与旅程矩阵

> 本节是上方六环表环 5/环 6 的逐点明细，不替代六环表。口径：✅ = 已实现且有自动化/真壳证据（单测/组件测试/真壳 Playwright 烟测）；◐ = 主行为已实现，关键路径待真人体验或需远端环境（SSH/真实 PR/真实 provider）；○ = 未实现（如实标注，不冒充）。本表自仓外过程稿 feature-matrix-20260926.md 并入仓内落为正文明细，此后改动随引发它的 PR 同批提交，不记流水；特性级总览见 [../README.md](../README.md)。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| P01 计划单页、完整 SOP、一屏核心、无独立旅程滚动 | ◐ | 原生工作区旁的 PlanningBoard | 新布局未做真壳检查；用户指出样式/密度与原型有差距，待伴飞收敛 |
| P02 场外要求进目标、三情形交流引导、不强制填齐 | ◐ | Skill references（goal-guidance）+ 计划单页可选字段 | 模型会话交互待人体验 |
| P03 指标与总览同定义/窗口/来源；刷新/失败/未知/旧值区分 | ✅ | use-plan-metrics + metrics runtime（4709ba8b2）+ MetricEvidenceView 文案修正 | 单测+runtime 测试；真实脚本全链待人/环境 |
| P04 纪要三段模板派生、复制一致、不补造事实 | ✅ | derivePlanMinutes + PlanningMinutes 复制 | plan-summary 测试 |
| P05 Issue 创建/复用真实回显；详情编辑返回保留上下文 | ◐ | task-port + 原生 returnToPreviousView 跳过哨兵（528dce0f8） | ui-page-navigation 测试；真实 provider 往返待人 |
| P06 分树、全部原生会话复用、专用新建与数据处理入口 | ◐ | CycleWorkspaceProvider + 原生 Terminal/TabBar/RightSidebar | 焦点、宿主隔离及请求递交有替身测试；多标签/分屏/历史与空会话首次处理待真壳验证 |
| P07 自动化登记去重、保留设置、真实到点可追溯 | ◐ | 默认关闭态注册（ensure-cycle-automation：creationKey 去重、只创建不更新、人启用才到点）+「配置自动化」预填/编辑入口 | 真实到点与跨重启去重待人启用后验证 |
| P08 并发保存冲突处理；重启/切项目/切版本读回一致 | ✅ | CAS expectedRevision+冲突 UI+view-memory | material-draft 测试+烟测重载读回 |
| P09 归档只准备会话请求；PR 真实状态定灯色 | ◐ | archivePort.prepareRequest→composer；archive 状态自动读取+灯色语义；archive-label 呈现请求修改与检查失败 | archive-port/board-state/archive-label 测试；新原生焦点接线、真实 PR 状态与归档请求仍待真壳及 provider 旅程验证 |
| P10 总览按版本/多周/固定修订读摘要；往返保草稿；坏历史不伪造 | ◐ | use-version-minutes+OverviewPage 双栏+problems 列表 | 组件级+烟测总览；多周真实归档回看待人 |

| 旅程 | 状态 | 覆盖 |
|---|---|---|
| PJ01 计划周流程（开会话→明确版本→目标→纪要→拆解→归档请求） | ◐ | 烟测覆盖到「保存+读回+重载」；会话模型交互/归档请求发送待人 |
| PJ02 周中执行与返回（Tasks 详情往返、筛选滚动保留） | ◐ | 导航/恢复单测；真人往返待人 |
