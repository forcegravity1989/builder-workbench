# Workbench 清单（保留 / 待做 / 隐藏）

> **维护约定**：给定位叠层实现的开发者读取；只列保留能力、当前源码落点与待迁移边界，叠层变化时更新。产品旅程以 [architecture](../../../../docs/architecture.md) 为准，运行命令见 [SYNC](SYNC.md)。旧 Rust UI 与原型仅供迁移时参考，不是本分支验收证据。

## 保留（Orca 执行核）

| 能力 | 路径 | 对应保真 |
|------|------|----------|
| App / hydration | `src/renderer/src/App.tsx`, `app-shell/` | 整窗底座 |
| Projects / worktree 树 | `components/sidebar/` | 左栏 Projects |
| 终端 / agent / 建树 | terminal + `worktree-creation-flow` | 执行面 |
| Explorer / SC / Diff | right-sidebar | 执行面右栏 |
| **Tasks** | `components/task-page/` | 独立「任务」页签；原样挂载 Orca TaskPage；叠层按当前墙项目收窄同步仓 |
| Automations | `components/automations/` | 自动化屏 |
| Settings | `components/settings/` | 设置 |
| main / shared runtime | `src/main`, `src/shared` | 业务语义 |

## 当前源码（叠层）

| 项 | 落点 | 内容与证据边界 |
|----|------|-----------------|
| 多屏导航 | `workbench/WorkbenchSidebarNav.tsx` + `workbench-nav.ts` | 总览 / 计划 / **任务** / 验收 / 自动化 / 知识库；任务入口复用 Orca `SidebarTaskNavButton`；计划、验收均以 artifacts 槽准备固定树，不扩 TopLevelView union |
| 计划/验收共用容器 | AppWorkspaceShell + version-cycle/CycleWorkspaceProvider、CycleWorkspaceShell | artifacts 只准备固定树，随后切 terminal；原生 Terminal 唯一挂载，右侧按固定分支附加业务板 |
| 周期共享层 | version-cycle/（cycle-context、native-workspace、native-session、cycle-prompt、material-draft、CycleStartCard、cycle-start-request、current-cycle-workspace、metrics-setup、use-workflow-version、start-cycle-automation） | 原生会话/标签/分屏/历史/工具完整复用；两屏右板首行协作卡片是唯一启动入口：手动运行已登记自动化（保存的提示/模型/工具/复用规则），数据文件问题作为一次性上下文随该次运行合并递交（automation.runNow oneShotPrompt，capability 门控），不再另建会话；业务草稿插入当前原生 composer；无 BW 聊天/历史/会话绑定 |
| 计划业务 | `version-planning/`（PlanningBoard、PlanningSections、PlanningGoals、PlanningTasks、PlanningMinutes、PlanGoalMetrics、PlanningPersistenceNotice、use-planning-view-memory、use-plan-version-selection、plan-summary） | 右侧同构空态与材料单页：直接编辑目标、页内任务、派生纪要、指标选取；旅程轴只定位正文，拆解与归档向原生 composer 插入草稿。goalFilter+滚动存 sessionStorage；流程选版走原生偏好 `workbenchSelectedVersion`；页面不创建新材料或另设保存按钮 |
| 计划材料与来源 | `version-planning/`（use-planning-material、use-planning-autosave、use-planning-archive、PlanningProgressSource、planning-progress-source） | 自动保存复用 MaterialDraftController 与材料 CAS，失败和冲突由 PlanningPersistenceNotice 呈现；归档状态仍按保存修订读取。上版验收可预览并明确绑定固定提交、版本、轮次与修订，不自动改读最新记录；实现与验证边界见[版本计划 STATUS](../../../../docs/05-features/version-planning/STATUS.md) |
| 验收业务 | `version-acceptance/`（AcceptancePage、AcceptanceBoard、AcceptanceSourcePicker、AcceptanceJourney、AcceptanceSources / Notices / GoalResult / Metrics / MetricWindow / ReportDialog / Tasks / Archive、use-acceptance-*） | 首行协作卡片下围绕 G1/G2/G3：固定计划与候选、紧凑来源与材料行（含按需核对）、逐目标结论与证据变化、Issue 快照、标题旁预览纪要弹窗；独立“交付准备”卡与“材料备齐”勾选已退役，准备灯由已记录交付证据推导；归档请求由旅程轴归档节点插入 composer，页脚保留显式保存/重读/刷新归档。归档状态按材料身份自动读取，脏草稿不绕过已确认归档 |
| 端口与 runtime | `task-port.ts` / `archive-port.ts` / `metrics-port.ts` / `version-material-port.ts` / `version-history-port.ts` / `metric-runtime-rpc.ts` | 消费 `src/main/workbench/` RPC（materials / metrics / history / archive.proof）；任务读取复用原生 github.workItem / codehub.viewTask，单条失败 kind:'unavailable'；openDetail 经原生 openTaskPage（returnToPreviousView 跳过 tasks 哨兵，来源上下文由 cycle-view-state / view-memory 恢复） |
| 总览 | `OverviewPage.tsx`、`overview-project-card.tsx`、`overview-north-star-card.tsx`；`overview-metric-zones.tsx`、`overview-metric-chart.tsx`、`overview-zone-series.ts`；`overview-sdlc-zones.tsx`、`overview-sdlc-readings.ts`、`use-overview-sdlc.ts`；`overview-version-minutes.tsx`、`use-version-minutes.ts`、`overview-view-state.ts` | 北极星与业务指标经 nativeMetricsPort 读取；ECharts 共用图表支持特性、显隐、日/周及详情。项目统计沿原生 Git/provider 读取，提交按固定修订分页和 %ct 落桶，PR/MR 按 mergedAt，Issue 只绘当前点；截断或失败保持未知。版本/轮次纪要按 planRef 配对并独立滚动，筛选按项目/宿主恢复。「配置指标」复用 `version-cycle/metrics-setup` 固定树管线，每次新建会话；指标闭环实施与验证边界见[总览指标 STATUS](../../../../docs/05-features/overview-metrics/STATUS.md) |
| 知识库保真 | `KnowledgePage` + `use-knowledge-repo` + `knowledge-demo-data` | 文档树与正文读 activeRepo，编辑直接保存该仓；分类走内置规则（单仓分类地图能力已删）；代码占位，对账与建议含演示数据 |
| 项目墙 | `ProjectWallPage` + `project-page-state`；在 activity 内容槽展示；按 `ProjectGroup` 聚合多仓；卡片展示仓链接；`+ 代码仓` / 删除 | Orca 外壳内切换项目 |
| 接入项目 | `OnboardProjectPage`：在 activity 内容槽展示；本地仓 / 克隆 + 名片（保真合并只补空字段）→ `repo.add` + `.bw/project.toml`；成功落总览 | architecture §1、[project-intake spec](../../../../docs/05-features/project-intake/spec.md) |
| 皮肤 token | `workbench-tokens.css` + `workbench-overview.css`；`version-planning/` 下 version-planning.css（布局）、planning-fields.css（字段）、planning-dialogs.css（对话框）；`version-acceptance/acceptance.css`、`metrics/metric-evidence.css` | `bw-tokens` / hifi-overview；workbench-plan.css 与旧三屏链条已删除 |
| 热加载调试 | `pnpm run dev:workbench`（electron-vite HMR；独立 `workbench-dev` profile） | — |
| 品牌打包 | `ORCA_PRODUCT_NAME` / `build:mac:workbench` | — |
| Workbench Skills | `.claude/skills/{workbench-start,project-knowledge,version-report,design-system-import}`；产品剧本正源 `standard/skills/`（week-planning / version-acceptance / metrics-refresh 等），根级 `skills/` Stub 投影由 `config/scripts/generate-bundled-skill-guides.mjs` 生成 | cycle-prompt 内嵌 Stub、指南与 references 经 `ORCA skills get` 按需读取；week-planning 的 planning.py / version-plan.html / data-template.json 已退役删除，check-week-comment.py 保留作历史评论协议 |

