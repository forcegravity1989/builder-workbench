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
| 1 | 版本计划 | [version-planning/](version-planning/) · [原型](version-planning/prototype.html) · [G3 旅程候选](version-planning/planning-journey-prototype.html) | 在用·G3 计划旅程候选待评审；当前实现见 STATUS⁴ | ● | ● | ◐ | ◐ | ◐(P01–P10 未逐项) | ○(PJ01/PJ02 已定义) |
| 2 | 版本验收 | [version-acceptance/](version-acceptance/) · [原型](version-acceptance/prototype.html) | 在用·形态整改已确认待实施⁴ | ● | ● | ◐(待按轮次协议重写) | ◐ | ◐(A01–A11 未逐项；A12–A14 已定义未实施) | ○(AJ01/AJ02 已定义) |
| 3 | 总览指标 | [overview-metrics/](overview-metrics/) · [原型](overview-metrics/prototype.html) | 在用·本轮交付（v0.5 收尾） | ● | ● | ◐ | ◐ | ◐(M01–M10 未逐项) | ○(MJ01/MJ02 已定义) |
| 4 | PR 评审召唤制（reviewer-agent） | [reviewer-agent/](reviewer-agent/) | 开发方法资产·在用（正本随扶正在 main）¹ | ● | ● | ● | ◐¹ | ◐¹ | ○(台内路径 defer) |
| 5 | 纳入项目与项目信息记录 | [project-intake/](project-intake/)² | 在用·补链中 | ● | ●(原型经拍板豁免) | ● | ● | ◐(配置验收已登记待运行；P-01–P14 注册暂缓) | ◐(配置子旅程已登记待运行；主旅程/跨主机/扫墙候选待建) |
| 6 | CodeHub 适配 | [codehub/](codehub/)³ | 在用·补链中 | ◐ | ◐ | ◐ | ◐ | ○(C01–C08 已定义) | ○(CJ01 已定义) |
| 7 | Windows 出包与发布 | [workbench-release/](workbench-release/)³ | 开发方法资产·补链中 | ◐ | ◐ | ◐ | ◐ | ◐(R01/R02/R03/R05 v0.6.0 实走) | ◐(RJ01 走至读回) |
| 8 | 集成页四卡收敛 | [connectors/](connectors/) · [原型](connectors/prototype.html)⁵ | 在用·补链中 | ● | ● | ● | ● | 待建(I01–I12 已定义) | 待建(IJ01 已定义) |

¹ 第 4 行：GitHub CI 路径 2026-08/09 在旧 main 侧交付并实测闭环（PR #132 及后续召唤）；2026-09-29 用户拍板迁入产品分支——workflow 与回执脚本（`.github/scripts/check-pr-review.mjs`）已落，实现设计 ●。2026-09-30 扶正后本定义即默认分支 main 的定义，`/code-review` 召唤直接执行它，不再经旧 main 定义中转。验收点 ◐：迁移 PR 自身修改 workflow 文件，按 #132 先例（时为 pull_request 触发下的防篡改跳过）保守不自召——该校验在现行 issue_comment 触发模型下是否适用未复核；主干首场真实召唤待下一条合格 PR 实测，未实测不判过。TDD ◐：回执脚本无单测，以召唤实测为准。台内「请评审」按钮路径规范件在仓但未接线，defer。明细见其 [STATUS](reviewer-agent/STATUS.md) 迁移节。

² 第 5 行为 v0.5 收尾补登记（2026-09-29 用户拍板带入）：能力已交付在用，但特性链在 v0.5 准备阶段清旧矩阵时未重建，按 [02 §6.3](../01-principles/02-working-backwards.md) 补链。intent 已 gate（2026-09-29）、spec 已确认（2026-09-30，原型经拍板豁免），补链由本仓会话推进。工程与行为记录以 [architecture](../architecture.md)（项目墙、接入覆盖层、`.bw/project.toml`）及对应 PR 为据。实现设计 ◐ = 有散落记录、无特性级 design；TDD ◐ = 有存量单测（charter 解析与保真合并、项目墙组聚合；展示类用例已随 2026-09-30 环 4 盘点删除）。 本轮[卡片配置设计](project-intake/project-settings-prototype.html)已于 2026-10-20 获用户授权实施：图标操作、右侧配置与来源点名称；四项现有读数保留，生产右栏及保真编辑协议已实现；成员数据未落实，配置真壳子旅程已登记，当前提交的 CI 与截图证据见该特性 STATUS；真实远端编辑 PR 与完整进程重启仍待验。

