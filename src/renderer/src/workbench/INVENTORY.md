# Workbench 清单（保留 / 待做 / 隐藏）

对照：`loop-buddy` 真壳 screens + `docs/05-features/native-session-execution/prototype-v7.html`。

## 保留（Orca 执行核）

| 能力 | 路径 | 对应保真 |
|------|------|----------|
| App / hydration | `src/renderer/src/App.tsx`, `app-shell/` | 整窗底座 |
| Projects / worktree 树 | `components/sidebar/` | 左栏 Projects |
| 终端 / agent / 建树 | terminal + `worktree-creation-flow` | 执行面 |
| Explorer / SC / Diff | right-sidebar | 执行面右栏 |
| **Tasks** | `components/task-page/` | 独立「任务」页签；原样挂载 Orca TaskPage |
| Automations | `components/automations/` | 自动化屏 |
| Settings | `components/settings/` | 设置（覆盖层形态后续收） |
| main / shared runtime | `src/main`, `src/shared` | 业务语义 |

## 本轮实现（叠层）

| 项 | 落点 | loop-buddy 参考 |
|----|------|-----------------|
| 五屏导航 | `workbench/WorkbenchSidebarNav.tsx` | 总览 / 计划 / **任务** / 自动化 / 知识库；任务入口复用 Orca `SidebarTaskNavButton` |
| 计划屏 | `PlanJourneyShell` + `PlanWeekBoard` | 左栏 bw/week-plan 会话（新开会话注入 SYSTEM.md.tmpl + week-planning 指针）；右栏原生三屏读写 `.bw/planning/<ver>/data.json` |
| 总览保真 | `OverviewPage` + `overview-demo-data` | hifi-overview + `screens/overview`（mock） |
| 知识库保真 | `KnowledgePage` + `knowledge-demo-data` | **V7** 三页签：文档 / 代码 / 对账（约束线 + 编辑器侧栏） |
| 项目墙覆盖层 | `ProjectWallOverlay`；按 `ProjectGroup` 聚合多仓；卡片展示仓链接；`+ 代码仓` / 删除 | `screens/wall` |
| 接入项目 | `OnboardProjectOverlay`：本地仓 / 克隆 + 名片 → `repo.add` + `.bw/project.toml` | `screens/onboard` + architecture §1 |
| 皮肤 token | `workbench-tokens.css` + plan/overview css | `bw-tokens` / prototype-v7 / hifi-overview |
| 热加载调试 | `pnpm run dev:workbench`（electron-vite HMR；独立 `workbench-dev` profile） | — |
| 品牌打包 | `ORCA_PRODUCT_NAME` / `build:mac:workbench` | — |
| Workbench Skills | `.claude/skills/{workbench-start,project-knowledge,version-report,design-system-import}`；产品剧本 `standard/skills/`（week-planning 等）+ `scripts/version-planning` | 从 `origin/main` 迁入；计划页签新开会话注入 skill 指针，三屏读写 JSON |

## 隐藏 / 不建

- 独立「会话」导航页（执行面只靠 Projects / 开工）
- 独立「配置」屏（能力在 Settings）
- 原型皮肤对比开关
- Feature wall 营销向导（壳开启时尽量跳过）
- 左栏 Mobile / Artifacts / Skills 并列入口（收进设置或隐藏）
- `.omc/**` 不进产品提交

## 下一轮（未做）

- 总览 / 知识库 / 项目墙接真采集与健康灯（名片已读 `.bw/project.toml`）
- 项目约定完整路径：`bw/project` 常驻 worktree + MR（现 MVP 写工作区 `.bw/`）
- 设置改为顶层覆盖层（对照 `screens/settings`）
- 知识库接真文档树 / codegraph / asset-audit 会话（现为 V7 演示数据）
- CodeHub 分区列仓对等 GitHub 克隆体验
