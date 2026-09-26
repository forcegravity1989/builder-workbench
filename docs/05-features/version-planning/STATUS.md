# 版本计划 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为 bw-orca 的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。2026-09-25 用户调整为优先提交各线 PR，允许难协调的接线遗留。本轮统一收尾已把计划业务接入生产入口并退役旧三屏链条，基础 Electron E2E 仍未全部完成，不代表后两环已齐。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| intent | ● 已确认 | 设计 PR #264 已合入，用户授权按三特性边界实施 |
| spec | ● 实施输入 | v8 高保真与规格已合入；新增或拿不准的行为仍逐项找用户确认 |
| 实现设计 | ◐ 部分 | 设计主体已按当前接线落地，取舍差异回写 design；详细设计仍未逐项细审，未决项必须人工确认 |
| TDD | ◐ 部分 | 单测/组件测试全绿：渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项，另有 store、launch/settings/hooks 等；三套 tsc 0 错；RPC catalog/投影/manifest 校验绿。覆盖材料事务、CAS 读写、显式迁移、草稿冲突和恢复、派生纪要、流程选版与会话绑定。真实 Git 工作树与文件在测试内创建；SSH/会话/provider 端口使用测试替身，不能视为真实远端与 Electron 旅程 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts`（固定树创建→选版→保存→磁盘读回→重载恢复→验收树→总览）已编写，执行结果见 PR；P01–P10 完整验收点尚未逐项运行 |
| 用户旅程 E2E | ○ 缺 | PJ01/PJ02 已定义；真实模型会话、provider 归档全链、自动化到点与重启独立读回未运行 |

[第八版高保真评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip) 及包内浏览器检查只证明原型交互，未接远端写回/真实采集/自动化。下载评审包后解压打开 index.html，侧栏切换三屏；需具有同仓访问权限。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

生产入口已切换：AppWorkspaceShell 的 artifacts 槽挂 `workbench/CycleWorkspacePage.tsx` → `version-cycle/CycleWorkspaceShell.tsx`（计划/验收共用容器，`cycle-view-state.ts` 区分子视图，侧栏「计划」「验收」独立入口）。旧三屏计划链（PlanJourneyShell / PlanWeekBoard / PlanWeekPlanChat / plan-week-* / workbench-plan.css / overview-demo-data.ts）已全部删除；standard/ 的 planning.py、version-plan.html、data-template.json 与会议 reference 在消费方切换的同一交付内退役删除，check-week-comment.py 与 week-plan-comment.md 保留作历史评论修复协议。

进入计划屏即确保 bw/week-plan 固定工作树并正式选择；左侧当前会话 + 固定树历史面板（精确身份恢复，不按标题猜），右侧 PlanningBoard 单页。开工注入渲染后的 SYSTEM 与 week-planning Skill（`version-cycle/cycle-prompt.ts`），工具按本机 agent 检测选择，不写死 Claude。「配置自动化」预填原生自动化编辑器（existing 固定树、reuseSession=false，prompt 不含 cycleId），启用与时间由人确认。流程选版存原生工作树偏好 `workbenchSelectedVersion`，UI 与 `ORCA bw materials context/select` CLI 共享；历史会话切换只换左侧聊天，不自动切右侧材料。Tasks 往返：会话绑定与目标筛选/滚动存 sessionStorage 重挂复活；任务详情返回经原生 openTaskPage 的 returnToPreviousView / returnOrigin 保留来源。

未验证项如实保留：真壳烟测已编写，执行结果见 PR；SSH/WSL、配对宿主、真实到点自动化、真实 provider 归档全链未验证。归档状态按材料身份自动读取，归档证明要求 provider 真实合入提交在采用基线上且合入提交树内材料字节与修订一致；CodeHub 无真实合入证据一律 Unknown，正文编辑延期。跨周有限场景按 spec：同版本计划/验收各只一轮活动材料，归档后由人明确开下一轮。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

本轮设计/文档及仓外计划经过独立 subagent 初审与复审，发现项已修正；[任务评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。这是静态制品评审，不替代实施后的独立代码/行为 Review，不替代尚未逐项确认的详细设计决定。
