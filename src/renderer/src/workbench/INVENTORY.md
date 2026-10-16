# Workbench 清单（保留 / 待做 / 隐藏）

> **维护约定**：给定位叠层实现的开发者读取；只列保留能力、当前源码落点与待迁移边界，叠层变化时更新。产品旅程以 [architecture](../../../../docs/architecture.md) 为准，运行命令见 [SYNC](SYNC.md)。旧 Rust UI 与原型仅供迁移时参考，不是本分支验收证据。

## 保留（Orca 执行核）

| 能力 | 路径 | 对应保真 |
|------|------|----------|
| App / hydration | `src/renderer/src/App.tsx`, `app-shell/` | 整窗底座 |
| Projects / worktree 树 | `components/sidebar/` | 左栏 Projects |
| 终端 / agent / 建树 | terminal + `worktree-creation-flow` | 执行面 |
| Explorer / SC / Diff | right-sidebar | 执行面右栏 |
| **Tasks** | `components/task-page/` | 独立「任务」页签；原样挂载 Orca TaskPage；BW 壳内侧栏任务入口经原生 `openTaskPage({ preselectedRepoId })` 默认预选墙当前项目（解析同验收/计划屏），页内筛选可改；不合格/无项目按原生优先级回退（预选 > 持久化 defaultRepoSelection > 全部项目），不另建收窄过滤层 |
| Automations | `components/automations/` | 自动化屏 |
| Settings | `components/settings/` | 设置 |
| main / shared runtime | `src/main`, `src/shared` | 业务语义 |

## 当前源码（叠层）

