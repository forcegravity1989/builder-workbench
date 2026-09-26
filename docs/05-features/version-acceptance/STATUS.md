# 版本验收 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为 bw-orca 的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。窗口须交接已测/未测、运行入口与候选提交；基础验证不代表后两环已齐。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| intent | ● 已确认 | 设计 PR #264 已合入，用户授权按三特性边界实施 |
| spec | ● 实施输入 | v8 高保真与规格已合入；新增或拿不准的行为仍逐项找用户确认 |
| 实现设计 | ◐ 部分 | 设计主体已按当前接线落地，取舍差异回写 design；详细设计仍未逐项细审，未决项必须人工确认 |
| TDD | ◐ 部分 | 单测/组件测试全绿（渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项；三套 tsc 0 错）。验收业务覆盖目标证据、同源码换候选包、候选来源边界、Issue 快照报告及交互、切版本保留新输入、报告保留真实计划读取时间、计划来源失败与三阶段分别推导信号、指标日期边界及读回证据优先于旧缓存；归档判定覆盖脏草稿不绕过已确认归档、provider 合入提交树内字节核对（FF/rebase 多提交不漏记）。候选 RPC 为替身，页面交互为 DOM 环境，不能代表真实宿主、provider 或 Electron 旅程 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 含验收树创建与总览读回，已编写，执行结果见 PR；A01–A10 完整验收点尚未逐项运行 |
| 用户旅程 E2E | ○ 缺 | AJ01/AJ02 已定义；真实出包/验证、模型会话、provider 归档全链、自动化到点与重启核对未运行 |

[第八版高保真评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip) 及包内浏览器检查只证明原型交互，未接远端写回/真实采集/自动化。下载评审包后解压打开 index.html，侧栏切换三屏；需具有同仓访问权限。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

验收已接入生产入口：侧栏「验收」独立入口与计划共用 artifacts 槽的 `version-cycle/CycleWorkspaceShell.tsx`（`cycle-view-state.ts` 区分子视图），进入即确保 bw/week-acceptance 固定工作树并正式选择；左侧当前会话 + 固定树历史（精确身份恢复），右侧 `version-acceptance/AcceptancePage`。归档状态按材料身份（workflow/version/cycleId/revision）自动读取：首读未决短暂禁编辑，失败如实 Unknown 不锁死；archived 判定不受 dirty 影响，脏草稿不能绕过已确认归档，界面提供「放弃本地修改，重读宿主材料」。归档证明为 provider 真实合入提交在采用基线上且合入提交树内材料字节等于修订；CodeHub 无真实合入证据一律 Unknown，正文编辑延期。目标卡交付件可直接打开（URL 走系统浏览器、路径走原生打开、凭据链接拒绝）；Issue 摘要为真实状态分布加快照时间，未知不显示 0/0。旧 results/confirmation 只能作为带来源的历史输入，不能自动升级为新验收认可。

未验证项如实保留：真壳烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 已编写（含验收树与总览读回），执行结果见 PR；真实出包/验证入口、CodeHub Issue 正文编辑及返回验收版本、SSH/WSL 与配对宿主、真实到点自动化、真实 provider 归档全链均未运行。仓外组件示例不计为 E2E，完整旅程后续统一调度。

2026-09-25 已完成实际组件的仓外示例数据视觉核对：按 v8 对齐紧凑目标卡，在约 920px 右栏宽度下展示三项目标与 Issue 汇总。该检查没有连接 Electron、原生会话、采集脚本或真实 provider，不能计为验收点 E2E。完整旅程与真实到点触发仍按本轮分工留待后续协调验证。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

本轮设计/文档及仓外计划经过独立 subagent 初审与复审，发现项已修正；[任务评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。这是静态制品评审，不替代实施后的独立代码/行为 Review，不替代尚未逐项确认的详细设计决定。
