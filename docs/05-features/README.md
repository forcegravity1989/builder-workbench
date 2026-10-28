# docs/05-features/ — 特性清单与链状态矩阵（正本）

> **本篇维护约定**
> - **读者与时机**：开发特性、盘点、排期、回答「BW Electron 叠层现在有哪些特性、六环链走到哪」时读；从 AGENTS「特性级变更」行与 [02 §6.2](../01-principles/02-working-backwards.md) 进入。
> - **职责与边界**：只装叠层特性清单 × 六环链状态总览 × 冲突裁决。**不装**：特性定义正文（在各特性目录 intent/spec/design/STATUS）、方法论（02 §6.2/6.3）、逐验收点明细（在各特性 STATUS 的「验收点与旅程矩阵」小节）、过程证据（git 历史与 PR 记录）、遗留事项台账（遗留事项只进原生 Issue，见原则 01）。
> - **结构**：判据与格值 → 特性矩阵 → 裁决与明细指引。
> - **更新触发**：特性带入或 intent 确认、分诊/归属变化、任一特性 STATUS 链状态变化、相关 PR 合入。本篇是现状正本，不记流水；改动随引发它的 PR 同批提交。
> - **正本声明**：仓内本篇为特性清单与链状态的唯一正本。仓外过程稿 `feature-matrix-20260926.md`（f2-review/plans/）自本篇落仓起退役为过程稿，不再作为现状依据；其逐验收点明细已并入各特性 STATUS。本篇不导入旧 main（现 `archive/main-pre-orca`）的旧特性矩阵，不继承其 F1–F11 旧账（[02 §6.2](../01-principles/02-working-backwards.md)）。

## 判据与格值（正文见 02 §6.2–6.3）

- **特性** = 持续提供给用户的一件完整的事；目录/页面/屏数 ≠ 特性数；组合形态（屏+会话+自动化+Skill）算一个特性。分层看用户身份：被管项目的 Builder ⇒ 产品特性；BW 开发团队自己 ⇒ 开发方法资产。
- 本表编号自 1 起，与 main 旧矩阵的 F1–F11 无对应关系。
- 格值：**●** 齐 ／ **◐** 部分 ／ **○** 缺 ／ **待建** = 暂缓（义务定义清楚后再建）／ **—** 不适用。
- 验收点 E2E 格只记条数概览（如 ◐(P01–P10 未逐项)），逐验收点状态、实现落点与证据在该特性 STATUS 的矩阵小节，不在本表铺开。

## 特性矩阵

| # | 特性 | 目录 | 分诊 | intent | spec | 实现设计 | TDD | 验收点E2E | 旅程E2E |
|---|---|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | 版本计划 | [version-planning/](version-planning/) · [原型](version-planning/prototype.html) · [G3 旅程高保真](version-planning/planning-journey-prototype.html) | 在用·G3 基线；#439 启动/前版回顾/纪要已静态接线，真壳待验⁴ | ● | ● | ◐ | ◐ | ◐(P01–P10 未逐项) | ○(PJ01/PJ02 已定义) |
| 2 | 版本验收 | [version-acceptance/](version-acceptance/) · [v9.5 旧稿](version-acceptance/prototype.html) · [v10 会议旅程高保真](version-acceptance/acceptance-journey-prototype.html) | 在用·v10 基线；#439 启动/结论/Issue/纪要已静态接线，真壳待验⁴ | ● | ● | ● | ◐ | ◐(A01–A13 代码已接入，真壳证据未取) | ○(AJ01 已定义未运行) |
| 3 | 总览指标 | [overview-metrics/](overview-metrics/) · [原型](overview-metrics/prototype.html) | 在用·本轮交付（v0.5 收尾） | ● | ● | ◐ | ◐ | ◐(M01–M10 未逐项) | ○(MJ01/MJ02 已定义) |
| 4 | PR 评审召唤制（reviewer-agent） | [reviewer-agent/](reviewer-agent/) | 开发方法资产·在用（正本随扶正在 main）¹ | ● | ● | ● | ◐¹ | ◐¹ | ○(台内路径 defer) |
| 5 | 纳入项目与项目信息记录 | [project-intake/](project-intake/)² | 在用·补链中 | ● | ●(原型经拍板豁免) | ● | ● | ◐(配置验收已登记，结果见 STATUS；P-01–P14 注册暂缓) | ◐(配置子旅程已登记，结果见 STATUS；主旅程/跨主机/扫墙候选待建) |
| 6 | CodeHub 适配 | [codehub/](codehub/)³ | 在用·补链中 | ◐ | ◐ | ◐ | ◐ | ○(C01–C08 已定义) | ○(CJ01 已定义) |
| 7 | Windows 出包与发布 | [workbench-release/](workbench-release/)³ | 开发方法资产·补链中 | ◐ | ◐ | ◐ | ◐ | ◐(R01/R02/R03/R05 v0.6.0 实走) | ◐(RJ01 走至读回) |
| 8 | 集成页四卡收敛 | [connectors/](connectors/) · [原型](connectors/prototype.html)⁵ | 在用·补链中 | ● | ● | ● | ● | 待建(I01–I12 已定义) | 待建(IJ01 已定义) |
| 9 | 版本工作区（侧边栏版本运作树） | [version-workspace/](version-workspace/) · [原型](version-workspace/version-workspace-prototype.html) · [旅程](version-workspace/version-workspace-journey.html) | G2 基线；#439 全树绑定/会话可见/断链已静态接线，真壳待验⁶ | ● | ● | ● | ◐(协议例＋ratchet 226) | ◐(headless 烟测主链，CI 随 push 复核) | ◐(绑定树旅程烟测；真壳归人) |
| 10 | CI 部署（生产部署入口） | [ci-ops/](ci-ops/) · [高保真](ci-ops/prototype.html) | 设计中·#461 草案待人 gate⁷ | ◐ | ◐ | ○ | ○ | ○(C01–C06 已定义) | ○(CJ01 已定义) |

