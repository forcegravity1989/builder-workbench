# CI 部署 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，助手方法与 prompt 见 [skill-deploy](skill-deploy.md)。

**本特性处于设计阶段，尚无生产代码。** [Issue #461](https://github.com/forcegravity1989/builder-workbench/issues/461) 提出生产部署缺口后，按 02 逆向工作法先落 intent/spec 草案与高保真原型，交人 gate。2026-10-28 评审收敛：**只做部署模块**（目标是简化部署动作、帮助用户构建和使用已有的部署脚本；监控/故障检测/重启转后续演进），评审物从高保真原型扩展为四件——原型、ci-ops skill 草案（含递交 prompt 真实文本与记录协议）、真实项目样板间。**2026-10-29 第二轮修订**（设计对话拍板）：两种部署模式（开发=本地执行启动命令 / 上线=连服务器部署所选版本包）、上线版本选择（数据源=验收屏包登记，默认最新，包不存在灰掉）、三阶段六步流程（**软件包准备最前——没有可用包不动正在跑的服务**；清场独立成步；失败停在该步 + 从失败步重试）、流程条板面（摆法 A）、密码部署执行时输入（密文、不可复制、不落盘）、记录协议加 mode/version/steps/failedStep、步骤标记协议（`[ci-step]`）。正式确认以本 PR 评审为准。

**样板间已实跑（2026-10-28）**：给真实项目 [gtsllm-dfx](showcase-gtsllm-dfx.md)（Node 局域网服务，已有 build/deploy 资产）搭 `.bw/ci/deploy.sh` 部署入口——项目已有脚本一行未改，只补编排、独立读回与执行记录。本机实走：新鲜版本包构建 → 解包部署（运行发出去的包）→ `/healthz`/`/readyz` 200 + 版本读回（全程 5348ms）→ `records.jsonl` 落 `ok:true`；强杀服务后项目自己的监督脚本 12 秒内自动拉回（downMs 19726ms 计量准确）；坏路径部署如实落 `ok:false` + 日志；`--stop` 干净停止、端口释放。远端 Linux 路径已构建未实走（无真实目标机）。**样板间脚本为 2026-10-28 版结构（构建→部署→读回→记录），早于六步流程契约；步骤标记与 `--from` 重试参数随 gate 后脚本升级补**，明细见[样板间报告](showcase-gtsllm-dfx.md)。

高保真原型 [prototype.html](prototype.html) 已按第二轮修订改版：复用 G3 计划屏设计语言（g3-planning.css + vendor.js 依赖注入 + esbuild 单文件 bundle），部署卡为**流程条摆法**——模式 toggle（开发/上线）+ 版本选择（仅上线，来自验收登记演示数据，包不存在灰掉）+ 三阶段六步流程条（执行中逐步点亮，失败步红叉定位，重试时已完成步不重跑）+ 记录区（含模式与版本）。场景演示覆盖部署灯全部四态与交互（生成脚本递交、开发/上线执行瞬态与逐步点亮、成功绿、失败红与报错折叠展开、从失败步重试、深浅/窄板/会话收折）。板面文本沿用两轮定稿规则：机制与配置收进按钮提示与正本，板面只留事实（状态、读数、流程推进、灰态「主分支未见脚本」）与动作。Playwright DOM 断言 **67/67** 通过（`prototype/verify-ci.cjs`：元素与流程条结构、四场景灯态、两模式与版本选择、执行瞬态与逐步点亮、失败步定位、重试不重跑已完成步、报错展开与筛选、递交 prompt 与 skill 草案逐字一致、无 console/page error；截图仅存临时目录供人工查看）。演示数据全部预置，生产不预置任何记录。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 草案 | [intent.md](intent.md) 已含两模式与六步流程体验（2026-10-29 二轮修订），待人确认（本 PR 评审） |
| spec | 草案 | [spec.md](spec.md) C01–C09 与 CJ01（含版本选择、两模式、失败停步与重试），待人确认 |
| 实现设计 | ○ | 未建；高保真原型与样板间 deploy.sh 即形态候选，实现设计随 gate 后首版交付补 |
| 核心算法/数据协议 | ◐ | 记录协议已在真实项目实跑验证（[skill-deploy](skill-deploy.md) 记录协议节 + 样板间 records.jsonl 实例）；mode/version/steps/failedStep 与步骤标记协议为二轮增补，随实现定稿 |
| 验收点 E2E | ○ | C01–C09 已定义，未注册用例 |
| 旅程 E2E | ○ | CJ01 已定义（含上线选版本与从失败步重试），未运行 |

## 资产清单

| 文件 | 职责 |
|---|---|
| [intent.md](intent.md) / [spec.md](spec.md) | 价值与行为正本草案（2026-10-28 收敛为部署单模块；10-29 二轮补两模式/版本选择/六步流程） |
| [skill-deploy.md](skill-deploy.md) | ci-ops skill 部署草案：勘察→复用→生成→读回→记录方法、三阶段六步流程契约与步骤标记协议、递交 prompt 真实文本、记录协议、配置资产与密码、助手边界；gate 后迁 `standard/skills/ci-ops/` |
| [showcase-gtsllm-dfx.md](showcase-gtsllm-dfx.md) | 样板间报告：拿什么→给 gtsllm-dfx→搭了什么→结果是什么→没走到什么（2026-10-28 本机实跑证据） |
| [prototype.html](prototype.html) | 入口：链设计系统 styles.css、共用 g3-planning.css、特性 ci-screen.css 与 bundle |
| [prototype/ci-app.jsx](prototype/ci-app.jsx) | React 应用：demo bar、侧栏、会话区、部署卡（模式 toggle+版本选择+六步流程条+从失败步重试）、记录区 |
| [prototype/ci-model.js](prototype/ci-model.js) | 六步流程定义、两种模式、版本登记、场景灯态与记录数据、递交指令文本、按钮矩阵 |
| [prototype/ci-screen.css](prototype/ci-screen.css) | CI 特有样式：灯色变体（补 err/off）、状态 chip、模式行与版本选择、六步流程条、记录与折叠日志 |
| [prototype/build-ci.cjs](prototype/build-ci.cjs) | esbuild 构建（`node prototype/build-ci.cjs`，`--check` 验 bundle 新鲜） |
| [prototype/ci-journey.js](prototype/ci-journey.js) | 生成物，勿手改 |
| [prototype/verify-ci.cjs](prototype/verify-ci.cjs) | Playwright DOM 断言验证（67 项） |

## 验证纪律

gate 通过后的生产实现按 02 §6.2 交付：真壳截图四件套、C01–C09 逐项证据、CJ01 真实旅程（真实脚本执行、真实报错与从失败步重试读回）。样板间的本机实跑证据（部署成功/自动恢复/失败路径/干净停止）见[样板间报告](showcase-gtsllm-dfx.md)，属方法与协议实证，不等于屏面生产交付；其脚本结构早于六步流程契约，升级随 gate 后进行。本 PR 为纯文档 + 原型 + 样板间交付，不涉及生产界面变更。