³ 第 6–7 行从已落地提交回写（2026-09-30），intent/spec 为草案，待人 gate。第 6 行接上原先「任务 CodeHub 支持」的占位，目录就是 [codehub/](codehub/)，范围含任务来源与计划/验收读写；spec 缺可点原型。第 7 行是 BW 开发者的 Windows 出包与 GitHub Release，无界面，操作契约在技能；#332 增补发布脚本 `release-win-workbench.mjs`、版本描述规范与验收报告规范（含骨架模板），`version-report` 技能退役并入本特性，TDD 由 ○→◐（发布脚本 18 例单测），验收点扩到 R01–R06。v0.6.0 实跑（2026-10-16）后：发布固定动作改走 `bw-release.yml` workflow（PR #378）、版本描述定稿单节，R01/R02/R03/R05 与 RJ01 前四段已实走，R04/R06 与收尾报告段未走。明细见各自 STATUS。

⁴ 第 1–2 行形态整改（v9.5 原型，2026-10-18 用户确认，生产未实施）：计划/验收统一目标卡骨架（整卡收缩、Issue 分组子块带 Issue 级进展备注、计划完成/负责人从计划材料既有字段取、拆解打 bug/feature 分类标签）；验收单页承载会前/会中/会后三阶段，页底「会议指导与遗留」由会后 SOP 从会议转写总结（issue #374 链路、经 subagent、逐条人确认）随轮次入材料；跨周版本按轮次记录、界面按周呈现；周报信息由验收屏承载，不设独立周报屏与导出件——weekly-report 试点（PR #321 未合入 main、保持挂起）整体废止，处置待用户确认。明细见[验收 STATUS](version-acceptance/STATUS.md) 与[计划 STATUS](version-planning/STATUS.md) 批次记录。

⁵ 第 8 行随 #323 设计 PR 首次登记（2026-10-14），2026-10-15 按人反馈两轮修订后 gate（简化为拼装现有能力；人不手敲命令），实现随同 PR 交付：集成页收敛为 GitHub / CodeHub / WeLink / CloudBuild 四卡（代码托管 / 项目群 / 构建三组；CloudBuild 随 #366 增补，2026-10-19），preflight 补 `welink-cli` / `cb` 探测与 codehub / welink / cb `auth status` 读回，安装由应用后台执行（gh 保持外链），登录在卡内展开上游内嵌终端粘贴命令、人按回车（远端运行时无按钮，WSL 工作树保留）。待决 1–4 与真壳拍板 5–8 均已由人拍板（2026-10-16 / 10-19）：六卡代码留仓、自包含安装命令（cloudbuild 为两步）、welink EXPIRED 判未登录、分组标题补中文、安装后台化、登录卡内嵌终端。真壳验收证据（I01–I12 / IJ01）未采。明细见其 [STATUS](connectors/STATUS.md)。

## 裁决与明细指引

- 各特性链状态明细以其 `STATUS.md` 六环表与「验收点与旅程矩阵」小节为准（格式正本：[02 §6.2](../01-principles/02-working-backwards.md)「STATUS 格式」）；**本表是总览，冲突时以特性目录为准并回改本表**。
- 1–3 行共同基线：设计 PR #264 已合入、用户授权实施；真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 已编写，执行结果见对应 PR；SSH/WSL 实机、真实 provider 归档全链、真实到点自动化、真实出包/验包均未验证。逐条证据与缺口读各 STATUS，不在本表重复。

计划/验收原型的会话区只标识 Orca 原生复用边界；用户已确认右板首行协作入口、自动化配置及首次/异常状态，生产入口迁移已随 PR #279 实施（真壳未验，证据见各 STATUS）。验收原型取消独立交付准备卡，材料在会话准备、在目标卡核对，纪要预览在目标区标题旁；验收右板已按该原型落地。计划原有的直接编辑、自动保存、固定上版来源及正文操作入口保持；两屏实际证据见各 STATUS。原型与模拟 DOM 检查不等同于完整 Electron 真壳及会话旅程验收。
