# 总览指标 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为 bw-orca 的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。窗口须交接已测/未测、运行入口与候选提交；基础验证不代表后两环已齐。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| intent | ● 已确认 | 设计 PR #264 已合入，用户授权按三特性边界实施 |
| spec | ● 实施输入 | v8 高保真与规格已合入；新增或拿不准的行为仍逐项找用户确认 |
| 实现设计 | ◐ 部分 | 指标采用独立固定维护树 bw/metrics-refresh，与计划/验收共用 Orca 原生工作树规则；定义唯一正源 .bw/metrics.toml 固定修订读取，时区/数据根/数据提交经 BW_METRICS_TIMEZONE / DATA_ROOT / DATA_COMMIT 显式传递。该取舍已按本轮实施落地，未逐项经人细审 |
| TDD | ◐ 部分 | 单测/组件测试全绿（渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项；三套 tsc 0 错；RPC catalog/投影/manifest 校验绿）。覆盖共享契约、TOML 定义解析、日/周及夏令时窗口、采集输出校验、刷新去重/失败证据、固定修订历史与归档证明核验；历史用临时真实 Git 仓验证合入快照、多周期及草案失效。采集脚本执行与 SSH 窄执行器为替身或本机路径，真实项目采集未验证 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 含总览读回，已编写，执行结果见 PR；M01–M10 完整验收点尚未逐项运行。M02 存在已实现缺口：完整业务/项目两区、特性关联与引领/滞后展示未实现 |
| 用户旅程 E2E | ○ 缺 | MJ01/MJ02 已定义；真实采集脚本、配置任务会话、归档证据与重启独立复算未运行 |

[第八版高保真评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip) （业务／项目分区，Git/GitHub 真实快照趋势）及包内浏览器检查只证明原型交互，未接远端写回/真实采集/自动化。下载评审包后解压打开 index.html，侧栏切换三屏；需具有同仓访问权限。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

总览已接真实数据：OVERVIEW_DEMO 已删除，OverviewPage 经 nativeMetricsPort 呈现北极星读数（无数据 Unknown、未配置如实），版本页签为真实归档记录与当前选版的并集，页内计划/验收双栏纪要由 `use-version-minutes.ts` 派生（归档 history.read 优先、当前选版回落 live 材料），验收栏含逐目标人工结论、Issue 快照分布与来源提交。指标 runtime 已注册 main RPC：workbench.metrics.list/read/refresh、workbench.history.list/read/readPlan、workbench.archive.proof；SSH 宿主走窄执行器 workbench.history.execute / workbench.metrics.execute，未扩 provider.exec 白名单。采集脚本在隔离 checkout（preparation lock，finally 清理）按 argv 执行；默认窗口「本周截至采集时刻」标真实覆盖，仅实时指标返回当前值；计划采用 baseline 落盘，历史纪要只用保存基线。「配置指标」进入独立固定维护树 bw/metrics-refresh 的原生会话并注入 metrics-refresh Skill 提示。

如实缺口：完整业务/项目两区、特性关联与引领/滞后展示未实现（spec M02 部分缺口）；真实项目采集脚本、配置任务全链、SSH/WSL 实机与重启独立复算未验证；main 的资产/脚本、原型历史读数不证明本分支采集已可用。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

本轮设计/文档及仓外计划经过独立 subagent 初审与复审，发现项已修正；[任务评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。这是静态制品评审，不替代实施后的独立代码/行为 Review，不替代尚未逐项确认的详细设计决定。
