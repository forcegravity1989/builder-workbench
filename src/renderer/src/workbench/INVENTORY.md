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
| 多屏导航 | `workbench/WorkbenchSidebarNav.tsx` + `workbench-nav.ts` | 总览 / 计划 / **任务** / 验收 / 自动化 / 知识库；任务入口复用 Orca `SidebarTaskNavButton`；计划、验收均映射 artifacts 槽，不扩 TopLevelView union |
| 计划/验收共用容器 | AppWorkspaceShell + version-cycle/CycleWorkspaceProvider、CycleWorkspaceShell | artifacts 只准备固定树，随后切 terminal；原生 Terminal 唯一挂载，右侧按固定分支附加业务板 |
| 周期共享层 | version-cycle/（cycle-context、native-workspace、native-session、cycle-prompt、material-draft、metrics-setup、use-workflow-version、start-material-request） | 原生会话/标签/分屏/历史/工具完整复用；专用新建调用已有自动化，数据问题新建原生会话并就绪后发送，业务草稿插入当前原生 composer；无 BW 聊天/历史/会话绑定 |
| 计划业务 | `version-planning/`（PlanningBoard、PlanningSections、PlanningGoals、PlanningTasks、PlanningMinutes、PlanGoalMetrics、MaterialProblemNotice、PlanningSaveFooter、use-planning-material、use-planning-view-memory、use-plan-version-selection、plan-summary） | 右侧材料单页：目标卡、页内任务、派生纪要、指标选取；goalFilter+滚动存 sessionStorage；流程选版走原生偏好 `workbenchSelectedVersion` |
| 验收业务 | `version-acceptance/`（AcceptancePage、AcceptanceBoard、AcceptanceSourcePicker、AcceptanceJourney、AcceptancePreparation / GoalResult / Metrics / Tasks / Archive、use-acceptance-*） | 固定计划与候选、逐目标结论与证据变化、Issue 快照、派生报告；归档状态按材料身份自动读取，脏草稿不绕过已确认归档 |
| 端口与 runtime | `task-port.ts` / `archive-port.ts` / `metrics-port.ts` / `version-material-port.ts` / `version-history-port.ts` / `metric-runtime-rpc.ts` | 消费 `src/main/workbench/` RPC（materials / metrics / history / archive.proof）；任务读取复用原生 github.workItem / codehub.viewTask，单条失败 kind:'unavailable'；openDetail 经原生 openTaskPage（returnToPreviousView 跳过 tasks 哨兵，来源上下文由 cycle-view-state / view-memory 恢复） |
| 总览 | `OverviewPage.tsx` + `overview-north-star-card.tsx` / `overview-project-card.tsx` / `overview-metric-zones.tsx`（图表区）/ `overview-metric-chart.tsx`（手写 SVG 折线）/ `overview-zone-series.ts`（窗口与桶逻辑）/ `overview-sdlc-zones.tsx` + `use-overview-sdlc.ts`（项目区）/ `overview-metric-readings.ts` + `use-overview-zone-granularity.ts`（读取与粒度）+ `metrics/`（MetricSelector、MetricEvidenceView）+ `use-version-minutes.ts` | 真实北极星读数（nativeMetricsPort，无数据 Unknown / 未配置如实）；「配置指标」入口经 `version-cycle/metrics-setup` 与计划屏共管线；业务区=滞后/引领图表（特性页签、显隐、日/周、长定义 details，诚实规则见测试）；项目区 SDLC=提交真实时间桶（git.history 上限 200、截断留空）/开放 Issue 时点存量/合入 PR 诚实空态（无 mergedAt 通道）；版本页签=真实归档记录∪当前选版；页内计划/验收双栏纪要（归档 history.read 优先、当前选版回落 live 材料）；OVERVIEW_DEMO 已删 |
| 知识库保真 | `KnowledgePage` + `use-knowledge-repo` + `knowledge-demo-data` | 文档树与正文读 activeRepo，编辑直接保存该仓；代码占位，对账与建议含演示数据 |
| 项目墙 | `ProjectWallPage` + `project-page-state`；在 activity 内容槽展示；按 `ProjectGroup` 聚合多仓；卡片展示仓链接；`+ 代码仓` / 删除 | Orca 外壳内切换项目 |
| 接入项目 | `OnboardProjectPage`：在 activity 内容槽展示；本地仓 / 克隆 + 名片 → `repo.add` + `.bw/project.toml` | architecture §1 |
| 皮肤 token | `workbench-tokens.css` + `workbench-overview.css` + `version-planning/version-planning.css`、`version-acceptance/acceptance.css`、`metrics/metric-evidence.css` | `bw-tokens` / hifi-overview；workbench-plan.css 与旧三屏链条已删除 |
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

## 下一轮（未做）

- 总览合入 PR 趋势（需 Orca 原生透出真实 mergedAt，未授权不做）；提交历史完整分页与提交时间口径（%ct 需原生解析扩展）；Issue 历史存量（需完整事件源）；同版本多周总览切换；返回恢复总览筛选；项目墙健康灯
- 知识库真实对账（名片已读 `.bw/project.toml`）
- 项目约定完整路径：`bw/project` 常驻 worktree + MR（现 MVP 写工作区 `.bw/`）
- 知识库文档树已读真实仓库；工作树来源、保存评审边界、ref 分类覆盖、codegraph 与真实对账待对应特性重新决策
- CodeHub 分区列仓对等 GitHub 克隆体验；CodeHub Issue 正文编辑（本轮延期）