## 隐藏 / 不建

- 独立「会话」导航页（执行面只靠 Projects / 开工）
- 独立「配置」屏（能力在 Settings）
- 原型皮肤对比开关
- Feature wall 营销向导（壳开启时尽量跳过）
- 左栏 Artifacts / Skills 并列入口（收进设置或隐藏）
- **Orca Mobile 产品已删**（`mobile/`、桌面 Mobile 页、手机设置页）；配对协议仍在执行核里，见 `ref/upstream.md`
- `.omc/**` 不进产品提交

## 待完成

- 指标真实项目来源与 Electron 完整旅程待验，边界见[总览指标 STATUS](../../../../docs/05-features/overview-metrics/STATUS.md)；Issue 历史存量需完整事件源；项目墙健康灯与真实环境探测（硬编码环境条已删，探测清单见 [project-intake STATUS](../../../../docs/05-features/project-intake/STATUS.md)）
- 知识库真实对账（名片已读 `.bw/project.toml`）
- 名片 PR 化与远端预探测：`bw/project` 固定树 + PR 合入、克隆前读远端名片回填（[project-intake spec](../../../../docs/05-features/project-intake/spec.md) 草案待确认；现名片写工作区 `.bw/`）
- 知识库文档树已读真实仓库；工作树来源、保存评审边界、ref 分类覆盖、codegraph 与真实对账待对应特性重新决策
- CodeHub 分区列仓对等 GitHub 克隆体验；CodeHub Issue 正文编辑（本轮延期）