| 项 | 落点 | 内容与证据边界 |
|----|------|-----------------|
| 多屏导航 | `workbench/WorkbenchSidebarNav.tsx` + `workbench-nav.ts` | 总览 / 计划 / **任务** / 验收 / 自动化 / 知识库；任务入口复用 Orca `SidebarTaskNavButton`（BW 壳内点击带当前项目预选，见保留表 Tasks 行）；计划、验收均以 artifacts 槽准备固定树，不扩 TopLevelView union |
| 计划/验收共用容器 | AppWorkspaceShell + version-cycle/CycleWorkspaceProvider、CycleWorkspaceShell | artifacts 只准备固定树，随后切 terminal；原生 Terminal 唯一挂载，右侧按固定分支附加业务板 |
| 周期共享层 | version-cycle/（cycle-context、native-workspace、native-session、cycle-prompt、material-draft、CycleStartCard、cycle-start-request、current-cycle-workspace、metrics-setup、use-workflow-version、use-archive-pr-status、ensure-cycle-automation、use-cycle-automation-draft、start-cycle-automation、AutomationConfigureButton、trunk-update-port） | 原生会话/标签/分屏/历史/工具完整复用；两屏右板首行协作卡片是唯一启动入口：手动运行已登记自动化（保存的提示/模型/工具/复用规则；ensure 按当前 BW 版本覆盖同步提示词，用户设置保留），数据文件问题作为一次性上下文随该次运行合并递交（automation.runNow oneShotPrompt，capability 门控），不再另建会话；「配置自动化」入口在右板页头分支名旁；进屏零 Git 动作，页头「更新代码」经 trunk-update-port 快进固定树并重读材料，快进不了保持原样、统一提示交会话；归档/拆解/跟进直接在会话中发起，贴草稿通道与等待框已整体退役删除；无 BW 聊天/历史/会话绑定 |
| 计划业务 | `version-planning/`（PlanningBoard、PlanningSections、PlanningGoals、PlanningTasks、PlanningMinutes、PlanGoalMetrics、PlanningPersistenceNotice、use-planning-view-memory、use-plan-version-selection、use-progress-minutes、plan-summary） | 右侧同构空态与材料单页：直接编辑目标、页内任务、派生纪要、指标选取；旅程轴定位正文并按材料 workflow.stage 点灯（灰/绿两态，位置比较）；进展区在有 progressSource 时内联回显派生只读纪要；风险仅由用户填写（模型通道被人工守卫拒绝）。goalFilter+滚动存 sessionStorage；流程选版走原生偏好 `workbenchSelectedVersion`；页面不创建新材料或另设保存按钮 |
| 计划材料与来源 | `version-planning/`（use-planning-material、use-progress-minutes、planning-progress-source） | 自动保存复用 MaterialDraftController 与材料 CAS，失败和冲突由 PlanningPersistenceNotice 呈现。进展区在有 progressSource 时内联回显派生只读纪要，「上版验收」按钮跳转验收屏（选源弹窗已删）；引用绑定固定提交、版本、轮次与修订，不自动改读最新记录；实现与验证边界见[版本计划 STATUS](../../../../docs/05-features/version-planning/STATUS.md) |
| 验收业务 | `version-acceptance/`（AcceptancePage、AcceptanceBoard、AcceptanceJourney、AcceptanceSources / Summary / Notices / GoalCards / GoalResult / DeliveryDetails / Metrics / MetricWindow / ReportDialog / Tasks、acceptance-model / decision / report、use-acceptance-*） | 首行协作卡片下围绕 G1/G2/G3：固定计划与候选、紧凑来源与材料行（记录事实+纯声明比对，在线探测按钮已退役）、逐目标结论与证据变化、Issue 快照、标题旁预览纪要弹窗；旅程灯只读 workflow.stage（灰/绿两态）；归档状态行按 archivePr 薄读取 PR 合入状态。可选版本来自验收分支已提交的版本目录；灯与 PR 状态只作提醒信号不阻塞开轮，当前轮未保存修改是唯一开轮门 |
| 端口与 runtime | `task-port.ts` / `archive-pr-port.ts` / `metrics-port.ts` / `version-material-port.ts` / `version-history-port.ts` / `metric-runtime-rpc.ts` | 消费 `src/main/workbench/` RPC（materials / metrics / history / archive.prStatus / trunk.update）；任务读取复用原生 github.workItem / codehub.viewTask，单条失败 kind:'unavailable'；openDetail 经原生 openTaskPage（returnToPreviousView 跳过 tasks 哨兵，来源上下文由 cycle-view-state / view-memory 恢复） |
| 总览 | `OverviewPage.tsx`、`overview-project-card.tsx`、`overview-north-star-card.tsx`；`overview-metric-zones.tsx`、`overview-metric-chart.tsx`、`overview-zone-series.ts`；`overview-sdlc-zones.tsx`、`overview-sdlc-readings.ts`、`use-overview-sdlc.ts`；`overview-version-minutes.tsx`、`use-version-minutes.ts`、`overview-view-state.ts`、`overview-snapshot-cache.ts`、`use-overview-history.ts`、`use-overview-metric-collection.ts` | 北极星与业务指标经 nativeMetricsPort 读取；ECharts 共用图表支持特性、显隐、日/周及详情。项目统计沿原生 Git/provider 读取，提交按固定修订分页和 %ct 落桶，PR/MR 按 mergedAt，Issue 只绘当前点；截断或失败保持未知。各版本现行材料按 planRef 核对并独立滚动；目录只读主干基线（主检出）当前文件并标注来源，不列旧快照或已删除版本；页头「更新代码」快进主检出（SSH 走原生远端快进链）并使三类快照就地强制重读（旧值保持显示），「刷新业务指标」独立真实采集；首次准备两种粒度快照，切换与返回只读缓存，筛选按项目/宿主恢复。「配置指标」复用 `version-cycle/metrics-setup` 固定树管线，每次新建会话；指标闭环实施与验证边界见[总览指标 STATUS](../../../../docs/05-features/overview-metrics/STATUS.md) |
| 知识库保真 | `KnowledgePage` + `use-knowledge-repo` + `knowledge-demo-data` | 文档树与正文读 activeRepo，编辑直接保存该仓；分类走内置规则（单仓分类地图能力已删）；代码占位，对账与建议含演示数据 |
| 项目墙 | `ProjectWallPage` + `ProjectWallCard` + `project-page-state`；在 activity 内容槽展示；只上能读到 `.bw/project.toml` 的项目（`use-wall-adoptions` 判据，本机含名片 PR 待合入/已合入未更新边缘；远端名片经 `workbench.charter.read` RPC 按 owner runtime 路由）；`workbench-wall-projects` 纯函数按 ProjectGroup + 远端身份跨主机归并、只认当前配对主机目录内的注册行、同主机重复注册去重（仓链接展示拆在 `wall-repo-links`）；卡内来源主机标签与连接事实（`wall-host-facts`）、工作树计数现算、删除只对本机注册；「导入 Builder 主机」（`builder-hosts-import` + `ImportBuilderHostsDialog`）只调用原生配对批量壳；刷新重读全部主机仓库目录/工作树/名片与四项读数。墙卡读数（`use-wall-readings` 编排 + `wall-card-readings` 纯函数 + main `github/issue-state-batch` 批量状态读回）：版本=原生选版偏好+主干目录校验（与总览当前版本同源；计划树对齐只门控承诺进展的材料新鲜度）、承诺进展=该版本 tasks × Issue 原生状态/关闭原因（只显「完成 x · 开放 y」）、在跑会话=Orca live 口径 × 工作树归属（离线 ≠ 0）、PR 待审=该仓全部 open PR 计数；全部现算、读不到「—」、无健康灯，周次/目标/上次交付/进度条占位已删，对标/目标方向补渲染 | architecture §1、[project-intake spec](../../../../docs/05-features/project-intake/spec.md) 墙卡读数 |
| 接入项目 | `OnboardProjectPage`：在 activity 内容槽展示；本地仓 / 克隆 → `repo.add`；名片经 `bw/project` 固定树 PR 合入被管仓（无远端降级就地写）、克隆前远端预探测回填、同远端去重；墙卡待合入提示 / 更新代码 / 编辑名片（`EditCharterPage`）；成功落总览；名片判据读取与 PR 状态共用 charter RPC 链（probeRemote / submit / status / read） | architecture §1、[project-intake spec](../../../../docs/05-features/project-intake/spec.md) |
| 皮肤 token | `workbench-tokens.css` + `workbench-overview.css`；`version-planning/` 下 version-planning.css（布局）、planning-fields.css（字段）、planning-dialogs.css（对话框）；`version-acceptance/acceptance.css`、`metrics/metric-evidence.css` | `bw-tokens` / hifi-overview；workbench-plan.css 与旧三屏链条已删除 |
| 热加载调试 | `pnpm run dev:workbench`（electron-vite HMR；独立 `workbench-dev` profile） | — |
| 品牌打包 | `ORCA_PRODUCT_NAME` / `build:mac:workbench` | — |
| Workbench Skills | `.claude/skills/{workbench-start,project-knowledge,workbench-release,design-system-import}`；产品剧本正源 `standard/skills/`（week-planning / version-acceptance / metrics-refresh 等），根级 `skills/` Stub 投影由 `config/scripts/generate-bundled-skill-guides.mjs` 生成 | cycle-prompt 内嵌 Stub、指南与 references 经 `ORCA skills get` 按需读取；week-planning 的 planning.py / version-plan.html / data-template.json 已退役删除，check-week-comment.py 保留作历史评论协议；version-report 技能已退役（#332），版本收尾报告并入 workbench-release |

