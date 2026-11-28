# 项目总览与指标 — 六环状态

> **维护约定**：给交付和验收者读取。本篇只记录当前六环状态、可追溯入口和未验证边界。价值见 [intent](intent.md)，行为见 [spec](spec.md)，实现设计见 [design](design.md)。运行命令、时间、日志和截图留在对应 PR 验证评论或运行产物，不在这里维护流水账。

## 当前结论

项目总览承接连续日期排期、里程碑、Build/Maintain 和正式结果回看。指标能力承接目录、历史脚本采集、来源修订、读数缓存、完成线和配置会话。两者都归入探索 BW 的 W05「用真实效果保持方向」，F18、F21、F28 是对应的功能入口。

当前实现已经接入自由日期排期、材料保存与版本来源读取、指标目录和历史读数协议、记分牌配对、版本目标推出的聚焦、配置指标会话和失败/未知语义。真实指标来源、外部宿主、配置会话完整旅程和 W05 的后续计划/任务回写仍需真实环境验证。

W01 的阶段安排复用 `tests/e2e/workbench/journeys/w01-project-handoff.spec.ts` 中的共享操作，标题 `BW first-run project handoff › hands off the first project, agrees on direction and prepares milestone review`。CI 的本地 Git fixture 观察草稿与变更核对；Windows CDP 在专用 GitHub 沙箱已两轮真实提交并核对磁盘材料、远端提交和 PR，见 [#758 验证](https://github.com/forcegravity1989/builder-workbench/pull/758#issuecomment-7091322345)。这不覆盖人工合入、正式结果更新、指标或 W05 全链。

## W05 交叉索引

| W05 步骤 | 本特性负责 | 关联功能 | 当前证据边界 |
| --- | --- | --- | --- |
| 查看进展 | 从项目总览查看里程碑、Build/Maintain、版本和正式结果 | F18、F21 | 版本材料和总览入口有既有 Electron 主链，完整真实来源仍需复验 |
| 查看指标 | 在记分牌查看场景、结果、引领、读数和走势 | F28 | 指标协议、配对和未知语义有核心测试，真实采集和来源权限待验 |
| 识别偏差 | 区分完成线未达、缺数据、失败、陈旧和真实零 | F28 | 状态推导有定向覆盖，跨屏与真实来源待验 |
| 人决定调整 | 把后续决定交给版本计划、任务和验收入口 | F18、F21 | 本特性不自动改 Issue 或目标，跨特性回写待验 |
| 形成后续计划或任务 | 由版本计划与任务管理承接下一轮动作 | 相邻特性 | 不在本特性独立建用户旅程 E2E |

30+ 个功能项仍通过 W01–W05 目录归属和特性资产维护，不为每个功能项生成用户旅程用例。

## 六环登记

| 环 | 状态 | 当前依据与入口 |
| --- | --- | --- |
| 1 intent | 已确认 | 用户结果、范围、W05 归属和排除见 [intent](intent.md)。 |
| 2 spec | 已确认 | 里程碑、指标、异常、M01–M10 和 W05 子链见 [spec](spec.md)。原型是设计输入，不代表生产证据。 |
| 3 实现设计 | 已同步 | MetricsPort、VersionHistoryPort、指标执行、缓存隔离、记分牌和配置会话边界见 [design](design.md)。 |
| 4 协议看护 | 部分 | 指标定义、窗口、来源、Unknown、去重、历史读回和记分牌配对已有核心测试入口。真实脚本、跨宿主和数据权限仍待验。 |
| 5 验收点 E2E | 部分 | 旅程 ID W05；文件 `tests/e2e/workbench/acceptance/version-overview.spec.ts`；标题 `BW version overview: real sources, version identity and process restart`；执行项目 `electron-headless`；真实环境为 Electron fixture；通过 `tests/playwright.overview.config.ts` 显式运行，使用操作者提供的 GitHub 只读认证，不属于默认 PR CI；独立读回为绑定工作树磁盘材料、侧栏入口和 renderer 重载。 |
| 6 用户旅程 E2E | 部分 | W05 复用同一条 E2E和入口，不另建第二条业务 E2E。当前只观察版本材料回看进入总览的子链，指标配置、试采、评审合入、验收采用、后续计划/任务和重启独立复算仍待真实环境。 |

## 核心 TDD 入口

核心协议和推导用例跟随实现维护，当前入口包括：

- `src/main/workbench/metrics/*.test.ts`
- `src/shared/workbench/metrics.test.ts`
- `src/renderer/src/workbench/overview-metric-readings.test.ts`
- `src/renderer/src/workbench/overview-scoreboard-model.test.ts`
- `src/renderer/src/workbench/overview-zone-series.test.ts`

这些用例只看护指标协议、窗口/来源语义、缓存和记分牌推导。UI 外观、文案和交互顺序由验收点 E2E 与真实 Electron 验收。

## 验收矩阵

| 验收点 | 状态 | 当前依据与缺口 |
| --- | --- | --- |
| M01 总览上下文和现行材料同源 | 部分 | 项目名片、里程碑和版本材料入口已接入。真实来源刷新和多宿主读回待验。 |
| M02 场景、配对、聚焦和完成线 | 部分 | 核心模型有测试入口。真实计划、指标和页面跨屏回看待验。 |
| M03 脚本 argv/cwd 与日周历史 | 部分 | 协议和限定脚本执行有测试入口。普通项目真实脚本和宿主路由待验。 |
| M04 失败、缺测和陈旧证据 | 部分 | 错误与 Unknown 语义已有协议覆盖。真实来源失败恢复待验。 |
| M06 最新目录、新实测和旧 baseline | 部分 | 新目录、旧引用和来源字段有实现。计划、验收、指标三屏真实采用待验。 |
| M07 配置指标新会话 | 部分 | 固定维护树和原生会话入口已接线。用户发送、模型维护和返回恢复待真壳验证。 |
| M08 执行修订和重启重算 | 部分 | 修订指纹、过期响应和缓存隔离有实现。真实采集与进程重启独立复算待验。 |
| M09 普通项目和草稿隔离 | 部分 | 主干基线与草稿隔离有实现。普通项目完整配置、试采和评审合入待验。 |
| M10 有效资产与来源权限 | 部分 | 协议保留 Unknown 和来源边界。外部权限、分页、重开和多宿主待验。 |

## 未验证边界

- 真实 Electron 中的完整 W05 链路，包括查看正式结果、读取真实指标、识别偏差并进入后续计划或任务。
- 配置指标会话由用户发送、生成历史脚本、试采、项目评审合入、总览更新代码、计划引用、验收采用和归档读回。
- 普通项目、SSH/WSL、配对宿主、CodeHub、外部采集权限和跨项目缓存隔离。
- 应用重启后的指标独立复算、历史 evidence 读回和失败后的再次刷新。
- 原型播放、替身端口、静态检查和 renderer reload 只能支持各自范围，不能替代上述真实证据。
