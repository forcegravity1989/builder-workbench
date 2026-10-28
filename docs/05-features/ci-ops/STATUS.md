# CI — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)。

**本特性处于设计阶段，尚无生产代码。** [Issue #461](https://github.com/forcegravity1989/builder-workbench/issues/461) 提出生产部署缺口后，按 02 逆向工作法先落 intent/spec 草案与高保真原型，交人 gate；关键决定（四模块语义、灯态机、停止回黄、人触发重启、日志本地存储）已在设计对话拍板并写入草案，正式确认以本 PR 评审为准。

高保真原型 [prototype.html](prototype.html) 已建：复用 G3 计划屏设计语言（g3-planning.css + vendor.js 依赖注入 + esbuild 单文件 bundle，模式同验收屏 v10 原型），四场景演示（首次进入全灰 / 已接入全黄 / 运行中绿红并存 / 全部健康历史保留）覆盖全部灯态与交互（生成脚本递交、单次执行瞬态、轮询启停、停止回黄、报错折叠展开、模块筛选、深浅/窄板/会话收折）。2026-10-28 按评审反馈精简板面文本：模块语义、脚本资产行、扫描说明、轮询间隔不上板面，收进按钮提示与正本。Playwright DOM 断言 38/38 通过（`prototype/verify-ci.cjs`：元素存在、场景灯态、停止回黄、日志展开、筛选、无 console/page error；截图仅存临时目录供人工查看）。演示数据全部预置，生产不预置任何记录。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 草案 | [intent.md](intent.md) 已写，待人确认（本 PR 评审） |
| spec | 草案 | [spec.md](spec.md) 已写（含 C01–C10 验收点与 CJ01 旅程），待人确认 |
| 实现设计 | ○ | 未建；高保真原型即形态候选，实现设计随 gate 后首版交付补 |
| 核心算法/数据协议 | ○ | 未建；记录协议（records.jsonl 与日志文件格式）随实现定 |
| 验收点 E2E | ○ | C01–C10 已定义，未注册用例 |
| 旅程 E2E | ○ | CJ01 已定义，未运行 |

## 原型资产清单

| 文件 | 职责 |
|---|---|
| [prototype.html](prototype.html) | 入口：链设计系统 styles.css、共用 g3-planning.css、特性 ci-screen.css 与 bundle |
| [prototype/ci-app.jsx](prototype/ci-app.jsx) | React 应用：demo bar、侧栏、会话区、模块导航、四模块卡、记录区 |
| [prototype/ci-model.js](prototype/ci-model.js) | 模块定义、四场景灯态与记录数据、递交指令文本、按钮矩阵 |
| [prototype/ci-screen.css](prototype/ci-screen.css) | CI 特有样式：灯色变体（补 err/off）、状态 chip、模块卡、记录与折叠日志 |
| [prototype/build-ci.cjs](prototype/build-ci.cjs) | esbuild 构建（`node prototype/build-ci.cjs`，`--check` 验 bundle 新鲜） |
| [prototype/ci-journey.js](prototype/ci-journey.js) | 生成物，勿手改 |
| [prototype/verify-ci.cjs](prototype/verify-ci.cjs) | Playwright DOM 断言验证（40 例） |

## 验证纪律

gate 通过后的生产实现按 02 §6.2 交付：真壳截图四件套、C01–C10 逐项证据、CJ01 真实旅程（真实脚本执行、真实报错与恢复读回）。本 PR 为纯文档 + 原型交付，不涉及生产界面变更，原型证据以 DOM 断言与人工评审为准。