## 隐藏 / 不建

- 独立「会话」导航页（执行面只靠 Projects / 开工）
- 独立「配置」屏（能力在 Settings）
- 原型皮肤对比开关
- Feature wall 营销向导（壳开启时尽量跳过）
- 左栏 Artifacts / Skills 并列入口（收进设置或隐藏）
- **Orca Mobile 产品已删**（`mobile/`、桌面 Mobile 页、手机设置页）；配对协议仍在执行核里，见 `ref/upstream.md`
- `.omc/**` 不进产品提交

## 待完成

- 指标真实项目来源与 Electron 完整旅程待验，边界见[总览指标 STATUS](../../../../docs/05-features/overview-metrics/STATUS.md)；Issue 历史存量需完整事件源
- 知识库真实对账（名片已读 `.bw/project.toml`）
- 名片 PR 链（`bw/project` 固定树 + PR + 预探测 + 更新代码）已实现，真实远端端到端未验（明细见 [project-intake STATUS](../../../../docs/05-features/project-intake/STATUS.md)）
- 知识库文档树已读真实仓库；工作树来源、保存评审边界、ref 分类覆盖、codegraph 与真实对账待对应特性重新决策
- CodeHub 分区列仓对等 GitHub 克隆体验；CodeHub Issue 正文编辑（本轮延期）
