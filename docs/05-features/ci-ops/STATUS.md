# CI 部署 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，助手方法与 prompt 见 [skill-deploy](skill-deploy.md)。

**本特性处于设计阶段，尚无生产代码。** [Issue #461](https://github.com/forcegravity1989/builder-workbench/issues/461) 提出生产部署缺口后，按 02 逆向工作法先落 intent/spec 草案与高保真原型，交人 gate。2026-10-28 评审收敛：**只做部署模块**（目标是简化部署动作、帮助用户构建和使用已有的部署脚本；监控/故障检测/重启转后续演进），评审物从高保真原型扩展为四件——原型、ci-ops skill 草案（含递交 prompt 真实文本与记录协议）、真实项目样板间。关键决定（灯态机、停止误报相关的轮询设计随三模块移出、日志本地存储、5 秒扫描、板面文本精简、复用优先）已在设计对话拍板并写入草案，正式确认以本 PR 评审为准。

**样板间已实跑（2026-10-28）**：给真实项目 [gtsllm-dfx](showcase-gtsllm-dfx.md)（Node 局域网服务，已有 build/deploy 资产）搭 `.bw/ci/deploy.sh` 部署入口——项目已有脚本一行未改，只补编排、独立读回与执行记录。本机实走：新鲜版本包构建 → 解包部署（运行发出去的包）→ `/healthz`/`/readyz` 200 + 版本读回（全程 5348ms）→ `records.jsonl` 落 `ok:true`；强杀服务后项目自己的监督脚本 12 秒内自动拉回（downMs 19726ms 计量准确）；坏路径部署如实落 `ok:false` + 日志；`--stop` 干净停止、端口释放。远端 Linux 路径已构建未实走（无真实目标机）。明细见[样板间报告](showcase-gtsllm-dfx.md)。

高保真原型 [prototype.html](prototype.html) 已建：复用 G3 计划屏设计语言（g3-planning.css + vendor.js 依赖注入 + esbuild 单文件 bundle，模式同验收屏 v10 原型），场景演示覆盖部署灯全部四态与交互（生成脚本递交、部署执行瞬态、成功绿、失败红与报错折叠展开、深浅/窄板/会话收折）。2026-10-28 按评审反馈两轮定稿板面文本：机制与配置不上板面、收进按钮提示与正本，板面留事实（状态、读数、灰态「主分支未见脚本」）与动作。Playwright DOM 断言 36/36 通过（`prototype/verify-ci.cjs`：元素存在、四场景灯态、执行瞬态、报错展开与筛选、递交 prompt 一致性、无 console/page error；截图仅存临时目录供人工查看）。演示数据全部预置，生产不预置任何记录。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 草案 | [intent.md](intent.md) 已按收敛重写（部署单模块），待人确认（本 PR 评审） |
| spec | 草案 | [spec.md](spec.md) 已按收敛重写（C01–C06 与 CJ01），待人确认 |
| 实现设计 | ○ | 未建；高保真原型与样板间 deploy.sh 即形态候选，实现设计随 gate 后首版交付补 |
| 核心算法/数据协议 | ◐ | 记录协议已在真实项目实跑验证（[skill-deploy](skill-deploy.md) 记录协议节 + 样板间 records.jsonl 实例）；随实现定稿 |
| 验收点 E2E | ○ | C01–C06 已定义，未注册用例 |
| 旅程 E2E | ○ | CJ01 已定义，未运行 |

## 资产清单

| 文件 | 职责 |
|---|---|
| [intent.md](intent.md) / [spec.md](spec.md) | 价值与行为正本草案（2026-10-28 收敛为部署单模块） |
| [skill-deploy.md](skill-deploy.md) | ci-ops skill 部署草案：勘察→复用→生成→读回→记录方法、递交 prompt 真实文本、记录协议、助手边界；gate 后迁 `standard/skills/ci-ops/` |
| [showcase-gtsllm-dfx.md](showcase-gtsllm-dfx.md) | 样板间报告：拿什么→给 gtsllm-dfx→搭了什么→结果是什么→没走到什么（2026-10-28 本机实跑证据） |
| [prototype.html](prototype.html) | 入口：链设计系统 styles.css、共用 g3-planning.css、特性 ci-screen.css 与 bundle |
| [prototype/ci-app.jsx](prototype/ci-app.jsx) | React 应用：demo bar、侧栏、会话区、部署卡、记录区 |
| [prototype/ci-model.js](prototype/ci-model.js) | 部署模块定义、场景灯态与记录数据、递交指令文本、按钮矩阵 |
| [prototype/ci-screen.css](prototype/ci-screen.css) | CI 特有样式：灯色变体（补 err/off）、状态 chip、模块卡、记录与折叠日志 |
| [prototype/build-ci.cjs](prototype/build-ci.cjs) | esbuild 构建（`node prototype/build-ci.cjs`，`--check` 验 bundle 新鲜） |
| [prototype/ci-journey.js](prototype/ci-journey.js) | 生成物，勿手改 |
| [prototype/verify-ci.cjs](prototype/verify-ci.cjs) | Playwright DOM 断言验证 |

## 验证纪律

gate 通过后的生产实现按 02 §6.2 交付：真壳截图四件套、C01–C06 逐项证据、CJ01 真实旅程（真实脚本执行、真实报错与恢复读回）。样板间的本机实跑证据（部署成功/自动恢复/失败路径/干净停止）见[样板间报告](showcase-gtsllm-dfx.md)，属方法与协议实证，不等于屏面生产交付。本 PR 为纯文档 + 原型 + 样板间交付，不涉及生产界面变更。