¹ 第 4 行：GitHub CI 路径 2026-08/09 在旧 main 侧交付并实测闭环（PR #132 及后续召唤）；2026-09-29 用户拍板迁入产品分支——workflow 与回执脚本（`.github/scripts/check-pr-review.mjs`）已落，实现设计 ●。2026-09-30 扶正后本定义即默认分支 main 的定义，`/code-review` 召唤直接执行它，不再经旧 main 定义中转。验收点 ◐：迁移 PR 自身修改 workflow 文件，按 #132 先例（时为 pull_request 触发下的防篡改跳过）保守不自召——该校验在现行 issue_comment 触发模型下是否适用未复核；主干首场真实召唤待下一条合格 PR 实测，未实测不判过。TDD ◐：回执脚本无单测，以召唤实测为准。台内「请评审」按钮路径规范件在仓但未接线，defer。明细见其 [STATUS](reviewer-agent/STATUS.md) 迁移节。

² 第 5 行为 v0.5 收尾补登记（2026-09-29 用户拍板带入）：能力已交付在用，但特性链在 v0.5 准备阶段清旧矩阵时未重建，按 [02 §6.3](../01-principles/02-working-backwards.md) 补链。intent 已 gate（2026-09-29）、spec 已确认（2026-09-30，原型经拍板豁免），补链由本仓会话推进。工程与行为记录以 [architecture](../architecture.md)（项目墙、接入覆盖层、`.bw/project.toml`）及对应 PR 为据。实现设计 ◐ = 有散落记录、无特性级 design；TDD ◐ = 有存量单测（charter 解析与保真合并、项目墙组聚合；展示类用例已随 2026-09-30 环 4 盘点删除）。 本轮[卡片配置设计](project-intake/project-settings-prototype.html)已于 2026-10-20 获用户授权实施：图标操作、右侧配置与来源点名称；四项现有读数保留，生产右栏及保真编辑协议已实现；成员数据未落实，配置真壳子旅程已登记，当前提交的 CI 与截图证据见该特性 STATUS；真实远端编辑 PR 与完整进程重启仍待验。

³ 第 6–7 行从已落地提交回写（2026-09-30），intent/spec 为草案，待人 gate。第 6 行接上原先「任务 CodeHub 支持」的占位，目录就是 [codehub/](codehub/)，范围含任务来源与计划/验收读写；spec 缺可点原型。第 7 行是 BW 开发者的 Windows 出包与 GitHub Release，无界面，操作契约在技能；#332 增补发布脚本 `release-win-workbench.mjs`、版本描述规范与验收报告规范（含骨架模板），`version-report` 技能退役并入本特性，TDD 由 ○→◐（发布脚本 18 例单测），验收点扩到 R01–R06。v0.6.0 实跑（2026-10-16）后：发布固定动作改走 `bw-release.yml` workflow（PR #378）、版本描述定稿单节，R01/R02/R03/R05 与 RJ01 前四段已实走，R04/R06 与收尾报告段未走。明细见各自 STATUS。

⁴ 第 1–2 行现行形态分别为 G3 计划旅程和 v10 验收会议四区，旧 prototype.html 保留历史身份。#439 已确认的局部行为已写入现行 spec 并作源码接线：两屏短卡仅在实际原生会话打开后展开四区；新版默认紧邻前版验收，缺来源留空不回退，已有固定引用不替换；验收取消未合入启动门禁，但材料仍需可读 committed 固定计划；单个人工结论用中性/警示色，Issue 分组计数与排序，遗留为未关闭子集；纪要归档前已落实或真实 Issue 跟进，由助手核对、PR 人审，无逐项闭环或界面硬门禁。出包/下载、演示部署、Feature/Bug 沿既有能力。非性能项的静态检视与 CI 证据见 [PR #441 验证报告](https://github.com/forcegravity1989/builder-workbench/pull/441)，手工真机与模型旅程仍未验证，E2E 格不提升。性能增量已接入三屏 Issue 共用读取、固定回顾复用和建版等待收窄，目前仅作静态检视，实际耗时仍待测。明细见[验收 STATUS](version-acceptance/STATUS.md)与[计划 STATUS](version-planning/STATUS.md)。

⁵ 第 8 行随 #323 设计 PR 首次登记（2026-10-14），2026-10-15 按人反馈两轮修订后 gate（简化为拼装现有能力；人不手敲命令），实现随同 PR 交付：集成页收敛为 GitHub / CodeHub / WeLink / CloudBuild 四卡（代码托管 / 项目群 / 构建三组；CloudBuild 随 #366 增补，2026-10-19），preflight 补 `welink-cli` / `cb` 探测与 codehub / welink / cb `auth status` 读回，安装由应用后台执行（gh 保持外链），登录在卡内展开上游内嵌终端粘贴命令、人按回车（远端运行时无按钮，WSL 工作树保留）。待决 1–4 与真壳拍板 5–8 均已由人拍板（2026-10-16 / 10-19）：六卡代码留仓、自包含安装命令（cloudbuild 为两步）、welink EXPIRED 判未登录、分组标题补中文、安装后台化、登录卡内嵌终端。真壳验收证据（I01–I12 / IJ01）未采。明细见其 [STATUS](connectors/STATUS.md)。
⁶ 第 9 行（[#383](https://github.com/forcegravity1989/builder-workbench/issues/383)/#328/#334）2026-10-20 评审定稿（Draft PR #389）：版本平铺导航、目标目录投影（含跨宿主实例汇总）、目标树按需、同一原生创建器开工、版本总览聚合视图（修订 9 表格周报风格，2026-10-22 人确认），以及版本级清理（版本行删除图标＋与 Orca 同口径确认对话框，复用原生删除链与预检，默认只删本机 owned 工作树；不级联删版本、材料与目录保留）。生产接线已随 #389 交付（2026-10-22：P1 绑定与目录、P2 版本准备、P4 任务范围与开工链、P3a 侧栏版本树、P3b 屏内选版移除/清理确认单/补绑定/只读回看/Issue 开工 hookup、P5 自动化身份版本化与墙读数、P6 版本总览）；验收侧 Skill 正本同步与护栏撤除待 #394 合入，真壳 J1–J9、发布证据检索与 CodeHub 范围路径归人/后续。证据与留白见 [version-workspace STATUS](version-workspace/STATUS.md)。 #439 增量：原生全树右击绑定/改绑/解绑、无会话绑定树可见、断链原生图标与导航保留已静态接线，无版本级重复绑定按钮，解绑不级联树/会话/父子。旧烟测不覆盖这些变化，真壳与双主机复验尚未进行。

⁷ 第 10 行随 [#461](https://github.com/forcegravity1989/builder-workbench/issues/461) 首次登记（2026-10-28）：发布后生产部署无入口/流程/状态读回的缺口。同日评审收敛为**只做部署模块**（简化部署动作、构建并使用项目已有部署脚本；监控/故障检测/重启转后续演进），评审物扩展为四件：高保真原型、ci-ops skill 草案（勘察→复用→生成→读回→记录方法 + 递交 prompt 正文 + 记录协议）、真实样板间（gtsllm-dfx 本机实跑：项目已有脚本零改动，一条命令构建→部署→独立读回→写记录，监督自愈、失败路径与干净停止实证；远端路径已构建未实走）。intent/spec 为草案待人 gate；无生产代码；明细见 [ci-ops STATUS](ci-ops/STATUS.md)。

## 裁决与明细指引

- 各特性链状态明细以其 `STATUS.md` 六环表与「验收点与旅程矩阵」小节为准（格式正本：[02 §6.2](../01-principles/02-working-backwards.md)「STATUS 格式」）；**本表是总览，冲突时以特性目录为准并回改本表**。
- 1–3 行共同基线：设计 PR #264 已合入、用户授权实施；真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 已编写，执行结果见对应 PR；SSH/WSL 实机、真实 provider 归档全链、真实到点自动化、真实出包/验包均未验证。逐条证据与缺口读各 STATUS，不在本表重复。

计划/验收原型的会话区只标识 Orca 原生复用边界；现行形态每屏一份：[计划旅程高保真](version-planning/planning-journey-prototype.html)、[验收会议高保真](version-acceptance/acceptance-journey-prototype.html)。两屏旧 prototype.html 仅作历史设计基线。#439 的局部行为已直接合并进各 spec 正文，不以候选条款覆盖相反的旧正文；当前源码、历史 PR 证据与本轮未验证项分见 STATUS。原型或静态检查不等于完整 Electron、真实会话及跨宿主验收。
